import { getAppPool } from "../config/database.js";

/**
 * Obtener gestiones de la semana actual con día de la semana identificado
 * @route GET /api/gestiones/semana
 */
export const getGestionesPorDia = async (req, res) => {
    try {
        const pool = getAppPool();
        if (!pool) {
            throw new Error("No hay conexión a la base de datos de App");
        }

        // Consulta para obtener gestiones de la semana actual (Lunes a Domingo)
        // WEEK() con mode 1 considera Lunes como primer día de la semana
        // CONVERT_TZ ajusta a zona horaria local (UTC-4)
        const query = `
            SELECT 
                id,
                co_cli,
                tipos, 
                venta_tipoGestion, 
                venta_descripcion, 
                cobranza_tipoGestion, 
                cobranza_descripcion, 
                fecha, 
                ubicacion_lat, 
                ubicacion_lng, 
                fecha_registro,
                CASE DAYOFWEEK(CONVERT_TZ(fecha_registro, '+00:00', '-04:00'))
                    WHEN 1 THEN 'Domingo'
                    WHEN 2 THEN 'Lunes'
                    WHEN 3 THEN 'Martes'
                    WHEN 4 THEN 'Miércoles'
                    WHEN 5 THEN 'Jueves'
                    WHEN 6 THEN 'Viernes'
                    WHEN 7 THEN 'Sábado'
                END as dia_semana
            FROM gestiones
            WHERE YEARWEEK(CONVERT_TZ(fecha_registro, '+00:00', '-04:00'), 1) = YEARWEEK(CURDATE(), 1)
            ORDER BY fecha_registro DESC
        `;

        const [rows] = await pool.query(query);

        res.json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (error) {
        console.error("Error en getGestionesPorDia:", error);
        res.status(500).json({
            error: "Error al obtener gestiones",
            details: error.message
        });
    }
};
