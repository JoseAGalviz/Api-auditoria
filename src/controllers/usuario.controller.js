import { getMysqlPool, sql } from "../config/database.js";
import bcrypt from "bcrypt";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";

/**
 * Iniciar sesión
 * @route POST /api/usuarios/login
 */
export const login = async (req, res) => {
    try {
        const pool = getMysqlPool();
        if (!pool) {
            return res.status(500).json({
                error: "No hay conexión a la base de datos local."
            });
        }

        const { usuario, contraseña } = req.body;

        if (!usuario || !contraseña) {
            return res.status(400).json({
                error: "Usuario y contraseña son requeridos"
            });
        }

        // Buscar usuario
        const [rows] = await pool.query(
            "SELECT * FROM usuarios WHERE usuario = ? AND status = 1",
            [usuario]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                error: "Credenciales inválidas"
            });
        }

        const user = rows[0];

        // Verificar contraseña
        const validPassword = await bcrypt.compare(contraseña, user.contraseña_hash);
        if (!validPassword) {
            return res.status(401).json({
                error: "Credenciales inválidas"
            });
        }

        // Generar Token
        const token = jwt.sign(
            {
                id: user.id,
                usuario: user.usuario,
                permisos: typeof user.permisos === 'string' ? JSON.parse(user.permisos) : user.permisos
            },
            process.env.JWT_SECRET || "secreto_super_seguro", // TODO: Mover a .env
            { expiresIn: "24h" }
        );

        // Parsear segmentos y permisos para la respuesta
        const userData = {
            id: user.id,
            usuario: user.usuario,
            segmentos: typeof user.segmentos === 'string' ? JSON.parse(user.segmentos) : user.segmentos,
            permisos: typeof user.permisos === 'string' ? JSON.parse(user.permisos) : user.permisos,
            fecha_registro: user.fecha_registro
        };

        res.json({
            success: true,
            message: "Login exitoso",
            token,
            user: userData
        });

    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({
            error: "Error al iniciar sesión",
            details: error.message
        });
    }
};

/**
 * Crear un nuevo usuario
 * @route POST /api/usuarios/crear
 */
export const crearUsuario = async (req, res) => {
    try {
        const pool = getMysqlPool();
        if (!pool) {
            return res.status(500).json({
                error: "No hay conexión a la base de datos local."
            });
        }

        const {
            usuario,
            segmentos,
            contraseña,
            status = 1,
            permisos = {}
        } = req.body;

        // Validaciones 
        if (!usuario || !contraseña) {
            return res.status(400).json({
                error: "Los campos 'usuario' y 'contraseña' son requeridos."
            });
        }

        // Validar que el usuario no exista
        const [existingUser] = await pool.query(
            "SELECT id FROM usuarios WHERE usuario = ?",
            [usuario]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({
                error: "El usuario ya existe."
            });
        }

        // Encriptar contraseña
        const saltRounds = 10;
        const contraseñaHash = await bcrypt.hash(contraseña, saltRounds);

        // Convertir segmentos y permisos a JSON si son objetos
        const segmentosJson = typeof segmentos === 'object'
            ? JSON.stringify(segmentos)
            : segmentos;

        const permisosJson = typeof permisos === 'object'
            ? JSON.stringify(permisos)
            : permisos;

        // Fecha de registro (hora de Venezuela)
        const fechaRegistro = new Date();

        // Insertar usuario
        const [result] = await pool.query(
            `INSERT INTO usuarios 
       (usuario, segmentos, contraseña_hash, status, permisos, fecha_registro) 
       VALUES (?, ?, ?, ?, ?, ?)`,
            [usuario, segmentosJson, contraseñaHash, status, permisosJson, fechaRegistro]
        );

        res.status(201).json({
            success: true,
            message: "Usuario creado exitosamente",
            data: {
                id: result.insertId,
                usuario,
                segmentos: segmentosJson,
                status,
                permisos: permisosJson,
                fecha_registro: fechaRegistro
            }
        });

    } catch (error) {
        console.error("Error en crearUsuario:", error);
        res.status(500).json({
            error: "Error al crear el usuario",
            details: error.message
        });
    }
};

/**
 * Obtener todos los usuarios
 * @route GET /api/usuarios
 */
export const getUsuarios = async (req, res) => {
    try {
        const pool = getMysqlPool();
        if (!pool) {
            return res.status(500).json({
                error: "No hay conexión a la base de datos local."
            });
        }

        const { status, usuario } = req.query;
        let query = "SELECT id, usuario, segmentos, status, permisos, fecha_registro FROM usuarios";
        const params = [];
        const conditions = [];

        if (status !== undefined) {
            conditions.push("status = ?");
            params.push(status);
        }

        if (usuario) {
            conditions.push("usuario LIKE ?");
            params.push(`%${usuario}%`);
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY fecha_registro DESC";

        const [rows] = await pool.query(query, params);

        // Parsear JSON de segmentos y permisos
        const usuarios = rows.map(row => ({
            ...row,
            segmentos: typeof row.segmentos === 'string'
                ? JSON.parse(row.segmentos)
                : row.segmentos,
            permisos: typeof row.permisos === 'string'
                ? JSON.parse(row.permisos)
                : row.permisos
        }));

        res.json({
            success: true,
            count: usuarios.length,
            data: usuarios
        });

    } catch (error) {
        console.error("Error en getUsuarios:", error);
        res.status(500).json({
            error: "Error al obtener usuarios",
            details: error.message
        });
    }
};

/**
 * Obtener un usuario por ID
 * @route GET /api/usuarios/:id
 */
export const getUsuarioById = async (req, res) => {
    try {
        const pool = getMysqlPool();
        if (!pool) {
            return res.status(500).json({
                error: "No hay conexión a la base de datos local."
            });
        }

        const { id } = req.params;

        const [rows] = await pool.query(
            "SELECT id, usuario, segmentos, status, permisos, fecha_registro FROM usuarios WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Usuario no encontrado"
            });
        }

        const usuario = {
            ...rows[0],
            segmentos: typeof rows[0].segmentos === 'string'
                ? JSON.parse(rows[0].segmentos)
                : rows[0].segmentos,
            permisos: typeof rows[0].permisos === 'string'
                ? JSON.parse(rows[0].permisos)
                : rows[0].permisos
        };

        res.json({
            success: true,
            data: usuario
        });

    } catch (error) {
        console.error("Error en getUsuarioById:", error);
        res.status(500).json({
            error: "Error al obtener el usuario",
            details: error.message
        });
    }
};

