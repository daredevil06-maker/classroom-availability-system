const pool = require("../db/db");


// ============================================================
// DETERMINE ACTIVITY REQUIREMENTS
// ============================================================

function getActivityRequirements(activityType) {

    const type = activityType.toLowerCase();

    if (
        type.includes("programming") ||
        type.includes("coding") ||
        type.includes("software") ||
        type.includes("computer")
    ) {
        return {
            computersRequired: true
        };
    }

    return {
        computersRequired: false
    };
}


// ============================================================
// FIND VALID ROOMS
// ============================================================

async function getValidRooms(
    client,
    {
        requestDate,
        startTime,
        endTime,
        participants,
        activityType,
        priority,
        ignoreRequestId = null,
        excludeClassroomIds = []
    }
) {

    const requirements =
        getActivityRequirements(activityType);


    // Find day of week
    const dayOfWeek =
        new Date(`${requestDate}T00:00:00`)
            .toLocaleDateString("en-US", {
                weekday: "long"
            });


    // --------------------------------------------------------
    // Get all available classrooms
    // --------------------------------------------------------

    const roomsResult = await client.query(
        `
        SELECT
            classroom_id,
            room_number,
            building,
            room_type,
            capacity,
            ac,
            computers,
            audio_system,
            status
        FROM classrooms
        WHERE status = 'AVAILABLE'
        ORDER BY capacity ASC
        `
    );


    const validRooms = [];


    // --------------------------------------------------------
    // Check every classroom
    // --------------------------------------------------------

    for (const room of roomsResult.rows) {

        // Do not consider rooms already taken
        // by the new higher-priority allocation.
        if (excludeClassroomIds.includes(room.classroom_id)) {
            continue;
        }
        // ----------------------------------------------------
        // HARD CONSTRAINT 1: Capacity must be valid
        //
        // Do NOT reject rooms just because they are smaller
        // than participants.
        //
        // Smaller rooms may be combined for multi-room
        // allocation.
        // ----------------------------------------------------

        if (room.capacity <= 0) {
            continue;
        }


        // ----------------------------------------------------
        // HARD CONSTRAINT 2: Computer requirement
        // ----------------------------------------------------

        if (
            requirements.computersRequired &&
            !room.computers
        ) {
            continue;
        }


        // ----------------------------------------------------
        // HARD CONSTRAINT 3: Timetable conflict
        // ----------------------------------------------------

        const timetableResult = await client.query(
            `
            SELECT timetable_id
            FROM timetable
            WHERE classroom_id = $1
              AND LOWER(day_of_week) = LOWER($2)
              AND start_time < $4::time
              AND end_time > $3::time
            LIMIT 1
            `,
            [
                room.classroom_id,
                dayOfWeek,
                startTime,
                endTime
            ]
        );


        if (timetableResult.rows.length > 0) {
            continue;
        }


        // ----------------------------------------------------
        // HARD/SOFT CONSTRAINT:
        // Existing approved allocations
        // ----------------------------------------------------

        const allocationResult = await client.query(
            `
            SELECT
                cr.request_id,
                cr.priority,
                cr.activity_type,
                a.allocation_id

            FROM allocations a

            JOIN classroom_requests cr
                ON a.request_id = cr.request_id

            WHERE a.classroom_id = $1
            AND cr.request_date = $2
            AND cr.status = 'APPROVED'
            AND cr.start_time < $4
            AND cr.end_time > $3
            AND ($5::int IS NULL OR cr.request_id <> $5::int)
            FOR UPDATE
            `,
            [
                room.classroom_id,
                requestDate,
                startTime,
                endTime,
                ignoreRequestId
            ]
        );


        const conflicts =
            allocationResult.rows;


        // ----------------------------------------------------
        // If an existing activity has equal or higher
        // priority, this room cannot be used.
        // ----------------------------------------------------

        if (
            conflicts.some(
                conflict =>
                    conflict.priority >= priority
            )
        ) {
            continue;
        }


        // ----------------------------------------------------
        // Room is valid.
        //
        // Lower-priority conflicts are retained because the
        // new request may replace them later.
        // ----------------------------------------------------

        validRooms.push({
            ...room,
            conflictingRequests: conflicts
        });
    }


    return validRooms;
}


