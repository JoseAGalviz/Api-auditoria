import { getAppPool } from "../config/database.js";

/**
 * Guardar datos de la matriz
 * @route POST /api/matrix
 */
export const saveMatrixData = async (req, res) => {
    try {
        const pool = getAppPool();
        if (!pool) {
            throw new Error("No hay conexión a la base de datos de App");
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
