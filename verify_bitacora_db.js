import { sql, connectDB, getMysqlPool } from "./src/config/database.js";
import dotenv from "dotenv";
dotenv.config();

async function verifyBitacora() {
    try {
        await connectDB("local"); // Connect to auditoria MySQL
        const pool = getMysqlPool();

        if (!pool) {
            console.error("Pool not established");
            return;
        }

        const [rows] = await pool.query("SELECT codigo_profit, bitacora FROM registros_auditoria LIMIT 5");
        console.log("Sample Data from registros_auditoria:");
        console.table(rows);

        if (rows.length > 0) {
            console.log("\nSuccess: Data is present and reachable.");
        } else {
            console.log("\nNo data found in registros_auditoria.");
        }

    } catch (err) {
        console.error("Verification failed:", err);
    } finally {
        process.exit();
    }
}

verifyBitacora();