/**
 * Actualizar un usuario
 * @route PUT /api/usuarios/:id
 */
export const actualizarUsuario = async (req, res) => {
    try {
        const pool = getMysqlPool();
        if (!pool) {
            return res.status(500).json({
                error: "No hay conexión a la base de datos local."
            });
        }

        const { id } = req.params;
        const { segmentos, contraseña, status, permisos } = req.body;

        // Verificar que el usuario existe
        const [existingUser] = await pool.query(
            "SELECT id FROM usuarios WHERE id = ?",
            [id]
        );

        if (existingUser.length === 0) {
            return res.status(404).json({
                error: "Usuario no encontrado"
            });
        }

        const updates = [];
        const params = [];

        if (segmentos !== undefined) {
            updates.push("segmentos = ?");
            params.push(typeof segmentos === 'object' ? JSON.stringify(segmentos) : segmentos);
        }

        if (contraseña) {
            const saltRounds = 10;
            const contraseñaHash = await bcrypt.hash(contraseña, saltRounds);
            updates.push("contraseña_hash = ?");
            params.push(contraseñaHash);
        }

        if (status !== undefined) {
            updates.push("status = ?");
            params.push(status);
        }

        if (permisos !== undefined) {
            updates.push("permisos = ?");
            params.push(typeof permisos === 'object' ? JSON.stringify(permisos) : permisos);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: "No se proporcionaron campos para actualizar"
            });
        }

        params.push(id);

        const query = `UPDATE usuarios SET ${updates.join(", ")} WHERE id = ?`;
        await pool.query(query, params);

        res.json({
            success: true,
            message: "Usuario actualizado exitosamente"
        });

    } catch (error) {
        console.error("Error en actualizarUsuario:", error);
        res.status(500).json({
            error: "Error al actualizar el usuario",
            details: error.message
        });
    }
};

/**
 * Eliminar un usuario (soft delete - cambiar status a 0)
 * @route DELETE /api/usuarios/:id
 */
export const eliminarUsuario = async (req, res) => {
    try {
        const pool = getMysqlPool();
        if (!pool) {
            return res.status(500).json({
                error: "No hay conexión a la base de datos local."
            });
        }

        const { id } = req.params;
        const { hard = false } = req.query; // hard=true para eliminación permanente

        if (hard === 'true' || hard === true) {
            // Eliminación permanente
            const [result] = await pool.query(
                "DELETE FROM usuarios WHERE id = ?",
                [id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "Usuario no encontrado"
                });
            }

            res.json({
                success: true,
                message: "Usuario eliminado permanentemente"
            });
        } else {
            // Soft delete - cambiar status a 0
            const [result] = await pool.query(
                "UPDATE usuarios SET status = 0 WHERE id = ?",
                [id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: "Usuario no encontrado"
                });
            }

            res.json({
                success: true,
                message: "Usuario desactivado exitosamente"
            });
        }

    } catch (error) {
        console.error("Error en eliminarUsuario:", error);
        res.status(500).json({
            error: "Error al eliminar el usuario",
            details: error.message
        });
    }
};

/**
 * Obtener lista de segmentos desde Bitrix24
 * @route GET /api/usuarios/segmentos
 */
export const getSegmentos = async (req, res) => {
    try {
        const BITRIX_URL = "https://b24-sjdauj.bitrix24.es/rest/5149/b4eirrr8ila4cpzk/crm.company.fields.json";
        const FIELD_ID = "UF_CRM_1638457710";

        const response = await fetch(BITRIX_URL);
        const data = await response.json();

        if (!data.result || !data.result[FIELD_ID]) {
            throw new Error("Campo no encontrado en Bitrix24");
        }

        const field = data.result[FIELD_ID];
        // Bitrix sometimes returns 'items' or 'LIST' for enumeration fields depending on version/context
        const items = field.items || field.LIST || [];

        const segmentos = items.map(item => item.VALUE).sort();

        res.json({
            success: true,
            count: segmentos.length,
            data: segmentos
        });

    } catch (error) {
        console.error("Error en getSegmentos:", error);
        res.status(500).json({
            error: "Error al obtener segmentos de Bitrix24",
            details: error.message
        });
    }
};

/**
 * Obtener segmentos de Profit (SQL Server)
 * @route GET /api/usuarios/segmentos-profit
 */
export const getSegmentosProfit = async (req, res) => {
    try {
        const pool = await sql.connect();
        const result = await pool.request().query("SELECT co_seg, seg_des FROM segmento");

        const segmentos = result.recordset.map(item => ({
            co_seg: typeof item.co_seg === 'string' ? item.co_seg.trim() : item.co_seg,
            seg_des: typeof item.seg_des === 'string' ? item.seg_des.trim() : item.seg_des
        }));

        res.json({
            success: true,
            count: segmentos.length,
            data: segmentos
        });

    } catch (error) {
        console.error("Error en getSegmentosProfit:", error);
        res.status(500).json({
            error: "Error al obtener segmentos de Profit",
            details: error.message
        });
    }
};

