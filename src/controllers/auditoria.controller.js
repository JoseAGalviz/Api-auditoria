import { getMysqlPool } from "../config/database.js";

/**
 * Guardar registro de auditoría
 * @route POST /api/auditoria
 */
export const crearRegistro = async (req, res) => {
    try {
        const pool = getMysqlPool();
        if (!pool) {
            return res.status(500).json({
                error: "No hay conexión a la base de datos local."
            });
        }

        const {
            id_bitrix,
            codigo_profit,
            gestion,
            full_data
        } = req.body;

        // Validaciones básicas
        if (!id_bitrix || !codigo_profit) {
            return res.status(400).json({
                error: "Faltan campos obligatorios (id_bitrix, codigo_profit)"
            });
        }

        // Extracción de campos principales
        const bitacora = gestion?.bitacora || full_data?.bitacora || "";
        const obs_ejecutiva = gestion?.obs_ejecutiva || full_data?.obs_ejecutiva || "";
        const nombre_cliente = full_data?.nombre || "";
        const plan_semana = gestion?.semana || {};

        // Limpieza de full_data para evitar duplicados en el JSON guardado
        // Eliminamos lo que ya extrajimos o lo que está en 'gestion'
        const datos_cliente = { ...full_data };

        // Lista de campos a eliminar del JSON de detalle porque ya están en columnas o en plan_semana
        const keysToRemove = [
            'id', // id_bitrix
            'id_interno', // redundant usually
            'nombre',
            'codigo_profit',
            'bitacora',
            'obs_ejecutiva',
            // Campos de la semana que vienen planos en full_data
            'lunes_accion', 'lunes_ejecucion',
            'martes_accion', 'martes_ejecucion',
            'miercoles_accion', 'miercoles_ejecucion',
            'jueves_accion', 'jueves_ejecucion',
            'viernes_accion', 'viernes_ejecucion'
        ];

        keysToRemove.forEach(key => delete datos_cliente[key]);

        // Insertar en base de datos
        const [result] = await pool.query(
            `INSERT INTO registros_auditoria 
            (id_bitrix, codigo_profit, nombre_cliente, bitacora, obs_ejecutiva, plan_semana, datos_cliente) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                id_bitrix,
                codigo_profit,
                nombre_cliente,
                bitacora,
                obs_ejecutiva,
                JSON.stringify(plan_semana),
                JSON.stringify(datos_cliente)
            ]
        );

        res.status(201).json({
            success: true,
            message: "Registro de auditoría guardado exitosamente",
            id: result.insertId
        });

    } catch (error) {
        console.error("Error en crearRegistro auditoría:", error);
        res.status(500).json({
            error: "Error al guardar el registro",
            details: error.message
        });
    }
};
