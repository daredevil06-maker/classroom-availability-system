const express = require("express");
const { z } = require("zod");

const pool = require("../db/db");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/auth");

const {
    getValidRooms,
    getPotentialRooms,
    selectBestSingleRoom,
    findBestRoomCombination,
    resolvePriorityConflict,
    lockClassrooms,
    findAlternativeClassrooms
} = require("../services/allocationEngine");

const {
    createStack,
    addRequest,
    processStack
} = require("../services/requestQueue");

const router = express.Router();


// ============================================================
// VALIDATE REQUEST DATA
// ============================================================

const requestSchema = z.object({
    request_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

    start_time: z.string().regex(/^\d{2}:\d{2}$/),

    end_time: z.string().regex(/^\d{2}:\d{2}$/),

    activity_type: z.string().min(1),

    reason: z.string().max(255).optional(),

    participants: z.coerce.number().int().positive(),

});


// ============================================================
// SUBMIT CLASSROOM REQUEST
// ============================================================

router.post(
    "/",
    authenticateToken,
    authorizeRoles("TEACHER", "HOD"),
    async (req, res) => {

        let client;

        try {

            // ====================================================
            // 1. VALIDATE INPUT
            // ====================================================

            const validation =
                requestSchema.safeParse(req.body);

            if (!validation.success) {
                return res.status(400).json({
                    message: "Invalid request data",
                    errors: validation.error.issues
                });
            }

            const {
                request_date,
                start_time,
                end_time,
                activity_type,
                reason,
                participants
            } = validation.data;


            // ====================================================
            // 2. VALIDATE TIME
            // ====================================================

            if (start_time >= end_time) {
                return res.status(400).json({
                    message:
                        "Start time must be before end time"
                });
            }


            // ====================================================
            // 3. GET TEACHER + PRIORITY
            // ====================================================

            client = await pool.connect();

            const teacherResult =
                await client.query(
                    `
                    SELECT teacher_id
                    FROM teachers
                    WHERE user_id = $1
                    `,
                    [req.user.user_id]
                );

            if (teacherResult.rows.length === 0) {
                return res.status(404).json({
                    message:
                        "Teacher profile not found"
                });
            }

            const teacher_id =
                teacherResult.rows[0].teacher_id;


            const priorityResult =
                await client.query(
                    `
                    SELECT priority
                    FROM activity_priorities
                    WHERE LOWER(activity_type)
                        = LOWER($1)
                    `,
                    [activity_type]
                );

            if (priorityResult.rows.length === 0) {
                return res.status(400).json({
                    message:
                        "Invalid activity type"
                });
            }

            const priority =
                priorityResult.rows[0].priority;


            // ====================================================
            // SYSTEM DECIDES SPLITTING
            // ====================================================

            const splittable = true;


            // ====================================================
            // 4. FIND POSSIBLE CLASSROOMS
            //
            // This is only used to determine which requests
            // compete with each other.
            // ====================================================

            const validRooms =
                await getPotentialRooms(
                    client,
                    {
                        requestDate: request_date,
                        startTime: start_time,
                        endTime: end_time,
                        participants: participants,
                        activityType: activity_type,
                        priority: priority
                    }
                );


            if (validRooms.length === 0) {

                return res.status(409).json({
                    message:
                        "No suitable room available in this timing or day. Search in another timing.",
                    participants
                });
            }


            // ====================================================
            // 5. CREATE REQUEST OBJECT FOR QUEUE
            // ====================================================

            const queueRequest = {

                queueId:
                    Date.now() +
                    Math.random(),

                teacherId: teacher_id,

                requestDate: request_date,

                startTime: start_time,

                endTime: end_time,

                activityType: activity_type,

                reason: reason || null,

                participants,

                priority,

                splittable,

                // Important:
                // These are the classrooms that this request
                // could potentially use.
                classroomIds:
                    validRooms.map(
                        room =>
                            room.classroom_id
                    ),

                createdAt: Date.now(),

                resolve: null,

                reject: null
            };


            // ====================================================
            // 6. PROMISE
            //
            // The HTTP request waits until the queue finishes
            // processing this request.
            // ====================================================

            const resultPromise =
                new Promise(
                    (resolve, reject) => {

                        queueRequest.resolve =
                            resolve;

                        queueRequest.reject =
                            reject;
                    }
                );


            // ====================================================
            // 7. ADD TO COMPETING STACK
            // ====================================================

            const queueResult =
                addRequest(queueRequest);


            let stack;

            if (queueResult.competing) {

                // Existing competing stack
                stack =
                    queueResult.stack;

            } else {

                // No competing request.
                // Create a new independent stack.
                stack =
                    createStack(queueRequest);
            }


            // ====================================================
            // 8. START STACK PROCESSING
            //
            // If another request is already processing,
            // processStack simply returns.
            //
            // The existing worker will process this request
            // after the current request finishes.
            // ====================================================

            processStack(
                stack,
                async (request) => {

                    let workerClient;

                    try {

                        workerClient =
                            await pool.connect();

                        await workerClient.query(
                            "BEGIN"
                        );


                        // ========================================
                        // RE-CHECK CLASSROOMS
                        //
                        // Database state may have changed while
                        // this request was waiting in the stack.
                        // ========================================

                        const currentValidRooms =
                            await getValidRooms(
                                workerClient,
                                {
                                    requestDate:
                                        request.requestDate,

                                    startTime:
                                        request.startTime,

                                    endTime:
                                        request.endTime,

                                    participants:
                                        request.participants,

                                    activityType:
                                        request.activityType,

                                    priority:
                                        request.priority
                                }
                            );


                        // ========================================
                        // SINGLE ROOM FIRST
                        // ========================================

                        let singleRoom =
                            selectBestSingleRoom(
                                currentValidRooms,
                                request.participants
                            );

                        let selectedRooms =
                            singleRoom
                                ? [singleRoom]
                                : [];

                        let allocationType =
                            "SINGLE_ROOM";


                        // ========================================
                        // MULTI ROOM IF NECESSARY
                        // ========================================

                        if (
                            selectedRooms.length === 0
                        ) {

                            selectedRooms =
                                findBestRoomCombination(
                                    currentValidRooms,
                                    request.participants
                                );

                            if (!selectedRooms) {

                                await workerClient.query(
                                    "ROLLBACK"
                                );

                                throw new Error(
                                    "No suitable room available in this timing or day. Search in another timing."
                                );
                            }

                            allocationType =
                                "MULTI_ROOM";
                        }


                        // ========================================
                        // LOCK SELECTED CLASSROOMS
                        //
                        // This is the important concurrency
                        // protection.
                        // ========================================

                        const classroomIds =
                            selectedRooms.map(
                                room =>
                                    room.classroom_id
                            );

                        await lockClassrooms(
                            workerClient,
                            classroomIds
                        );


                        // ========================================
                        // RE-CHECK PRIORITY AFTER LOCK
                        // ========================================

                        const displacedRequests = [];


                        for (
                            const room
                            of selectedRooms
                        ) {

                            const conflictResult =
                                await resolvePriorityConflict(
                                    workerClient,

                                    room.classroom_id,

                                    request.requestDate,

                                    request.startTime,

                                    request.endTime,

                                    request.priority
                                );


                            if (
                                !conflictResult.allowed
                            ) {

                                await workerClient.query(
                                    "ROLLBACK"
                                );

                                throw new Error(
                                    conflictResult.reason ||
                                    "Classroom allocation blocked by higher priority activity."
                                );
                            }


                            if (
                                conflictResult.displacedRequests &&
                                conflictResult.displacedRequests.length > 0
                            ) {

                                displacedRequests.push(
                                    ...conflictResult.displacedRequests
                                );
                            }
                        }


                        // ========================================
                        // CREATE REQUEST
                        // ========================================

                        const requestResult =
                            await workerClient.query(
                                `
                                INSERT INTO classroom_requests
                                (
                                    teacher_id,
                                    request_date,
                                    start_time,
                                    end_time,
                                    reason,
                                    activity_type,
                                    priority,
                                    participants,
                                    splittable,
                                    status
                                )
                                VALUES
                                (
                                    $1,
                                    $2,
                                    $3,
                                    $4,
                                    $5,
                                    $6,
                                    $7,
                                    $8,
                                    $9,
                                    'APPROVED'
                                )
                                RETURNING *
                                `,
                                [
                                    request.teacherId,
                                    request.requestDate,
                                    request.startTime,
                                    request.endTime,
                                    request.reason,
                                    request.activityType,
                                    request.priority,
                                    request.participants,
                                    request.splittable
                                ]
                            );


                        const dbRequest =
                            requestResult.rows[0];


                        // ========================================
                        // CREATE ALLOCATIONS
                        // ========================================

                        const allocationResults = [];


                        for (
                            const room
                            of selectedRooms
                        ) {

                            const allocationResult =
                                await workerClient.query(
                                    `
                                    INSERT INTO allocations
                                    (
                                        request_id,
                                        classroom_id,
                                        approved_by
                                    )
                                    VALUES
                                    (
                                        $1,
                                        $2,
                                        NULL
                                    )
                                    RETURNING *
                                    `,
                                    [
                                        dbRequest.request_id,
                                        room.classroom_id
                                    ]
                                );


                            allocationResults.push(
                                allocationResult.rows[0]
                            );
                        }


                        // ========================================
                        // HANDLE DISPLACED LOWER-PRIORITY REQUESTS
                        // IMPORTANT: the high-priority request has
                        // already been inserted and allocated above.
                        // Only now do we process the displaced requests.
                        // ========================================

                        const uniqueDisplacedRequests =
                            Array.from(
                                new Map(
                                    displacedRequests.map(item => [
                                        item.requestId,
                                        item
                                    ])
                                ).values()
                            );

                        for (const displaced of uniqueDisplacedRequests) {

                            const alternativeRooms =
                                await getValidRooms(
                                    workerClient,
                                    {
                                        requestDate: request.requestDate,
                                        startTime: request.startTime,
                                        endTime: request.endTime,
                                        participants: displaced.participants,
                                        activityType: displaced.activityType,
                                        priority: displaced.previousPriority,
                                        ignoreRequestId: displaced.requestId,
                                        excludeClassroomIds: classroomIds
                                    }
                                );

                            // Only completely free rooms are proposed.
                            // This prevents a chain of displacement.
                            const freeAlternativeRooms =
                                alternativeRooms.filter(
                                    room =>
                                        !room.conflictingRequests ||
                                        room.conflictingRequests.length === 0
                                );

                            const alternativeRoom =
                                selectBestSingleRoom(
                                    freeAlternativeRooms,
                                    displaced.participants
                                );

                            let reassignmentReason;

                            if (alternativeRoom) {

                                reassignmentReason =
                                    `Sorry, your requested room was reassigned to ${
                                        request.activityType
                                    }, which has a higher priority (${
                                        request.priority
                                    }). We found an alternative room: ${
                                        alternativeRoom.building
                                    } Room ${
                                        alternativeRoom.room_number
                                    }. Please accept or reject the alternative room.`;

                                await workerClient.query(
                                    `
                                    UPDATE classroom_requests
                                    SET
                                        status = 'REASSIGNMENT_PENDING',
                                        proposed_classroom_id = $1,
                                        reassignment_reason = $2,
                                        reassignment_expires_at = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
                                    WHERE request_id = $3
                                    `,
                                    [
                                        alternativeRoom.classroom_id,
                                        reassignmentReason,
                                        displaced.requestId
                                    ]
                                );

                            } else {

                                reassignmentReason =
                                    `Sorry, your requested room was reassigned to ${
                                        request.activityType
                                    }, which has a higher priority (${
                                        request.priority
                                    }). No suitable alternative classroom is available on this day. Please search for another day.`;

                                await workerClient.query(
                                    `
                                    UPDATE classroom_requests
                                    SET
                                        status = 'REASSIGNMENT_PENDING',
                                        proposed_classroom_id = NULL,
                                        reassignment_reason = $1,
                                        reassignment_expires_at = NULL
                                    WHERE request_id = $2
                                    `,
                                    [
                                        reassignmentReason,
                                        displaced.requestId
                                    ]
                                );
                            }
                        }


                        // ========================================
                        // CAPACITY
                        // ========================================

                        const totalCapacity =
                            selectedRooms.reduce(
                                (total, room) =>
                                    total +
                                    Number(room.capacity),
                                0
                            );


                        const unusedCapacity =
                            totalCapacity -
                            request.participants;


                        // ========================================
                        // COMMIT
                        // ========================================

                        await workerClient.query(
                            "COMMIT"
                        );


                        // ========================================
                        // EXPLANATION
                        // ========================================

                        let explanation;


                        if (
                            allocationType ===
                            "SINGLE_ROOM"
                        ) {

                            const room =
                                selectedRooms[0];

                            explanation =
                                `${request.activityType} with ` +
                                `${request.participants} participants ` +
                                `was allocated to ` +
                                `${room.building} Room ` +
                                `${room.room_number}. ` +
                                `The room has a capacity of ` +
                                `${room.capacity}, leaving ` +
                                `${unusedCapacity} unused capacity. ` +
                                `The allocation satisfies the required ` +
                                `constraints and priority rules.`;

                        } else {

                            const roomNames =
                                selectedRooms
                                    .map(
                                        room =>
                                            `${room.building} Room ${room.room_number}`
                                    )
                                    .join(" + ");

                            explanation =
                                `${request.activityType} with ` +
                                `${request.participants} participants ` +
                                `was distributed across ` +
                                `${roomNames}. ` +
                                `The combined capacity is ` +
                                `${totalCapacity}, leaving ` +
                                `${unusedCapacity} unused capacity. ` +
                                `Multiple rooms were selected because ` +
                                `one suitable room was insufficient.`;
                        }


                        // ========================================
                        // RETURN RESULT TO HTTP REQUEST
                        // ========================================

                        request.resolve({

                            statusCode: 201,

                            body: {

                                message:
                                    "Classroom allocated successfully",

                                allocation_type:
                                    allocationType,

                                request:
                                    dbRequest,

                                rooms:
                                    selectedRooms.map(
                                        room => ({
                                            classroom_id:
                                                room.classroom_id,

                                            room_number:
                                                room.room_number,

                                            building:
                                                room.building,

                                            room_type:
                                                room.room_type,

                                            capacity:
                                                room.capacity,

                                            ac:
                                                room.ac,

                                            computers:
                                                room.computers,

                                            status:
                                                room.status
                                        })
                                    ),

                                total_capacity:
                                    totalCapacity,

                                participants:
                                    request.participants,

                                unused_capacity:
                                    unusedCapacity,

                                priority:
                                    request.priority,

                                displaced_requests:
                                    displacedRequests,

                                explanation
                            }
                        });


                    } catch (error) {

                        try {

                            if (workerClient) {
                                await workerClient.query(
                                    "ROLLBACK"
                                );
                            }

                        } catch (_) {}

                        console.error(
                            "Allocation worker error:",
                            error
                        );

                        request.reject(error);

                    } finally {

                        if (workerClient) {
                            workerClient.release();
                        }
                    }
                }
            );


            // ====================================================
            // 9. WAIT FOR ALLOCATION
            // ====================================================

            const result =
                await resultPromise;


            return res
                .status(result.statusCode)
                .json(result.body);


        } catch (error) {

            console.error(
                "Request error:",
                error
            );

            return res.status(500).json({
                message:
                    error.message ||
                    "Server error"
            });

        } finally {

            if (client) {
                client.release();
            }
        }
    }
);


