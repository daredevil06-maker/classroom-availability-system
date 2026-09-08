const bcrypt = require("bcrypt");
const pool = require("./src/db/db");

async function updatePasswords() {
    try {
        const passwords = [
            ["admin@college.com", "admin123"],
            ["kumar@college.com", "teacher123"],
            ["priya@college.com", "teacher456"],
            ["hod@college.com", "hod123"]
        ];

        for (const [email, password] of passwords) {
            const hash = await bcrypt.hash(password, 10);

            await pool.query(
                "UPDATE users SET password = $1 WHERE email = $2",
                [hash, email]
            );

            console.log(`Updated password for ${email}`);
        }

        console.log("All passwords updated successfully.");

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await pool.end();
    }
}

updatePasswords();