// ============================================================
// BEST-FIT SINGLE ROOM
// ============================================================

function selectBestSingleRoom(
    rooms,
    participants
) {

    if (rooms.length === 0) {
        return null;
    }


    // Only rooms that can accommodate everyone
    const suitableRooms =
        rooms.filter(
            room =>
                Number(room.capacity) >=
                Number(participants)
        );


    if (suitableRooms.length === 0) {
        return null;
    }


    // Best fit:
    // minimum unused capacity
    // then room number

    const sortedRooms =
        [...suitableRooms].sort(
            (a, b) => {

                const unusedA =
                    Number(a.capacity) -
                    Number(participants);

                const unusedB =
                    Number(b.capacity) -
                    Number(participants);


                if (unusedA !== unusedB) {
                    return unusedA - unusedB;
                }


                return a.room_number
                    .localeCompare(b.room_number);
            }
        );


    return sortedRooms[0];
}


// ============================================================
// MULTI-ROOM BEST-FIT
// ============================================================

function findBestRoomCombination(
    rooms,
    participants
) {

    let bestCombination = null;


    // --------------------------------------------------------
    // PROXIMITY SCORE
    // Lower score = closer
    // --------------------------------------------------------

    function getProximityScore(selectedRooms) {

        if (selectedRooms.length <= 1) {
            return 0;
        }


        let score = 0;


        // ----------------------------------------------------
        // Prefer same building
        // ----------------------------------------------------

        const buildings =
            new Set(
                selectedRooms.map(
                    room => room.building
                )
            );


        score +=
            (buildings.size - 1) * 1000;


        // ----------------------------------------------------
        // Within same building, prefer rooms with nearby
        // room numbers.
        // ----------------------------------------------------

        for (
            let i = 0;
            i < selectedRooms.length;
            i++
        ) {

            for (
                let j = i + 1;
                j < selectedRooms.length;
                j++
            ) {

                if (
                    selectedRooms[i].building ===
                    selectedRooms[j].building
                ) {

                    const roomA =
                        parseInt(
                            selectedRooms[i].room_number
                        );


                    const roomB =
                        parseInt(
                            selectedRooms[j].room_number
                        );


                    if (
                        !Number.isNaN(roomA) &&
                        !Number.isNaN(roomB)
                    ) {

                        score +=
                            Math.abs(
                                roomA - roomB
                            );
                    }
                }
            }
        }


        return score;
    }


    // --------------------------------------------------------
    // Compare two combinations
    // --------------------------------------------------------

    function isBetterCombination(
        candidate,
        currentBest
    ) {

        if (!currentBest) {
            return true;
        }


        // 1. Minimum number of rooms
        if (
            candidate.rooms.length !==
            currentBest.rooms.length
        ) {

            return (
                candidate.rooms.length <
                currentBest.rooms.length
            );
        }


        // 2. Minimum unused capacity

        const candidateUnused =
            candidate.totalCapacity -
            participants;


        const currentUnused =
            currentBest.totalCapacity -
            participants;


        if (
            candidateUnused !==
            currentUnused
        ) {

            return (
                candidateUnused <
                currentUnused
            );
        }


        // 3. Best proximity

        return (
            candidate.proximityScore <
            currentBest.proximityScore
        );
    }


    // --------------------------------------------------------
    // Search possible room combinations
    // --------------------------------------------------------

    function search(
        startIndex,
        selectedRooms,
        totalCapacity
    ) {

        // Enough capacity found
        if (totalCapacity >= participants) {

            const candidate = {

                rooms: [
                    ...selectedRooms
                ],

                totalCapacity,

                proximityScore:
                    getProximityScore(
                        selectedRooms
                    )
            };


            if (
                isBetterCombination(
                    candidate,
                    bestCombination
                )
            ) {

                bestCombination =
                    candidate;
            }


            return;
        }


        // Try remaining rooms
        for (
            let i = startIndex;
            i < rooms.length;
            i++
        ) {

            selectedRooms.push(
                rooms[i]
            );


            search(
                i + 1,
                selectedRooms,
                totalCapacity +
                    Number(rooms[i].capacity)
            );


            selectedRooms.pop();
        }
    }


    search(
        0,
        [],
        0
    );


    return bestCombination
        ? bestCombination.rooms
        : null;
}