// ============================================================
// TEACHER: VIEW MY ALLOCATIONS
// ============================================================

router.get(
    "/my",
    authenticateToken,
    authorizeRoles("TEACHER"),
    async (req, res) => {

        try {

            const result = await pool.query(
                `
                SELECT
                    cr.request_id,

                    c.classroom_id,
                    c.room_number,
                    c.building,
                    c.room_type,
                    c.capacity,
                    c.ac,
                    c.computers,
                    c.audio_system,

                    cr.request_date::text AS request_date,
                    cr.start_time,
                    cr.end_time,

                    cr.activity_type,
                    cr.priority,
                    cr.reason,
                    cr.participants,
                    cr.splittable,
                    cr.status,
                    cr.reassignment_reason,
                    cr.proposed_classroom_id,
                    cr.proposed_classroom_ids,
                    cr.reassignment_expires_at,
                    cr.cancelled_by,
                    cr.cancelled_by_role,
                    cr.cancelled_at,
                    cr.cancellation_reason,
                    cr.teacher_response,
                    cr.teacher_response_at,

                    a.allocation_id,
                    a.allocated_at,

                    pc.room_number AS proposed_room_number,
                    pc.building AS proposed_building,
                    pc.room_type AS proposed_room_type,
                    pc.capacity AS proposed_capacity,

                    (
                        SELECT COALESCE(json_agg(json_build_object(
                            'classroom_id', prop_c.classroom_id,
                            'room_number', prop_c.room_number,
                            'building', prop_c.building,
                            'room_type', prop_c.room_type,
                            'capacity', prop_c.capacity,
                            'ac', prop_c.ac,
                            'computers', prop_c.computers,
                            'audio_system', prop_c.audio_system
                        )), '[]'::json)
                        FROM classrooms prop_c
                        WHERE prop_c.classroom_id = ANY(cr.proposed_classroom_ids)
                           OR (cr.proposed_classroom_ids IS NULL AND prop_c.classroom_id = cr.proposed_classroom_id)
                    ) AS proposed_rooms

                FROM classroom_requests cr

                JOIN teachers t
                    ON cr.teacher_id = t.teacher_id

                LEFT JOIN allocations a
                    ON cr.request_id = a.request_id

                LEFT JOIN classrooms c
                    ON a.classroom_id = c.classroom_id

                LEFT JOIN classrooms pc
                    ON cr.proposed_classroom_id = pc.classroom_id

                WHERE t.user_id = $1

                ORDER BY
                    cr.request_id DESC,
                    a.allocation_id ASC
                `,
                [req.user.user_id]
            );


            res.json({
                allocations: result.rows
            });


        } catch (error) {

            console.error(
                "My allocations error:",
                error
            );


            res.status(500).json({
                message: "Server error"
            });
        }
    }
);


