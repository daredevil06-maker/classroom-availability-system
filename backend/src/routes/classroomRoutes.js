const express = require("express");
const { z } = require("zod");

const pool = require("../db/db");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/auth");

const router = express.Router();


// Validation schema
const availabilitySchema = z.object({
    date: z.string().regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Date must be in YYYY-MM-DD format"
    ),

    start_time: z.string().regex(
        /^\d{2}:\d{2}$/,
        "Start time must be in HH:MM format"
    ),

    end_time: z.string().regex(
        /^\d{2}:\d{2}$/,
        "End time must be in HH:MM format"
    )
});


// GET AVAILABLE CLASSROOMS

router.get(
    "/available",
    authenticateToken,
    authorizeRoles("TEACHER", "HOD", "ADMIN"),
    async (req, res) => {

        try {

            const {
                date,
                start_time,
                end_time
            } = req.query;

            // 1. Validate input
            if (!date || !start_time || !end_time) {
                return res.status(400).json({
                    message: "Date, start time and end time are required"
                });
            }

            if (start_time >= end_time) {
                return res.status(400).json({
                    message: "Start time must be before end time"
                });
            }

            // 2. Find day of week
            const dateObject =
                new Date(`${date}T00:00:00Z`);

            if (isNaN(dateObject.getTime())) {
                return res.status(400).json({
                    message: "Invalid date"
                });
            }

            const days = [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday"
            ];

            const dayOfWeek =
                days[dateObject.getUTCDay()];

            // 3. Find all operational classrooms
            const roomsResult = await pool.query(
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

            const availableClassrooms = [];

            // 4. Check every classroom
            for (const room of roomsResult.rows) {

                // Capacity must be valid
                if (!room.capacity || room.capacity <= 0) {
                    continue;
                }

                // 5. Check regular timetable conflict
                const timetableResult = await pool.query(
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
                        start_time,
                        end_time
                    ]
                );

                if (timetableResult.rows.length > 0) {
                    continue;
                }

                // 6. Check existing approved allocations
                const allocationResult = await pool.query(
                    `
                    SELECT
                        a.allocation_id,
                        cr.request_id,
                        cr.activity_type,
                        cr.priority
                    FROM allocations a
                    JOIN classroom_requests cr
                        ON a.request_id = cr.request_id
                    WHERE a.classroom_id = $1
                      AND cr.request_date = $2::date
                      AND cr.status = 'APPROVED'
                      AND cr.start_time < $4::time
                      AND cr.end_time > $3::time
                    LIMIT 1
                    `,
                    [
                        room.classroom_id,
                        date,
                        start_time,
                        end_time
                    ]
                );

                // Occupied by an approved allocation
                if (allocationResult.rows.length > 0) {
                    continue;
                }

                // 7. Classroom is available
                availableClassrooms.push(room);
            }

            // 8. Return result
            res.json({
                date,
                start_time,
                end_time,
                day_of_week: dayOfWeek,
                available_classrooms: availableClassrooms
            });

        } catch (error) {

            console.error(
                "Availability error:",
                error
            );

            res.status(500).json({
                message: "Server error"
            });
        }
    }
);


module.exports = router;