import { getMysqlPool } from "../config/database.js";
import crypto from "crypto";

/**
 * Guardar planificación
 * @route POST /api/planificacion
 */
export const savePlanificacion = async (req, res) => {
    try {
        const pool = getMysqlPool();
        if (!pool) {
            throw new Error("No hay conexión a la base de datos de Auditoria");
        }

        // Log del payload recibido para depuración
        try {
            console.log("[savePlanificacion] payload recibido:", JSON.stringify(req.body, null, 2));
        } catch (e) {
            // Fallback si JSON.stringify falla
            console.log("[savePlanificacion] payload recibido (no serializable)", req.body);
        }

        // Soporta recibir un único objeto o un array de objetos
        const records = Array.isArray(req.body) ? req.body : [req.body];

        // Si no hay registros en el payload, responder inmediatamente
        if (!records || records.length === 0 || (records.length === 1 && (records[0] === null || Object.keys(records[0]).length === 0))) {
            console.warn('[savePlanificacion] payload vacío o inválido:', req.body);
            return res.status(400).json({ success: false, message: 'Payload vacío o inválido' });
        }

        // Si vienen varios registros en un solo payload, usar un id_planificacion común para todo el lote.
        let batchId = null;
        if (Array.isArray(req.body) && records.length > 1) {
            // Si algún item proporciona id_planificacion, se reutiliza; si no, se genera uno nuevo para el lote.
            const provided = records.find(r => r && r.id_planificacion)?.id_planificacion;
            batchId = provided || crypto.randomUUID();
            console.log(`[savePlanificacion] id_planificacion de lote: ${batchId}`);
        }

        const query = `
            INSERT INTO planificacion (
                id_bitrix,
                id_planificacion,
                codigo_profit,
                nombre_cliente,
                co_ven,
                bitacora,
                obs_ejecutiva,
                semana,
                full_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                nombre_cliente = VALUES(nombre_cliente),
                co_ven = VALUES(co_ven),
                bitacora = VALUES(bitacora),
                obs_ejecutiva = VALUES(obs_ejecutiva),
                semana = VALUES(semana),
                full_data = VALUES(full_data),
                id_planificacion = VALUES(id_planificacion),
                fecha_registro = CURRENT_TIMESTAMP
        `;

        const results = [];

        // Log de la consulta para depuración (sin valores sensibles)
        console.log('[savePlanificacion] consulta SQL preparada');

        for (const item of records) {
            const { id_bitrix, codigo_profit, gestion, full_data } = item;

            // Determinar id_planificacion: si existe batchId usarlo para todos; si no, permitir id por item o generar uno.
            let id_planificacion;
            if (batchId) {
                id_planificacion = batchId;
            } else {
                id_planificacion = item.id_planificacion || crypto.randomUUID();
            }

            const nombre_cliente = full_data?.nombre || null;
            const co_ven = full_data?.co_ven || null;
            const bitacora = gestion?.bitacora || null;
            const obs_ejecutiva = gestion?.obs_ejecutiva || null;
            
            // Lógica para detectar los datos de la semana:
            // Si gestion.semana existe y tiene datos, se usa.
            // Si está vacía y existe auditoria_matriz, se usa auditoria_matriz como fallback.
            let semanaData = gestion?.semana;
            if ((!semanaData || Object.keys(semanaData).length === 0) && gestion?.auditoria_matriz) {
                semanaData = gestion.auditoria_matriz;
            }
            const semana = semanaData ? JSON.stringify(semanaData) : null;
            
            const fullDataJson = full_data ? JSON.stringify(full_data) : null;

            const values = [
                id_bitrix,
                id_planificacion,
                codigo_profit,
                nombre_cliente,
                co_ven,
                bitacora,
                obs_ejecutiva,
                semana,
                fullDataJson
            ];

            // Intentar insertar este registro y registrar errores específicos
            try {
                console.log(`[savePlanificacion] guardando registro id_bitrix=${id_bitrix} id_planificacion=${id_planificacion}`);
                // Log de valores para depuración (puede desaparecer en producción)
                console.debug('[savePlanificacion] valores:', values);

                const [result] = await pool.query(query, values);

                // Log del resultado directo del driver para entender qué retorna
                console.debug('[savePlanificacion] resultado query:', result);

                results.push({
                    id: result.insertId || null,
                    id_bitrix,
                    codigo_profit,
                    id_planificacion,
                    affectedRows: result.affectedRows || null
                });
            } catch (itemError) {
                // Log detallado del error por registro
                console.error("[savePlanificacion] Error al guardar registro:", {
                    id_bitrix,
                    id_planificacion,
                    codigo_profit,
                    error: itemError && itemError.stack ? itemError.stack : itemError.message || itemError
                });

                results.push({
                    id_bitrix,
                    codigo_profit,
                    id_planificacion,
                    error: itemError.message || String(itemError)
                });
            }
        }

        // Si todos los elementos fallaron y no hay filas afectadas, informar con 207 y detalles
        const successCount = results.filter(r => !r.error).length;
        if (successCount === 0) {
            console.warn('[savePlanificacion] Ningún registro insertado/actualizado, revisar logs.');
            return res.status(207).json({ success: false, message: 'Ningún registro insertado/actualizado', count: results.length, data: results });
        }

        res.status(201).json({
            success: true,
            message: "Planificación(s) guardada(s) correctamente",
            count: results.length,
            data: results
        });

    } catch (error) {
        // Log completo del error y payload para facilitar depuración
        console.error("Error en savePlanificacion:", error && error.stack ? error.stack : error);
        try {
            console.error("[savePlanificacion] payload al ocurrir el error:", JSON.stringify(req.body, null, 2));
        } catch (e) {
            console.error("[savePlanificacion] payload al ocurrir el error (no serializable):", req.body);
        }
        res.status(500).json({
            error: "Error al guardar la planificación",
            details: error.message
        });
    }
};

/**
 * Obtener planificaciones
 * @route GET /api/planificacion
 */
export const getPlanificacion = async (req, res) => {
    try {
        const pool = getMysqlPool();
        if (!pool) {
            throw new Error("No hay conexión a la base de datos de Auditoria");
        }

        const { id_planificacion, codigo_profit, id_bitrix } = req.query;

        let query = "SELECT * FROM planificacion";
        const params = [];
        const conditions = [];

        if (id_planificacion) {
            conditions.push("id_planificacion = ?");
            params.push(id_planificacion);
        }

        if (codigo_profit) {
            conditions.push("codigo_profit = ?");
            params.push(codigo_profit);
        }

        if (id_bitrix) {
            conditions.push("id_bitrix = ?");
            params.push(id_bitrix);
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY fecha_registro DESC";

        const [rows] = await pool.query(query, params);

        const data = rows.map(row => {
            let parsedSemana = null;
            let parsedFullData = null;

            try {
                parsedSemana = typeof row.semana === 'string' ? JSON.parse(row.semana) : row.semana;
            } catch (e) {
                parsedSemana = row.semana;
            }

            try {
                parsedFullData = typeof row.full_data === 'string' ? JSON.parse(row.full_data) : row.full_data;
            } catch (e) {
                parsedFullData = row.full_data;
            }

            return {
                ...row,
                semana: parsedSemana,
                full_data: parsedFullData
            };
        });

        res.json({
            success: true,
            count: data.length,
            data: data
        });
    } catch (error) {
        console.error("Error en getPlanificacion:", error);
        res.status(500).json({
            error: "Error al obtener la planificación",
            details: error.message
        });
    }
};
