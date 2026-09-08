const express = require("express");
const pool = require("../db/db");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/auth");

const router = express.Router();


// Get activity priorities
router.get(
    "/priorities",
    authenticateToken,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {

            const result = await pool.query(
                `
                SELECT priority_id, activity_type, priority
                FROM activity_priorities
                ORDER BY priority DESC
                `
            );

            res.json({
                priorities: result.rows
            });

        } catch (error) {

            console.error("Priority fetch error:", error);

            res.status(500).json({
                message: "Server error"
            });
        }
    }
);


// Update activity priority
router.put(
    "/priorities/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {

            const priorityId = req.params.id;
            const { priority } = req.body;

            if (
                priority === undefined ||
                !Number.isInteger(Number(priority)) ||
                Number(priority) < 0
            ) {
                return res.status(400).json({
                    message: "Priority must be a non-negative number"
                });
            }

            const result = await pool.query(
                `
                UPDATE activity_priorities
                SET priority = $1
                WHERE priority_id = $2
                RETURNING *
                `,
                [priority, priorityId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Priority not found"
                });
            }

            res.json({
                message: "Priority updated successfully",
                priority: result.rows[0]
            });

        } catch (error) {

            console.error("Priority update error:", error);

            res.status(500).json({
                message: "Server error"
            });
        }
    }
);

// ============================================================
// ADMIN: GET ALL CLASSROOMS
// ============================================================

