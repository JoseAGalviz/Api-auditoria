
import mysql from "mysql2/promise";

const config = {
    host: "192.168.4.23",
    user: "desarrollo",
    password: "E-xUUctByBsPTe7A",
    database: "app"
};

async function test() {
    try {
        const pool = mysql.createPool(config);
        const [rows] = await pool.query("DESCRIBE gestiones");
        console.log("Columns in 'gestiones':", rows.map(r => r.Field));

        // Also check one row to see date format execution
        const [data] = await pool.query("SELECT * FROM gestiones LIMIT 1");
        console.log("Sample data:", data);

        await pool.end();
    } catch (e) {
        console.error(e);
    }
}

test();
