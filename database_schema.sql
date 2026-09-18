-- ============================================================
-- Timetable-Aware Automated Classroom Allocation System
-- PostgreSQL Relational Schema & Seed Data
-- ============================================================

-- Drop existing tables if re-initializing (in reverse dependency order)
DROP TABLE IF EXISTS allocations CASCADE;
DROP TABLE IF EXISTS classroom_requests CASCADE;
DROP TABLE IF EXISTS timetable CASCADE;
DROP TABLE IF EXISTS activity_priorities CASCADE;
DROP TABLE IF EXISTS classrooms CASCADE;
DROP TABLE IF EXISTS teachers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ------------------------------------------------------------
-- 1. USERS TABLE
-- ------------------------------------------------------------
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'HOD', 'TEACHER')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 2. TEACHERS TABLE
-- ------------------------------------------------------------
CREATE TABLE teachers (
    teacher_id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    department VARCHAR(100) NOT NULL
);

-- ------------------------------------------------------------
-- 3. CLASSROOMS TABLE
-- ------------------------------------------------------------
CREATE TABLE classrooms (
    classroom_id SERIAL PRIMARY KEY,
    room_number VARCHAR(50) NOT NULL,
    building VARCHAR(100) NOT NULL,
    room_type VARCHAR(50) NOT NULL, -- e.g., 'Theory', 'Computer Lab', 'Seminar Hall'
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    ac BOOLEAN DEFAULT FALSE,
    computers BOOLEAN DEFAULT FALSE,
    audio_system BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'MAINTENANCE', 'INACTIVE'
    CONSTRAINT unique_room_building UNIQUE (building, room_number)
);

-- ------------------------------------------------------------
-- 4. TIMETABLE TABLE (Authoritative Regular Academic Schedule)
-- ------------------------------------------------------------
CREATE TABLE timetable (
    timetable_id SERIAL PRIMARY KEY,
    classroom_id INTEGER REFERENCES classrooms(classroom_id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES teachers(teacher_id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    day_of_week VARCHAR(20) NOT NULL, -- 'Monday', 'Tuesday', etc.
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    schedule_type VARCHAR(50) DEFAULT 'REGULAR',
    slot_code VARCHAR(50),
    CONSTRAINT chk_timetable_time CHECK (start_time < end_time)
);

-- ------------------------------------------------------------
-- 5. ACTIVITY PRIORITIES TABLE (Dynamic Priority Matrix)
-- ------------------------------------------------------------
CREATE TABLE activity_priorities (
    priority_id SERIAL PRIMARY KEY,
    activity_type VARCHAR(100) UNIQUE NOT NULL,
    priority INTEGER NOT NULL CHECK (priority >= 0)
);

-- ------------------------------------------------------------
-- 6. CLASSROOM REQUESTS TABLE
-- ------------------------------------------------------------
CREATE TABLE classroom_requests (
    request_id SERIAL PRIMARY KEY,
    teacher_id INTEGER REFERENCES teachers(teacher_id) ON DELETE CASCADE,
    request_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    activity_type VARCHAR(100) NOT NULL,
    priority INTEGER NOT NULL,
    participants INTEGER NOT NULL CHECK (participants > 0),
    splittable BOOLEAN DEFAULT TRUE,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'REASSIGNMENT_PENDING',
        'HOD_REASSIGNMENT_PENDING',
        'REASSIGNMENT_REJECTED',
        'CANCELLED'
    )),
    reassignment_reason TEXT,
    proposed_classroom_id INTEGER REFERENCES classrooms(classroom_id) ON DELETE SET NULL,
    proposed_classroom_ids INTEGER[],
    reassignment_expires_at TIMESTAMP,
    cancelled_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    cancelled_by_role VARCHAR(20),
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    reassigned_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    teacher_response VARCHAR(20),
    teacher_response_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_request_time CHECK (start_time < end_time)
);

-- ------------------------------------------------------------
-- 7. ALLOCATIONS TABLE
-- ------------------------------------------------------------
CREATE TABLE allocations (
    allocation_id SERIAL PRIMARY KEY,
    request_id INTEGER REFERENCES classroom_requests(request_id) ON DELETE CASCADE,
    classroom_id INTEGER REFERENCES classrooms(classroom_id) ON DELETE CASCADE,
    allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
);

-- Indices for performance & fast constraint queries
CREATE INDEX idx_timetable_lookup ON timetable (classroom_id, day_of_week, start_time, end_time);
CREATE INDEX idx_allocations_lookup ON allocations (request_id, classroom_id);
CREATE INDEX idx_requests_lookup ON classroom_requests (request_date, start_time, end_time, status);