router.get(
    "/classrooms",
    authenticateToken,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {

            const result = await pool.query(
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
                ORDER BY building, room_number
                `
            );

            res.json({
                classrooms: result.rows
            });

        } catch (error) {

            console.error("Classroom fetch error:", error);

            res.status(500).json({
                message: "Server error"
            });
        }
    }
);


// ============================================================
// ADMIN: ADD CLASSROOM
// ============================================================

router.post(
    "/classrooms",
    authenticateToken,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {

            const {
                room_number,
                building,
                room_type,
                capacity,
                ac,
                computers,
                audio_system,
                status
            } = req.body;


            if (
                !room_number ||
                !building ||
                !room_type ||
                !capacity
            ) {
                return res.status(400).json({
                    message: "Required classroom fields are missing"
                });
            }


            if (Number(capacity) <= 0) {
                return res.status(400).json({
                    message: "Capacity must be greater than 0"
                });
            }


            const result = await pool.query(
                `
                INSERT INTO classrooms
                (
                    room_number,
                    building,
                    room_type,
                    capacity,
                    ac,
                    computers,
                    audio_system,
                    status
                )
                VALUES
                ($1,$2,$3,$4,$5,$6,$7,$8)
                RETURNING *
                `,
                [
                    room_number,
                    building,
                    room_type,
                    Number(capacity),
                    ac ?? false,
                    computers ?? false,
                    audio_system ?? false,
                    status || "AVAILABLE"
                ]
            );


            res.status(201).json({
                message: "Classroom added successfully",
                classroom: result.rows[0]
            });

        } catch (error) {

            console.error("Classroom add error:", error);

            if (error.code === "23505") {
                return res.status(409).json({
                    message: "This classroom already exists in the building"
                });
            }

            res.status(500).json({
                message: "Server error"
            });
        }
    }
);


// ============================================================
// ADMIN: UPDATE CLASSROOM
// ============================================================

router.put(
    "/classrooms/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    async (req, res) => {
        try {

            const classroomId = req.params.id;

            const {
                room_number,
                building,
                room_type,
                capacity,
                ac,
                computers,
                audio_system,
                status
            } = req.body;


            if (
                !room_number ||
                !building ||
                !room_type ||
                !capacity
            ) {
                return res.status(400).json({
                    message: "Required classroom fields are missing"
                });
            }


            if (Number(capacity) <= 0) {
                return res.status(400).json({
                    message: "Capacity must be greater than 0"
                });
            }


            const result = await pool.query(
                `
                UPDATE classrooms
                SET
                    room_number = $1,
                    building = $2,
                    room_type = $3,
                    capacity = $4,
                    ac = $5,
                    computers = $6,
                    audio_system = $7,
                    status = $8
                WHERE classroom_id = $9
                RETURNING *
                `,
                [
                    room_number,
                    building,
                    room_type,
                    Number(capacity),
                    ac ?? false,
                    computers ?? false,
                    audio_system ?? false,
                    status || "AVAILABLE",
                    classroomId
                ]
            );


            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Classroom not found"
                });
            }


            res.json({
                message: "Classroom updated successfully",
                classroom: result.rows[0]
            });

        } catch (error) {

            console.error("Classroom update error:", error);

            if (error.code === "23505") {
                return res.status(409).json({
                    message: "This classroom already exists in the building"
                });
            }

            res.status(500).json({
                message: "Server error"
            });
        }
    }
);

// ============================================================
// ADMIN: GET TIMETABLE
// ============================================================

router.get(
    "/timetable",
    authenticateToken,
    authorizeRoles("ADMIN"),
    async (req, res) => {

        try {

            const result = await pool.query(
                `
                SELECT
                    t.timetable_id,
                    t.teacher_id,
                    t.classroom_id,
                    t.subject,
                    t.day_of_week,
                    t.start_time,
                    t.end_time,
                    t.schedule_type,
                    t.slot_code,

                    tr.employee_id,
                    u.name AS teacher_name,

                    c.room_number,
                    c.building

                FROM timetable t

                JOIN teachers tr
                    ON t.teacher_id = tr.teacher_id

                JOIN users u
                    ON tr.user_id = u.user_id

                JOIN classrooms c
                    ON t.classroom_id = c.classroom_id

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
                `
            );

            res.json({
                timetable: result.rows
            });

        } catch (error) {

            console.error("Timetable fetch error:", error);

            res.status(500).json({
                message: "Server error"
            });

        }
    }
);


// ============================================================
// ADMIN: GET TEACHERS
// ============================================================

router.get(
    "/teachers",
    authenticateToken,
    authorizeRoles("ADMIN"),
    async (req, res) => {

        try {

            const result = await pool.query(
                `
                SELECT
                    t.teacher_id,
                    t.employee_id,
                    u.name AS teacher_name,
                    t.department

                FROM teachers t

                JOIN users u
                    ON t.user_id = u.user_id

                ORDER BY u.name
                `
            );

            res.json({
                teachers: result.rows
            });

        } catch (error) {

            console.error("Teacher fetch error:", error);

            res.status(500).json({
                message: "Server error"
            });

        }
    }
);


// ============================================================
// ADMIN: ADD TIMETABLE ENTRY
// ============================================================

router.post(
    "/timetable",
    authenticateToken,
    authorizeRoles("ADMIN"),
    async (req, res) => {

        try {

            const {
                teacher_id,
                classroom_id,
                subject,
                day_of_week,
                start_time,
                end_time,
                schedule_type,
                slot_code
            } = req.body;


            if (
                !teacher_id ||
                !classroom_id ||
                !subject ||
                !day_of_week ||
                !start_time ||
                !end_time ||
                !schedule_type ||
                !slot_code
            ) {
                return res.status(400).json({
                    message: "Required timetable fields are missing"
                });
            }


            if (start_time >= end_time) {
                return res.status(400).json({
                    message: "Start time must be before end time"
                });
            }


            const result = await pool.query(
                `
                INSERT INTO timetable
                (
                    teacher_id,
                    classroom_id,
                    subject,
                    day_of_week,
                    start_time,
                    end_time,
                    schedule_type,
                    slot_code
                )
                VALUES
                ($1,$2,$3,$4,$5,$6,$7,$8)
                RETURNING *
                `,
                [
                    teacher_id,
                    classroom_id,
                    subject,
                    day_of_week,
                    start_time,
                    end_time,
                    schedule_type,
                    slot_code
                ]
            );


            res.status(201).json({
                message: "Timetable entry added successfully",
                timetable: result.rows[0]
            });

        } catch (error) {

            console.error("Timetable add error:", error);

            res.status(500).json({
                message: "Server error"
            });

        }
    }
);


// ============================================================
// ADMIN: UPDATE TIMETABLE ENTRY
// ============================================================

router.put(
    "/timetable/:id",
    authenticateToken,
    authorizeRoles("ADMIN"),
    async (req, res) => {

        try {

            const timetableId = req.params.id;

            const {
                teacher_id,
                classroom_id,
                subject,
                day_of_week,
                start_time,
                end_time,
                schedule_type,
                slot_code
            } = req.body;


            if (
                !teacher_id ||
                !classroom_id ||
                !subject ||
                !day_of_week ||
                !start_time ||
                !end_time ||
                !schedule_type ||
                !slot_code
            ) {
                return res.status(400).json({
                    message: "Required timetable fields are missing"
                });
            }


            if (start_time >= end_time) {
                return res.status(400).json({
                    message: "Start time must be before end time"
                });
            }


            const result = await pool.query(
                `
                UPDATE timetable
                SET
                    teacher_id = $1,
                    classroom_id = $2,
                    subject = $3,
                    day_of_week = $4,
                    start_time = $5,
                    end_time = $6,
                    schedule_type = $7,
                    slot_code = $8
                WHERE timetable_id = $9
                RETURNING *
                `,
                [
                    teacher_id,
                    classroom_id,
                    subject,
                    day_of_week,
                    start_time,
                    end_time,
                    schedule_type,
                    slot_code,
                    timetableId
                ]
            );


            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Timetable entry not found"
                });
            }


            res.json({
                message: "Timetable entry updated successfully",
                timetable: result.rows[0]
            });

        } catch (error) {

            console.error("Timetable update error:", error);

            res.status(500).json({
                message: "Server error"
            });

        }
    }
);
module.exports = router;