
import { sql, remoteConfig } from "./src/config/database.js";

async function checkColumns() {
    try {
        await sql.connect(remoteConfig);
        const result = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'cobros'
        `;
        console.log(result.recordset.map(r => r.COLUMN_NAME));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkColumns();