// ============================================================
// FIND POTENTIAL ROOMS FOR COMPETITION DETECTION
// ============================================================

async function getPotentialRooms(
    client,
    {
        requestDate,
        startTime,
        endTime,
        participants,
        activityType
    }
) {
    const requirements =
        getActivityRequirements(activityType);

    const result = await client.query(
        `
        SELECT
            classroom_id,
            room_number,
            building,
            room_type,
            capacity,
            ac,
            computers,
            audio_system,
            status
        FROM classrooms
        WHERE status = 'AVAILABLE'
        ORDER BY building, room_number
        `
    );

    const potentialRooms = [];

    for (const room of result.rows) {

        // ----------------------------------------------------
        // Capacity
        // ----------------------------------------------------

        if (Number(room.capacity) <= 0) {
            continue;
        }

        // ----------------------------------------------------
        // Required computers
        // ----------------------------------------------------

        if (
            requirements.computersRequired &&
            !room.computers
        ) {
            continue;
        }

        // ----------------------------------------------------
        // Required AC
        // ----------------------------------------------------

        if (
            requirements.acRequired &&
            !room.ac
        ) {
            continue;
        }

        // ----------------------------------------------------
        // Required audio system
        // ----------------------------------------------------

        if (
            requirements.audioRequired &&
            !room.audio_system
        ) {
            continue;
        }

        // ----------------------------------------------------
        // Timetable conflict
        // ----------------------------------------------------

        const timetableConflict =
            await client.query(
                `
                SELECT 1
                FROM timetable t
                WHERE t.classroom_id = $1
                  AND LOWER(t.day_of_week) =
                      LOWER(
                          TO_CHAR(
                              $2::date,
                              'FMDay'
                          )
                      )
                  AND t.start_time < $4
                  AND t.end_time > $3
                LIMIT 1
                `,
                [
                    room.classroom_id,
                    requestDate,
                    startTime,
                    endTime
                ]
            );

        if (timetableConflict.rows.length > 0) {
            continue;
        }

        /*
         * IMPORTANT:
         *
         * We deliberately DO NOT check the allocations table here.
         *
         * A room may already be allocated to another request.
         * That is exactly what we need to detect for
         * priority-based competition.
         */

        potentialRooms.push(room);
    }

    return potentialRooms;
}

// ============================================================
// LOCK CLASSROOMS FOR CONCURRENT REQUEST SAFETY
// ============================================================

async function lockClassrooms(client, classroomIds) {

    if (!classroomIds || classroomIds.length === 0) {
        return;
    }

    await client.query(
        `
        SELECT classroom_id
        FROM classrooms
        WHERE classroom_id = ANY($1::int[])
        FOR UPDATE
        `,
        [classroomIds]
    );
}

// ============================================================
// PRIORITY CONFLICT RESOLUTION
// ============================================================

async function resolvePriorityConflict(
    client,
    classroomId,
    requestDate,
    startTime,
    endTime,
    newPriority
) {

    const result = await client.query(
        `
        SELECT
            cr.request_id,
            cr.activity_type,
            cr.priority,
            cr.status,
            cr.participants,
            cr.teacher_id,
            a.allocation_id
        FROM allocations a
        JOIN classroom_requests cr
            ON a.request_id = cr.request_id
        WHERE a.classroom_id = $1
          AND cr.request_date = $2
          AND cr.status = 'APPROVED'
          AND cr.start_time < $4
          AND cr.end_time > $3
        FOR UPDATE
        `,
        [
            classroomId,
            requestDate,
            startTime,
            endTime
        ]
    );

    const conflicts = result.rows;

    // No conflict
    if (conflicts.length === 0) {
        return {
            allowed: true,
            conflicts: []
        };
    }

    const displacedRequests = [];

    for (const conflict of conflicts) {

        // Existing activity has equal or higher priority.
        // New request cannot take this room.
        if (conflict.priority >= newPriority) {

            return {
                allowed: false,
                reason:
                    `Existing ${conflict.activity_type} ` +
                    `has priority ${conflict.priority}, ` +
                    `which is equal to or higher than ` +
                    `the new request priority ${newPriority}.`,
                existingActivity: conflict.activity_type,
                existingPriority: conflict.priority,
                conflicts: []
            };
        }

        // New request has higher priority.
        // Do NOT reject the old request.
        // Return it as a request that needs reassignment.
        displacedRequests.push({
            requestId: conflict.request_id,
            activityType: conflict.activity_type,
            previousPriority: conflict.priority,
            participants: conflict.participants,
            teacherId: conflict.teacher_id,
            allocationId: conflict.allocation_id,
            originalClassroomId: classroomId
        });
    }

    return {
        allowed: true,
        displacedRequests
    };
}

