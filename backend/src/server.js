const express = require("express");
const cors = require("cors");

const pool = require("./db/db");
const migrateDatabase = require("./db/migrate");

const authRoutes = require("./routes/authRoutes");
const classroomRoutes = require("./routes/classroomRoutes");
const requestRoutes = require("./routes/requestRoutes");
const adminRoutes = require("./routes/adminRoutes");

const {
    authenticateToken,
    authorizeRoles
} = require("./middleware/auth");

require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/classrooms", classroomRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "Classroom Allocation API is running"
    });
});

app.get("/api/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        res.json({
            message: "Database connected successfully",
            time: result.rows[0].now
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Database connection failed"
        });
    }
});

app.get(
    "/api/admin-test",
    authenticateToken,
    authorizeRoles("ADMIN"),
    (req, res) => {
        res.json({
            message: "Welcome Admin!",
            user: req.user
        });
    }
);

const PORT = process.env.PORT || 5000;

migrateDatabase()
    .catch((err) => console.error("Database migration warning:", err))
    .finally(() => {
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    });