// ============================================================
// TEACHER: CANCEL OWN APPROVED REQUEST (DIRECT CANCELLATION)
// ============================================================

router.post(
    "/:requestId/cancel-own",
    authenticateToken,
    authorizeRoles("TEACHER"),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // 1. Verify request belongs to teacher and is APPROVED
            const requestResult = await client.query(
                `
                SELECT cr.request_id, cr.status, cr.activity_type
                FROM classroom_requests cr
                JOIN teachers t ON cr.teacher_id = t.teacher_id
                WHERE cr.request_id = $1
                  AND t.user_id = $2
                FOR UPDATE
                `,
                [req.params.requestId, req.user.user_id]
            );

            if (requestResult.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({
                    message: "Approved request not found for your account"
                });
            }

            const requestRow = requestResult.rows[0];

            if (requestRow.status !== "APPROVED") {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    message: `Only approved requests can be cancelled. Current status is ${requestRow.status}.`
                });
            }

            // 2. Release ALL allocated classrooms (delete all related allocation rows)
            const deletedAllocations = await client.query(
                `DELETE FROM allocations WHERE request_id = $1 RETURNING classroom_id`,
                [requestRow.request_id]
            );

            // 3. Update request status to CANCELLED and store audit details
            await client.query(
                `
                UPDATE classroom_requests
                SET
                    status = 'CANCELLED',
                    cancelled_by = $1,
                    cancelled_by_role = 'TEACHER',
                    cancelled_at = CURRENT_TIMESTAMP,
                    cancellation_reason = 'Voluntarily cancelled by teacher'
                WHERE request_id = $2
                `,
                [req.user.user_id, requestRow.request_id]
            );

            await client.query("COMMIT");

            return res.json({
                message: "Approved classroom request cancelled successfully. All classrooms have been released.",
                released_room_count: deletedAllocations.rowCount
            });

        } catch (error) {
            await client.query("ROLLBACK");
            console.error("Teacher cancel-own error:", error);
            return res.status(500).json({
                message: "Unable to cancel classroom request"
            });
        } finally {
            client.release();
        }
    }
);


