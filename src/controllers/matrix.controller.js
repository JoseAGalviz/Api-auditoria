import { getMysqlPool } from "../config/database.js";

/**
 * Guardar datos de la matriz
 * @route POST /api/matrix
 */
export const saveMatrixData = async (req, res) => {
    try {
        const pool = getMysqlPool();
        if (!pool) {
            throw new Error("No hay conexión a la base de datos de Auditoria");
        }

        const { id_bitrix, codigo_profit, gestion, full_data } = req.body;

        const nombre_cliente = full_data?.nombre || null;
        const bitacora = gestion?.bitacora || null;
        const obs_ejecutiva = gestion?.obs_ejecutiva || null;
        const semana = gestion?.semana ? JSON.stringify(gestion.semana) : null;
        const auditoria_matriz = gestion?.auditoria_matriz ? JSON.stringify(gestion.auditoria_matriz) : null;

        const query = `
            INSERT INTO matrix (
                id_bitrix, 
                codigo_profit, 
                nombre_cliente, 
                bitacora, 
                obs_ejecutiva, 
                semana, 
                auditoria_matriz
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                nombre_cliente = VALUES(nombre_cliente),
                bitacora = VALUES(bitacora),
                obs_ejecutiva = VALUES(obs_ejecutiva),
                semana = VALUES(semana),
                auditoria_matriz = VALUES(auditoria_matriz),
                fecha_registro = CURRENT_TIMESTAMP
        `;

        const values = [
            id_bitrix,
            codigo_profit,
            nombre_cliente,
            bitacora,
            obs_ejecutiva,
            semana,
            auditoria_matriz
        ];

        const [result] = await pool.query(query, values);

        res.status(201).json({
            success: true,
            message: "Datos de la matriz guardados correctamente",
            data: {
                id: result.insertId,
                id_bitrix,
                codigo_profit
            }
        });

    } catch (error) {
        console.error("Error en saveMatrixData:", error);
        res.status(500).json({
            error: "Error al guardar los datos de la matriz",
            details: error.message
        });
    }
};

/**
 * Obtener datos de la matriz
 * @route GET /api/matrix
 */
export const getMatrixData = async (req, res) => {
    try {
        const pool = getMysqlPool();
        if (!pool) {
            throw new Error("No hay conexión a la base de datos de Auditoria");
        }

        const { codigo_profit } = req.query;

        let query = "SELECT * FROM matrix";
        const values = [];

        if (codigo_profit) {
            query += " WHERE codigo_profit = ?";
            values.push(codigo_profit);
        }

        query += " ORDER BY fecha_registro DESC";

        const [rows] = await pool.query(query, values);

        const processedRows = rows.map(row => ({
            ...row,
            semana: row.semana ? JSON.parse(row.semana) : null,
            auditoria_matriz: row.auditoria_matriz ? JSON.parse(row.auditoria_matriz) : null
        }));

        res.json({
            success: true,
            count: processedRows.length,
            data: processedRows
        });

    } catch (error) {
        console.error("Error en getMatrixData:", error);
        res.status(500).json({
            error: "Error al obtener los datos de la matriz",
            details: error.message
        });
    }
};