// ============================================================
// FIND ALTERNATIVE CLASSROOMS FOR HOD / ADMIN REASSIGNMENT
// ============================================================

async function findAlternativeClassrooms(
    client,
    {
        requestId,
        requestDate,
        startTime,
        endTime,
        participants,
        activityType,
        priority,
        splittable = true,
        excludeClassroomIds = []
    }
) {
    // 1. Run the SAME classroom suitability logic used by the allocation engine
    const candidateRooms = await getValidRooms(
        client,
        {
            requestDate,
            startTime,
            endTime,
            participants,
            activityType,
            priority,
            ignoreRequestId: requestId,
            excludeClassroomIds
        }
    );

    // 2. Candidate rooms must be completely free of approved allocations
    // Prefer a classroom that is actually available for the complete requested duration
    const freeRooms = candidateRooms.filter(
        room => !room.conflictingRequests || room.conflictingRequests.length === 0
    );

    // 3. Best-fit single room first
    let singleRoom = selectBestSingleRoom(freeRooms, participants);
    let selectedRooms = singleRoom ? [singleRoom] : [];
    let allocationType = "SINGLE_ROOM";

    // 4. If single room insufficient and request is splittable, use multi-room allocation logic
    if (selectedRooms.length === 0 && splittable) {
        selectedRooms = findBestRoomCombination(freeRooms, participants);
        if (selectedRooms && selectedRooms.length > 0) {
            allocationType = "MULTI_ROOM";
        } else {
            selectedRooms = null;
        }
    }

    if (!selectedRooms || selectedRooms.length === 0) {
        return {
            found: false,
            message: "No suitable alternative classroom is available for this date and time."
        };
    }

    const totalCapacity = selectedRooms.reduce(
        (total, room) => total + Number(room.capacity),
        0
    );

    const unusedCapacity = totalCapacity - Number(participants);

    let explanation;
    if (allocationType === "SINGLE_ROOM") {
        const room = selectedRooms[0];
        explanation = `Suggested ${room.building} Room ${room.room_number} (Capacity: ${room.capacity}). ` +
            `It satisfies all mandatory facilities, timetable, and capacity requirements for ${participants} participants, ` +
            `leaving ${unusedCapacity} unused seats.`;
    } else {
        const roomNames = selectedRooms
            .map(r => `${r.building} Room ${r.room_number} (Cap: ${r.capacity})`)
            .join(" + ");
        explanation = `Suggested combination: ${roomNames}. ` +
            `Combined capacity is ${totalCapacity} for ${participants} participants, leaving ${unusedCapacity} unused seats. ` +
            `Satisfies proximity, facility, and timetable constraints.`;
    }

    return {
        found: true,
        rooms: selectedRooms.map(room => ({
            classroom_id: room.classroom_id,
            room_number: room.room_number,
            building: room.building,
            room_type: room.room_type,
            capacity: room.capacity,
            ac: room.ac,
            computers: room.computers,
            audio_system: room.audio_system,
            status: room.status
        })),
        allocationType,
        totalCapacity,
        unusedCapacity,
        explanation
    };
}

// ============================================================
// EXPORT FUNCTIONS
// ============================================================

module.exports = {

    getActivityRequirements,

    getValidRooms,

    getPotentialRooms,

    selectBestSingleRoom,

    findBestRoomCombination,

    resolvePriorityConflict,

    lockClassrooms,

    findAlternativeClassrooms
};