// ============================================================
// HOD / ADMIN: GET ALL FACULTY ALLOCATIONS
// ============================================================

router.get(
    "/all-allocations",
    authenticateToken,
    authorizeRoles("HOD", "ADMIN"),
    async (req, res) => {
        try {
            const { department, status, date } = req.query;

            let query = `
                SELECT
                    cr.request_id,
                    cr.request_date::text AS request_date,
                    cr.start_time,
                    cr.end_time,
                    cr.activity_type,
                    cr.priority,
                    cr.reason,
                    cr.participants,
                    cr.splittable,
                    cr.status,
                    cr.created_at,
                    cr.reassignment_reason,
                    cr.proposed_classroom_id,
                    cr.proposed_classroom_ids,
                    cr.reassignment_expires_at,
                    cr.cancelled_by,
                    cr.cancelled_by_role,
                    cr.cancelled_at,
                    cr.cancellation_reason,
                    cr.teacher_response,
                    cr.teacher_response_at,
                    t.teacher_id,
                    t.employee_id,
                    t.department,
                    u.name AS teacher_name,
                    u.email AS teacher_email,
                    COALESCE(
                        json_agg(
                            CASE WHEN a.allocation_id IS NOT NULL THEN
                                json_build_object(
                                    'allocation_id', a.allocation_id,
                                    'classroom_id', c.classroom_id,
                                    'room_number', c.room_number,
                                    'building', c.building,
                                    'room_type', c.room_type,
                                    'capacity', c.capacity,
                                    'ac', c.ac,
                                    'computers', c.computers,
                                    'audio_system', c.audio_system,
                                    'allocated_at', a.allocated_at
                                )
                            ELSE NULL END
                        ) FILTER (WHERE a.allocation_id IS NOT NULL),
                        '[]'::json
                    ) AS allocated_rooms,
                    (
                        SELECT COALESCE(json_agg(json_build_object(
                            'classroom_id', prop_c.classroom_id,
                            'room_number', prop_c.room_number,
                            'building', prop_c.building,
                            'room_type', prop_c.room_type,
                            'capacity', prop_c.capacity,
                            'ac', prop_c.ac,
                            'computers', prop_c.computers,
                            'audio_system', prop_c.audio_system
                        )), '[]'::json)
                        FROM classrooms prop_c
                        WHERE prop_c.classroom_id = ANY(cr.proposed_classroom_ids)
                           OR (cr.proposed_classroom_ids IS NULL AND prop_c.classroom_id = cr.proposed_classroom_id)
                    ) AS proposed_rooms
                FROM classroom_requests cr
                JOIN teachers t ON cr.teacher_id = t.teacher_id
                JOIN users u ON t.user_id = u.user_id
                LEFT JOIN allocations a ON cr.request_id = a.request_id
                LEFT JOIN classrooms c ON a.classroom_id = c.classroom_id
                WHERE 1=1
            `;

            const params = [];

            if (department) {
                params.push(department);
                query += ` AND LOWER(t.department) = LOWER($${params.length})`;
            }

            if (status) {
                params.push(status);
                query += ` AND cr.status = $${params.length}`;
            }

            if (date) {
                params.push(date);
                query += ` AND cr.request_date = $${params.length}::date`;
            }

            query += `
                GROUP BY cr.request_id, t.teacher_id, u.user_id
                ORDER BY cr.request_date DESC, cr.start_time DESC
            `;

            const result = await pool.query(query, params);

            return res.json({
                allocations: result.rows
            });

        } catch (error) {
            console.error("All allocations error:", error);
            return res.status(500).json({
                message: "Unable to load allocations"
            });
        }
    }
);


