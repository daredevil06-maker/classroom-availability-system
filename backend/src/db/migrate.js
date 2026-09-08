const pool = require("./db");

async function migrateDatabase() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Add audit & multi-room proposal columns and ensure status length
        await client.query(`
            ALTER TABLE classroom_requests 
            ALTER COLUMN status TYPE VARCHAR(50),
            ADD COLUMN IF NOT EXISTS proposed_classroom_ids INTEGER[],
            ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(user_id),
            ADD COLUMN IF NOT EXISTS cancelled_by_role VARCHAR(20),
            ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
            ADD COLUMN IF NOT EXISTS reassigned_by INTEGER REFERENCES users(user_id),
            ADD COLUMN IF NOT EXISTS teacher_response VARCHAR(20),
            ADD COLUMN IF NOT EXISTS teacher_response_at TIMESTAMP;
        `);

        // 2. Update status check constraint to include CANCELLED, HOD_REASSIGNMENT_PENDING, REASSIGNMENT_REJECTED
        await client.query(`
            ALTER TABLE classroom_requests
            DROP CONSTRAINT IF EXISTS classroom_requests_status_check;

            ALTER TABLE classroom_requests
            ADD CONSTRAINT classroom_requests_status_check
            CHECK (status IN (
                'PENDING',
                'APPROVED',
                'REJECTED',
                'REASSIGNMENT_PENDING',
                'HOD_REASSIGNMENT_PENDING',
                'REASSIGNMENT_REJECTED',
                'CANCELLED'
            ));
        `);

        await client.query("COMMIT");
        console.log("Database migration completed successfully.");
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Database migration error:", error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = migrateDatabase;

if (require.main === module) {
    migrateDatabase()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
