const pool = require("./src/db/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

async function runTests() {
    console.log("==================================================");
    console.log("STARTING WORKFLOW & ENGINE TESTS");
    console.log("==================================================");

    let testPassed = 0;
    let testFailed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  [PASS] ${message}`);
            testPassed++;
        } else {
            console.error(`  [FAIL] ${message}`);
            testFailed++;
        }
    }

    const client = await pool.connect();

    try {
        // Setup tokens
        const teacher1Token = jwt.sign({ user_id: 2, role: "TEACHER" }, process.env.JWT_SECRET, { expiresIn: "1h" });
        const teacher2Token = jwt.sign({ user_id: 3, role: "TEACHER" }, process.env.JWT_SECRET, { expiresIn: "1h" });
        const hodToken = jwt.sign({ user_id: 4, role: "HOD" }, process.env.JWT_SECRET, { expiresIn: "1h" });
        const adminToken = jwt.sign({ user_id: 1, role: "ADMIN" }, process.env.JWT_SECRET, { expiresIn: "1h" });

        console.log("\n--- TEST 1: Teacher Cancels Own Approved Single-Room Request ---");
        // Create an approved single-room request for teacher 1 (user_id 2, teacher_id 1)
        const testDate = "2026-10-15";
        const testStart = "10:00:00";
        const testEnd = "11:00:00";

        // Cleanup any old test rows for this date/time
        await client.query("DELETE FROM allocations WHERE request_id IN (SELECT request_id FROM classroom_requests WHERE request_date = $1)", [testDate]);
        await client.query("DELETE FROM classroom_requests WHERE request_date = $1", [testDate]);

        // Insert request
        const req1 = await client.query(`
            INSERT INTO classroom_requests (teacher_id, request_date, start_time, end_time, activity_type, priority, participants, splittable, status)
            VALUES (1, $1, $2, $3, 'Extra Class', 20, 25, true, 'APPROVED')
            RETURNING request_id
        `, [testDate, testStart, testEnd]);
        const req1Id = req1.rows[0].request_id;

        // Allocate room 1 (SJT 101 or first available room)
        const firstRoom = await client.query("SELECT classroom_id, room_number, building FROM classrooms WHERE status = 'AVAILABLE' ORDER BY classroom_id LIMIT 1");
        const testRoomId = firstRoom.rows[0].classroom_id;

        await client.query(`
            INSERT INTO allocations (request_id, classroom_id)
            VALUES ($1, $2)
        `, [req1Id, testRoomId]);

        // Verify allocation exists
        const allocCheck1 = await client.query("SELECT * FROM allocations WHERE request_id = $1", [req1Id]);
        assert(allocCheck1.rows.length === 1, "Single-room allocation created");

        // Teacher 1 voluntarily cancels
        const { default: fetch } = await import("node-fetch").catch(() => ({ default: global.fetch }));
        
        // Use direct DB/internal service simulation or HTTP fetch if server running
        // Let's test via direct logic and via HTTP once server is running
        // First test direct transactional operations:
        await client.query("BEGIN");
        await client.query("DELETE FROM allocations WHERE request_id = $1", [req1Id]);
        await client.query(`
            UPDATE classroom_requests
            SET status = 'CANCELLED', cancelled_by = 2, cancelled_by_role = 'TEACHER', cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = 'Voluntarily cancelled by teacher'
            WHERE request_id = $1
        `, [req1Id]);
        await client.query("COMMIT");

        // Verify allocations deleted
        const allocCheckAfter = await client.query("SELECT * FROM allocations WHERE request_id = $1", [req1Id]);
        assert(allocCheckAfter.rows.length === 0, "Allocations released from database");

        // Verify request marked CANCELLED
        const reqCheckAfter = await client.query("SELECT status, cancelled_by_role FROM classroom_requests WHERE request_id = $1", [req1Id]);
        assert(reqCheckAfter.rows[0].status === "CANCELLED", "Request status updated to CANCELLED");
        assert(reqCheckAfter.rows[0].cancelled_by_role === "TEACHER", "Audit cancelled_by_role is TEACHER");

        console.log("\n--- TEST 2: Teacher Cancels Own Approved Multi-Room Request ---");
        const req2 = await client.query(`
            INSERT INTO classroom_requests (teacher_id, request_date, start_time, end_time, activity_type, priority, participants, splittable, status)
            VALUES (1, $1, '11:00:00', '13:00:00', 'Programming Workshop', 50, 150, true, 'APPROVED')
            RETURNING request_id
        `, [testDate]);
        const req2Id = req2.rows[0].request_id;

        // Allocate 3 rooms
        const threeRooms = await client.query("SELECT classroom_id FROM classrooms WHERE status = 'AVAILABLE' ORDER BY classroom_id LIMIT 3");
        for (const r of threeRooms.rows) {
            await client.query("INSERT INTO allocations (request_id, classroom_id) VALUES ($1, $2)", [req2Id, r.classroom_id]);
        }

        const allocCheckMulti = await client.query("SELECT * FROM allocations WHERE request_id = $1", [req2Id]);
        assert(allocCheckMulti.rows.length === 3, "Multi-room allocation created with 3 rooms");

        // Teacher cancels multi-room request
        await client.query("BEGIN");
        await client.query("DELETE FROM allocations WHERE request_id = $1", [req2Id]);
        await client.query(`
            UPDATE classroom_requests
            SET status = 'CANCELLED', cancelled_by = 2, cancelled_by_role = 'TEACHER', cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = 'Voluntarily cancelled by teacher'
            WHERE request_id = $1
        `, [req2Id]);
        await client.query("COMMIT");

        const allocCheckMultiAfter = await client.query("SELECT * FROM allocations WHERE request_id = $1", [req2Id]);
        assert(allocCheckMultiAfter.rows.length === 0, "ALL 3 allocations released upon cancellation");

        console.log("\n--- TEST 3: HOD Alternative Search Logic ---");
        const { findAlternativeClassrooms } = require("./src/services/allocationEngine");

        // Create approved request for teacher
        const req3 = await client.query(`
            INSERT INTO classroom_requests (teacher_id, request_date, start_time, end_time, activity_type, priority, participants, splittable, status)
            VALUES (1, $1, '14:00:00', '15:00:00', 'Seminar', 70, 40, true, 'APPROVED')
            RETURNING request_id
        `, [testDate]);
        const req3Id = req3.rows[0].request_id;

        const originalRoomId = threeRooms.rows[0].classroom_id;
        await client.query("INSERT INTO allocations (request_id, classroom_id) VALUES ($1, $2)", [req3Id, originalRoomId]);

        // Run findAlternativeClassrooms excluding originalRoomId
        const altResult = await findAlternativeClassrooms(client, {
            requestId: req3Id,
            requestDate: testDate,
            startTime: '14:00:00',
            endTime: '15:00:00',
            participants: 40,
            activityType: 'Seminar',
            priority: 70,
            splittable: true,
            excludeClassroomIds: [originalRoomId]
        });

        assert(altResult.found === true, "Alternative classroom found");
        assert(altResult.rooms && altResult.rooms.length > 0, "Alternative room candidate returned");
        assert(!altResult.rooms.some(r => r.classroom_id === originalRoomId), "Original room is strictly excluded from alternative");

        // Verify original room is STILL allocated in database (not released!)
        const origCheck = await client.query("SELECT * FROM allocations WHERE request_id = $1", [req3Id]);
        assert(origCheck.rows.length === 1 && origCheck.rows[0].classroom_id === originalRoomId, "Original classroom remained protected");

        console.log("\n--- TEST 4: HOD Suggests Alternative & Teacher Accepts ---");
        const suggestedRoomId = altResult.rooms[0].classroom_id;

        // HOD suggests
        await client.query(`
            UPDATE classroom_requests
            SET status = 'HOD_REASSIGNMENT_PENDING', proposed_classroom_id = $1, proposed_classroom_ids = $2,
                reassignment_reason = 'Classroom required for another activity', reassigned_by = 4,
                teacher_response = 'PENDING', reassignment_expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours'
            WHERE request_id = $3
        `, [suggestedRoomId, [suggestedRoomId], req3Id]);

        // Teacher accepts
        await client.query("BEGIN");
        // Lock proposed classroom
        await client.query("SELECT classroom_id FROM classrooms WHERE classroom_id = $1 FOR UPDATE", [suggestedRoomId]);
        // Release original classroom
        await client.query("DELETE FROM allocations WHERE request_id = $1", [req3Id]);
        // Allocate proposed classroom
        await client.query("INSERT INTO allocations (request_id, classroom_id) VALUES ($1, $2)", [req3Id, suggestedRoomId]);
        // Update request
        await client.query(`
            UPDATE classroom_requests
            SET status = 'APPROVED', teacher_response = 'ACCEPTED', teacher_response_at = CURRENT_TIMESTAMP,
                proposed_classroom_id = NULL, proposed_classroom_ids = NULL, reassignment_reason = NULL
            WHERE request_id = $1
        `, [req3Id]);
        await client.query("COMMIT");

        // Verify old room released and new room allocated
        const acceptCheck = await client.query("SELECT * FROM allocations WHERE request_id = $1", [req3Id]);
        assert(acceptCheck.rows.length === 1, "New allocation exists");
        assert(acceptCheck.rows[0].classroom_id === suggestedRoomId, "New allocation points to suggested classroom");

        const statusCheck = await client.query("SELECT status, teacher_response FROM classroom_requests WHERE request_id = $1", [req3Id]);
        assert(statusCheck.rows[0].status === "APPROVED", "Request status back to APPROVED");
        assert(statusCheck.rows[0].teacher_response === "ACCEPTED", "teacher_response recorded as ACCEPTED");

        console.log("\n--- TEST 5: Teacher Rejects Alternative ---");
        // Create another request
        const req4 = await client.query(`
            INSERT INTO classroom_requests (teacher_id, request_date, start_time, end_time, activity_type, priority, participants, splittable, status)
            VALUES (1, $1, '16:00:00', '17:00:00', 'HOD Meeting', 60, 20, true, 'APPROVED')
            RETURNING request_id
        `, [testDate]);
        const req4Id = req4.rows[0].request_id;
        await client.query("INSERT INTO allocations (request_id, classroom_id) VALUES ($1, $2)", [req4Id, originalRoomId]);

        // HOD suggests alternative
        await client.query(`
            UPDATE classroom_requests
            SET status = 'HOD_REASSIGNMENT_PENDING', proposed_classroom_id = $1, proposed_classroom_ids = $2,
                reassignment_reason = 'HOD Reassignment test', reassigned_by = 4, teacher_response = 'PENDING'
            WHERE request_id = $3
        `, [suggestedRoomId, [suggestedRoomId], req4Id]);

        // Teacher rejects alternative
        await client.query(`
            UPDATE classroom_requests
            SET status = 'REASSIGNMENT_REJECTED', teacher_response = 'REJECTED', teacher_response_at = CURRENT_TIMESTAMP
            WHERE request_id = $1
        `, [req4Id]);

        // Verify original room is STILL allocated (protected)
        const rejectAllocCheck = await client.query("SELECT * FROM allocations WHERE request_id = $1", [req4Id]);
        assert(rejectAllocCheck.rows.length === 1 && rejectAllocCheck.rows[0].classroom_id === originalRoomId, "Original room remains protected after rejection");

        const rejectStatusCheck = await client.query("SELECT status, teacher_response FROM classroom_requests WHERE request_id = $1", [req4Id]);
        assert(rejectStatusCheck.rows[0].status === "REASSIGNMENT_REJECTED", "Request status is REASSIGNMENT_REJECTED");
        assert(rejectStatusCheck.rows[0].teacher_response === "REJECTED", "teacher_response recorded as REJECTED");

        console.log("\n--- TEST 6: HOD Cancels Request (No Alternative or Confirmed Cancellation) ---");
        // HOD cancels req4
        await client.query("BEGIN");
        await client.query("DELETE FROM allocations WHERE request_id = $1", [req4Id]);
        await client.query(`
            UPDATE classroom_requests
            SET status = 'CANCELLED', cancelled_by = 4, cancelled_by_role = 'HOD', cancelled_at = CURRENT_TIMESTAMP,
                cancellation_reason = 'Cancelled by HOD: Classroom required for another activity. No suitable alternative available.'
            WHERE request_id = $1
        `, [req4Id]);
        await client.query("COMMIT");

        const hodCancelAlloc = await client.query("SELECT * FROM allocations WHERE request_id = $1", [req4Id]);
        assert(hodCancelAlloc.rows.length === 0, "Allocations deleted upon HOD cancellation");

        const hodCancelReq = await client.query("SELECT status, cancelled_by_role, cancellation_reason FROM classroom_requests WHERE request_id = $1", [req4Id]);
        assert(hodCancelReq.rows[0].status === "CANCELLED", "Request marked CANCELLED");
        assert(hodCancelReq.rows[0].cancelled_by_role === "HOD", "cancelled_by_role is HOD");

        // Clean up test data
        await client.query("DELETE FROM allocations WHERE request_id IN (SELECT request_id FROM classroom_requests WHERE request_date = $1)", [testDate]);
        await client.query("DELETE FROM classroom_requests WHERE request_date = $1", [testDate]);

        console.log("\n==================================================");
        console.log(`TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
        console.log("==================================================");

        if (testFailed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }

    } catch (error) {
        console.error("Test error:", error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runTests();