// ============================================================
// HOD / ADMIN: FIND ALTERNATIVE CLASSROOM
// ============================================================

router.get(
    "/:requestId/find-alternative",
    authenticateToken,
    authorizeRoles("HOD", "ADMIN"),
    async (req, res) => {
        let client;
        try {
            client = await pool.connect();

            // 1. Identify request
            const requestResult = await client.query(
                `
                SELECT
                    cr.request_id,
                    cr.request_date::text AS request_date,
                    cr.start_time,
                    cr.end_time,
                    cr.activity_type,
                    cr.priority,
                    cr.participants,
                    cr.splittable,
                    cr.status,
                    t.department,
                    u.name AS teacher_name
                FROM classroom_requests cr
                JOIN teachers t ON cr.teacher_id = t.teacher_id
                JOIN users u ON t.user_id = u.user_id
                WHERE cr.request_id = $1
                `,
                [req.params.requestId]
            );

            if (requestResult.rows.length === 0) {
                return res.status(404).json({
                    message: "Classroom request not found"
                });
            }

            const request = requestResult.rows[0];

            // 2. Identify currently allocated classrooms
            const currentRoomsResult = await client.query(
                `
                SELECT c.classroom_id, c.room_number, c.building, c.room_type, c.capacity, c.ac, c.computers, c.audio_system
                FROM allocations a
                JOIN classrooms c ON a.classroom_id = c.classroom_id
                WHERE a.request_id = $1
                ORDER BY c.room_number
                `,
                [request.request_id]
            );

            const originalRooms = currentRoomsResult.rows;
            const originalRoomIds = originalRooms.map(r => r.classroom_id);

            // 3. Search for alternative using identical allocation logic
            const alternativeResult = await findAlternativeClassrooms(
                client,
                {
                    requestId: request.request_id,
                    requestDate: request.request_date,
                    startTime: request.start_time,
                    endTime: request.end_time,
                    participants: request.participants,
                    activityType: request.activity_type,
                    priority: request.priority,
                    splittable: request.splittable !== false,
                    excludeClassroomIds: originalRoomIds
                }
            );

            return res.json({
                request: {
                    request_id: request.request_id,
                    teacher_name: request.teacher_name,
                    department: request.department,
                    activity_type: request.activity_type,
                    request_date: request.request_date,
                    start_time: request.start_time,
                    end_time: request.end_time,
                    participants: request.participants,
                    priority: request.priority
                },
                original_rooms: originalRooms,
                ...alternativeResult
            });

        } catch (error) {
            console.error("Find alternative error:", error);
            return res.status(500).json({
                message: "Error searching for alternative classroom"
            });
        } finally {
            if (client) client.release();
        }
    }
);