-- ------------------------------------------------------------
-- SEED DATA
-- ------------------------------------------------------------

-- Seed Users (Passwords will be bcrypt-hashed via updatePasswords.js)
INSERT INTO users (user_id, name, email, password, role) VALUES
(1, 'System Administrator', 'admin@college.com', '$2b$10$wKz0b1TspE9X2q2n88r95evN3P7p0C7s2P8wYJb3L2F8Ie9Z6Lzce', 'ADMIN'),
(2, 'Dr. Kumar (Faculty)', 'kumar@college.com', '$2b$10$wKz0b1TspE9X2q2n88r95evN3P7p0C7s2P8wYJb3L2F8Ie9Z6Lzce', 'TEACHER'),
(3, 'Prof. Priya (Faculty)', 'priya@college.com', '$2b$10$wKz0b1TspE9X2q2n88r95evN3P7p0C7s2P8wYJb3L2F8Ie9Z6Lzce', 'TEACHER'),
(4, 'Dr. Aris (HOD CSE)', 'hod@college.com', '$2b$10$wKz0b1TspE9X2q2n88r95evN3P7p0C7s2P8wYJb3L2F8Ie9Z6Lzce', 'HOD');

SELECT setval('users_user_id_seq', (SELECT MAX(user_id) FROM users));

-- Seed Teachers
INSERT INTO teachers (teacher_id, user_id, employee_id, department) VALUES
(1, 2, 'EMP-CSE-101', 'Computer Science and Engineering'),
(2, 3, 'EMP-CSE-102', 'Computer Science and Engineering'),
(3, 4, 'EMP-CSE-HOD', 'Computer Science and Engineering');

SELECT setval('teachers_teacher_id_seq', (SELECT MAX(teacher_id) FROM teachers));

-- Seed Classrooms
INSERT INTO classrooms (room_number, building, room_type, capacity, ac, computers, audio_system, status) VALUES
('SJT 101', 'Silver Jubilee Tower', 'Theory Classroom', 60, TRUE, FALSE, TRUE, 'AVAILABLE'),
('SJT 102', 'Silver Jubilee Tower', 'Computer Lab', 50, TRUE, TRUE, TRUE, 'AVAILABLE'),
('SJT 103', 'Silver Jubilee Tower', 'Computer Lab', 50, TRUE, TRUE, TRUE, 'AVAILABLE'),
('SJT 201', 'Silver Jubilee Tower', 'Seminar Hall', 120, TRUE, FALSE, TRUE, 'AVAILABLE'),
('SJT 202', 'Silver Jubilee Tower', 'Theory Classroom', 40, FALSE, FALSE, FALSE, 'AVAILABLE'),
('SJT 301', 'Silver Jubilee Tower', 'Advanced Computing Lab', 80, TRUE, TRUE, TRUE, 'AVAILABLE'),
('MB 101',  'Main Building',        'Lecture Hall', 70, TRUE, FALSE, TRUE, 'AVAILABLE'),
('MB 102',  'Main Building',        'Theory Classroom', 45, FALSE, FALSE, FALSE, 'AVAILABLE');

-- Seed Activity Priorities
INSERT INTO activity_priorities (activity_type, priority) VALUES
('Semester Exam', 95),
('Placement Drive', 90),
('Conference / Symposium', 85),
('Guest Lecture', 80),
('Workshop', 70),
('Hackathon', 65),
('HOD Meeting', 60),
('Department Event', 50),
('Extra Class', 40),
('Remedial Class', 30),
('Club Activity', 25),
('Study Group', 15),
('General Meeting', 10);

-- Seed Sample Timetable Entries (Recurring Curriculum Lectures)
INSERT INTO timetable (classroom_id, teacher_id, subject, day_of_week, start_time, end_time, schedule_type, slot_code) VALUES
(1, 1, 'Data Structures & Algorithms', 'Monday', '09:00:00', '10:00:00', 'REGULAR', 'A1'),
(1, 1, 'Data Structures & Algorithms', 'Wednesday', '09:00:00', '10:00:00', 'REGULAR', 'A1'),
(1, 1, 'Data Structures & Algorithms', 'Friday', '09:00:00', '10:00:00', 'REGULAR', 'A1'),
(2, 2, 'Database Systems Lab', 'Tuesday', '14:00:00', '16:00:00', 'LAB', 'L1+L2'),
(2, 2, 'Database Systems Lab', 'Thursday', '14:00:00', '16:00:00', 'LAB', 'L3+L4'),
(4, 3, 'Compiler Design Seminar', 'Friday', '11:00:00', '13:00:00', 'SEMINAR', 'S1');
