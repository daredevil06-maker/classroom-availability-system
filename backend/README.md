# Classroom Allocation System - Backend API

Robust, ACID-compliant REST API powering the Timetable-Aware Automated Classroom Allocation System. Built with **Node.js**, **Express 5**, and **PostgreSQL**.

---

## 🚀 Overview

The backend orchestrates the constraint satisfaction engine, concurrency queue, and physical classroom allocations:
- **Zero Timetable Collisions:** Authoritative verification against recurring academic timetables.
- **Dynamic Equipment Filtering:** Disqualifies rooms lacking requisite computing hardware for programming/software activities.
- **Combinatorial Multi-Room Search:** Evaluates combinations when participant counts exceed single-room boundaries.
- **Priority-Driven Preemption:** Handles conflicting demands by comparing activity priority scores (10–95).
- **Concurrency Safety:** Serializes requests via in-memory queue and applies PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) during allocation.

---

## 🛠️ Tech Stack & Dependencies

- **Runtime:** Node.js (v18+)
- **Server Framework:** Express 5 (`express`)
- **Database Client:** `pg` (Node-Postgres connection pool)
- **Validation:** `zod` schema validator
- **Authentication:** `jsonwebtoken` (JWT) & `bcrypt`
- **Development Tooling:** `nodemon` for auto-reloading

---

## 📂 Architecture & Directory Layout

```text
backend/
├── src/
│   ├── db/
│   │   ├── db.js                 # Database connection pool configuration
│   │   └── migrate.js            # Table alterations & status check constraint migrations
│   ├── middleware/
│   │   └── auth.js               # JWT verification & RBAC middleware (ADMIN, HOD, TEACHER)
│   ├── routes/
│   │   ├── adminRoutes.js        # Timetable, classrooms, priorities, and analytics CRUD
│   │   ├── authRoutes.js         # Login & token issuance
│   │   ├── classroomRoutes.js    # Non-colliding classroom discovery
│   │   └── requestRoutes.js      # Allocation, voluntary cancellation & reassignment endpoints
│   ├── services/
│   │   ├── allocationEngine.js   # Constraint solving, combinatorial search & preemption
│   │   └── requestQueue.js       # Serialized queue coordinator preventing race conditions
│   └── server.js                 # App entry point, route mounts & migration check
├── .env.example                  # Environment variable blueprint
├── hashPasswords.js              # Password hashing helper script
├── updatePasswords.js            # Seed/update default user passwords script
├── test-workflow.js              # Automated integration & regression test runner
└── package.json                  # Dependencies and scripts
```

---

## ⚙️ Environment Variables

Create a `.env` file in this directory by copying `.env.example`:

```env
PORT=5000
DB_USER=postgres
DB_HOST=localhost
DB_NAME=classroom_allocation
DB_PASSWORD=your_postgres_password
DB_PORT=5432
JWT_SECRET=classroom_allocation_secret_2026
```

---

## 💻 Available Scripts

In the `backend` directory:

### `npm run dev`
Starts the Express server with `nodemon` for active development and auto-reload on code changes.

### `npm start`
Runs the server in production mode using `node src/server.js`.

### `node updatePasswords.js`
Updates and hashes default passwords for the pre-seeded admin, HOD, and faculty accounts in PostgreSQL.

### `node test-workflow.js`
Runs the end-to-end integration test suite verifying cancellations, multi-room splits, and HOD alternative room assignments.

---

## 📡 API Endpoints Reference

### Auth (`/api/auth`)
- `POST /login` - Validates email and password; returns JWT token and user info.

### Classrooms (`/api/classrooms`)
- `GET /available` - Parameters: `date`, `start_time`, `end_time`. Returns rooms free of timetable and reservation conflicts.

### Requests (`/api/requests`)
- `POST /` - Submit an ad-hoc room reservation request.
- `GET /my-requests` - Fetch current user's requests.
- `GET /timetable` - Fetch current user's recurring timetable slots.
- `PUT /:id/cancel` - Cancel a reservation and release room allocations.
- `POST /:id/respond-reassignment` - Teacher accepts or rejects a reassigned room.
- `GET /hod/overview` - HOD view of departmental requests.
- `POST /hod/:id/suggest-alternative` - HOD proposes an alternative room.

### Admin (`/api/admin`)
- `GET /classrooms` / `POST /classrooms` / `PUT /classrooms/:id` - Classroom inventory CRUD.
- `GET /timetable` / `POST /timetable` / `DELETE /timetable/:id` - Master academic timetable management.
- `GET /priorities` / `PUT /priorities/:id` - Activity priority weight configuration.