// ============================================================
// HOD / ADMIN: SUGGEST ALTERNATIVE CLASSROOM TO TEACHER
// ============================================================

router.post(
    "/:requestId/suggest-alternative",
    authenticateToken,
    authorizeRoles("HOD", "ADMIN"),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const { alternative_classroom_ids, message } = req.body;

            if (
                !alternative_classroom_ids ||
                !Array.isArray(alternative_classroom_ids) ||
                alternative_classroom_ids.length === 0
            ) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    message: "alternative_classroom_ids array is required"
                });
            }

            const requestResult = await client.query(
                `
                SELECT request_id, status, activity_type
                FROM classroom_requests
                WHERE request_id = $1
                FOR UPDATE
                `,
                [req.params.requestId]
            );

            if (requestResult.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({
                    message: "Request not found"
                });
            }

            const requestRow = requestResult.rows[0];

            if (
                requestRow.status !== "APPROVED" &&
                requestRow.status !== "REASSIGNMENT_REJECTED" &&
                requestRow.status !== "HOD_REASSIGNMENT_PENDING"
            ) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    message: `Cannot suggest alternative for request with status: ${requestRow.status}`
                });
            }

            // Verify proposed classrooms exist
            const roomsResult = await client.query(
                `
                SELECT classroom_id, room_number, building, capacity
                FROM classrooms
                WHERE classroom_id = ANY($1::int[])
                `,
                [alternative_classroom_ids]
            );

            if (roomsResult.rows.length !== alternative_classroom_ids.length) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    message: "One or more suggested classrooms do not exist"
                });
            }

            const reasonText = message ||
                "Your approved classroom request has been cancelled/reassigned by the HOD because the classroom is required for another activity.";

            // Set state to HOD_REASSIGNMENT_PENDING. Original allocation remains protected.
            await client.query(
                `
                UPDATE classroom_requests
                SET
                    status = 'HOD_REASSIGNMENT_PENDING',
                    proposed_classroom_id = $1,
                    proposed_classroom_ids = $2,
                    reassignment_reason = $3,
                    reassigned_by = $4,
                    teacher_response = 'PENDING',
                    teacher_response_at = NULL,
                    reassignment_expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours'
                WHERE request_id = $5
                `,
                [
                    alternative_classroom_ids[0],
                    alternative_classroom_ids,
                    reasonText,
                    req.user.user_id,
                    requestRow.request_id
                ]
            );

            await client.query("COMMIT");

            return res.json({
                message: "Alternative classroom suggested to teacher successfully",
                suggested_classrooms: roomsResult.rows
            });

        } catch (error) {
            await client.query("ROLLBACK");
            console.error("Suggest alternative error:", error);
            return res.status(500).json({
                message: "Unable to suggest alternative classroom"
            });
        } finally {
            client.release();
        }
    }
);


// ============================================================
// TEACHER: ACCEPT ALTERNATIVE CLASSROOM
// ============================================================

