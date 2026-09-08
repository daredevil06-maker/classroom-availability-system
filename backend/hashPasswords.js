const bcrypt = require("bcrypt");

async function main() {
    console.log("admin123:", await bcrypt.hash("admin123", 10));
    console.log("teacher123:", await bcrypt.hash("teacher123", 10));
    console.log("teacher456:", await bcrypt.hash("teacher456", 10));
    console.log("hod123:", await bcrypt.hash("hod123", 10));
}

main();