const handleAcceptReassignment = async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const requestResult = await client.query(
            `
            SELECT
                cr.request_id,
                cr.request_date::text AS request_date,
                cr.start_time,
                cr.end_time,
                cr.status,
                cr.proposed_classroom_id,
                cr.proposed_classroom_ids,
                cr.reassignment_expires_at,
                t.teacher_id,
                u.name AS teacher_name
            FROM classroom_requests cr
            JOIN teachers t
                ON cr.teacher_id = t.teacher_id
            JOIN users u
                ON t.user_id = u.user_id
            WHERE cr.request_id = $1
              AND (t.user_id = $2 OR $3 = 'ADMIN')
            FOR UPDATE
            `,
            [req.params.requestId, req.user.user_id, req.user.role]
        );

        if (requestResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Reassignment request not found"
            });
        }

        const requestRow = requestResult.rows[0];

        if (
            requestRow.status !== "HOD_REASSIGNMENT_PENDING" &&
            requestRow.status !== "REASSIGNMENT_PENDING"
        ) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "This reassignment is no longer pending."
            });
        }

        const proposedIds = requestRow.proposed_classroom_ids && requestRow.proposed_classroom_ids.length > 0
            ? requestRow.proposed_classroom_ids
            : (requestRow.proposed_classroom_id ? [requestRow.proposed_classroom_id] : []);

        if (proposedIds.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "No alternative classroom was proposed. Please search for another day."
            });
        }

        // 1. Lock proposed classrooms
        await client.query(
            `
            SELECT classroom_id
            FROM classrooms
            WHERE classroom_id = ANY($1::int[])
            FOR UPDATE
            `,
            [proposedIds]
        );

        // 2. Validate that each proposed classroom is STILL available
        const dayOfWeek = new Date(`${requestRow.request_date}T00:00:00`)
            .toLocaleDateString("en-US", { weekday: "long" });

        for (const roomId of proposedIds) {
            // Check timetable conflict
            const ttConflict = await client.query(
                `
                SELECT 1
                FROM timetable
                WHERE classroom_id = $1
                  AND LOWER(day_of_week) = LOWER($2)
                  AND start_time < $4::time
                  AND end_time > $3::time
                LIMIT 1
                `,
                [
                    roomId,
                    dayOfWeek,
                    requestRow.start_time,
                    requestRow.end_time
                ]
            );

            if (ttConflict.rows.length > 0) {
                await client.query("ROLLBACK");
                return res.status(409).json({
                    message: "One or more proposed classrooms have a timetable conflict. Please contact HOD."
                });
            }

            // Check approved allocation conflict (ignoring current request)
            const allocConflict = await client.query(
                `
                SELECT 1
                FROM allocations a
                JOIN classroom_requests cr ON a.request_id = cr.request_id
                WHERE a.classroom_id = $1
                  AND cr.request_date = $2::date
                  AND cr.status = 'APPROVED'
                  AND cr.start_time < $4::time
                  AND cr.end_time > $3::time
                  AND cr.request_id <> $5
                LIMIT 1
                `,
                [
                    roomId,
                    requestRow.request_date,
                    requestRow.start_time,
                    requestRow.end_time,
                    requestRow.request_id
                ]
            );

            if (allocConflict.rows.length > 0) {
                await client.query("ROLLBACK");
                return res.status(409).json({
                    message: "The proposed classroom is no longer available. Please contact HOD or search for another date/time."
                });
            }
        }

        // 3. Release the original classroom(s)
        await client.query(
            `DELETE FROM allocations WHERE request_id = $1`,
            [requestRow.request_id]
        );

        // 4. Allocate all proposed classrooms
        for (const roomId of proposedIds) {
            await client.query(
                `
                INSERT INTO allocations (request_id, classroom_id, allocated_at, approved_by)
                VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
                `,
                [requestRow.request_id, roomId, req.user.user_id]
            );
        }

        // 5. Update request status back to APPROVED and record teacher response
        await client.query(
            `
            UPDATE classroom_requests
            SET
                status = 'APPROVED',
                teacher_response = 'ACCEPTED',
                teacher_response_at = CURRENT_TIMESTAMP,
                reassignment_reason = NULL,
                proposed_classroom_id = NULL,
                proposed_classroom_ids = NULL,
                reassignment_expires_at = NULL
            WHERE request_id = $1
            `,
            [requestRow.request_id]
        );

        await client.query("COMMIT");

        return res.json({
            message: "Alternative classroom accepted successfully. Your allocation has been updated.",
            allocated_room_count: proposedIds.length
        });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Accept reassignment error:", error);
        return res.status(500).json({
            message: "Unable to accept classroom reassignment"
        });
    } finally {
        client.release();
    }
};

router.post("/reassignments/:requestId/accept", authenticateToken, authorizeRoles("TEACHER", "ADMIN"), handleAcceptReassignment);
router.post("/:requestId/reassignment/accept", authenticateToken, authorizeRoles("TEACHER", "ADMIN"), handleAcceptReassignment);


// ============================================================
// TEACHER: REJECT ALTERNATIVE CLASSROOM
// ============================================================

const handleRejectReassignment = async (req, res) => {
    try {
        const result = await pool.query(
            `
            UPDATE classroom_requests cr
            SET
                status = 'REASSIGNMENT_REJECTED',
                teacher_response = 'REJECTED',
                teacher_response_at = CURRENT_TIMESTAMP
            FROM teachers t
            WHERE cr.request_id = $1
              AND (t.user_id = $2 OR $3 = 'ADMIN')
              AND cr.teacher_id = t.teacher_id
              AND cr.status IN ('HOD_REASSIGNMENT_PENDING', 'REASSIGNMENT_PENDING')
            RETURNING cr.request_id
            `,
            [req.params.requestId, req.user.user_id, req.user.role]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Reassignment request not found or no longer pending"
            });
        }

        // IMPORTANT: Original classrooms remain intact and protected in allocations.
        return res.json({
            message: "Alternative classroom rejected. HOD has been notified."
        });

    } catch (error) {
        console.error("Reject reassignment error:", error);
        return res.status(500).json({
            message: "Unable to reject classroom reassignment"
        });
    }
};

router.post("/reassignments/:requestId/reject", authenticateToken, authorizeRoles("TEACHER", "ADMIN"), handleRejectReassignment);
router.post("/:requestId/reassignment/reject", authenticateToken, authorizeRoles("TEACHER", "ADMIN"), handleRejectReassignment);


// ============================================================
// HOD / ADMIN: CANCEL APPROVED REQUEST (WITH OR WITHOUT ALTERNATIVE)
// ============================================================

router.post(
    "/:requestId/hod-cancel",
    authenticateToken,
    authorizeRoles("HOD", "ADMIN"),
    async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const { reason } = req.body;

            const requestResult = await client.query(
                `
                SELECT cr.request_id, cr.status, u.name AS teacher_name
                FROM classroom_requests cr
                JOIN teachers t ON cr.teacher_id = t.teacher_id
                JOIN users u ON t.user_id = u.user_id
                WHERE cr.request_id = $1
                FOR UPDATE
                `,
                [req.params.requestId]
            );

            if (requestResult.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({
                    message: "Request not found"
                });
            }

            const requestRow = requestResult.rows[0];

            if (requestRow.status === "CANCELLED") {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    message: "This request has already been cancelled"
                });
            }

            // 1. Release ALL allocated classrooms
            const deletedAllocations = await client.query(
                `DELETE FROM allocations WHERE request_id = $1 RETURNING classroom_id`,
                [requestRow.request_id]
            );

            const cancelReason = reason ||
                "Your approved classroom request has been cancelled by the HOD because the classroom is required for another activity. No suitable alternative classroom was available for the requested date/time. Please search for another date/time.";

            // 2. Update request to CANCELLED and preserve audit trail
            await client.query(
                `
                UPDATE classroom_requests
                SET
                    status = 'CANCELLED',
                    cancelled_by = $1,
                    cancelled_by_role = $2,
                    cancelled_at = CURRENT_TIMESTAMP,
                    cancellation_reason = $3,
                    proposed_classroom_id = NULL,
                    proposed_classroom_ids = NULL,
                    reassignment_expires_at = NULL
                WHERE request_id = $4
                `,
                [
                    req.user.user_id,
                    req.user.role,
                    cancelReason,
                    requestRow.request_id
                ]
            );

            await client.query("COMMIT");

            return res.json({
                message: "Approved request cancelled and all classrooms released successfully",
                released_room_count: deletedAllocations.rowCount
            });

        } catch (error) {
            await client.query("ROLLBACK");
            console.error("HOD cancel error:", error);
            return res.status(500).json({
                message: "Unable to cancel classroom request"
            });
        } finally {
            client.release();
        }
    }
);


// ============================================================
// HOD / ADMIN: VIEW REASSIGNMENTS & TEACHER RESPONSES HISTORY
// ============================================================

router.get(
    "/reassignments-history",
    authenticateToken,
    authorizeRoles("HOD", "ADMIN"),
    async (req, res) => {
        try {
            const result = await pool.query(
                `
                SELECT
                    cr.request_id,
                    u.name AS teacher_name,
                    t.department,
                    cr.request_date::text AS request_date,
                    cr.start_time,
                    cr.end_time,
                    cr.activity_type,
                    cr.participants,
                    cr.priority,
                    cr.status,
                    cr.teacher_response,
                    cr.teacher_response_at,
                    cr.reassignment_reason,
                    cr.cancelled_by_role,
                    cr.cancellation_reason,
                    cr.cancelled_at,
                    COALESCE(
                        (
                            SELECT string_agg(c.building || ' ' || c.room_number, ', ')
                            FROM allocations a
                            JOIN classrooms c ON a.classroom_id = c.classroom_id
                            WHERE a.request_id = cr.request_id
                        ),
                        'None (Released)'
                    ) AS current_classrooms,
                    COALESCE(
                        (
                            SELECT string_agg(pc.building || ' ' || pc.room_number, ', ')
                            FROM classrooms pc
                            WHERE pc.classroom_id = ANY(cr.proposed_classroom_ids)
                               OR (cr.proposed_classroom_ids IS NULL AND pc.classroom_id = cr.proposed_classroom_id)
                        ),
                        'None'
                    ) AS suggested_classrooms
                FROM classroom_requests cr
                JOIN teachers t ON cr.teacher_id = t.teacher_id
                JOIN users u ON t.user_id = u.user_id
                WHERE cr.reassigned_by IS NOT NULL
                   OR cr.teacher_response IS NOT NULL
                   OR cr.status IN ('HOD_REASSIGNMENT_PENDING', 'REASSIGNMENT_REJECTED')
                   OR (cr.status = 'CANCELLED' AND cr.cancelled_by_role IN ('HOD', 'ADMIN'))
                ORDER BY COALESCE(cr.teacher_response_at, cr.cancelled_at, cr.created_at) DESC
                `
            );

            return res.json({
                reassignments: result.rows
            });

        } catch (error) {
            console.error("Reassignments history error:", error);
            return res.status(500).json({
                message: "Unable to load reassignment history"
            });
        }
    }
);


// ============================================================
// TEACHER: VIEW MY TIMETABLE
// ============================================================

router.get(
    "/my-timetable",
    authenticateToken,
    authorizeRoles("TEACHER"),
    async (req, res) => {

        try {

            const result = await pool.query(
                `
                SELECT
                    t.timetable_id,
                    t.subject,
                    t.day_of_week,
                    t.start_time,
                    t.end_time,
                    t.schedule_type,
                    t.slot_code,

                    c.classroom_id,
                    c.room_number,
                    c.building,
                    c.room_type,

                    tr.employee_id

                FROM timetable t

                JOIN teachers tr
                    ON t.teacher_id = tr.teacher_id

                JOIN classrooms c
                    ON t.classroom_id = c.classroom_id

                WHERE tr.user_id = $1

                ORDER BY
                    CASE t.day_of_week
                        WHEN 'Monday' THEN 1
                        WHEN 'Tuesday' THEN 2
                        WHEN 'Wednesday' THEN 3
                        WHEN 'Thursday' THEN 4
                        WHEN 'Friday' THEN 5
                        WHEN 'Saturday' THEN 6
                        ELSE 7
                    END,
                    t.start_time
                `,
                [req.user.user_id]
            );


            res.json({
                timetable: result.rows
            });

        } catch (error) {

            console.error("My timetable error:", error);

            res.status(500).json({
                message: "Unable to load timetable"
            });

        }
    }
);

module.exports = router;