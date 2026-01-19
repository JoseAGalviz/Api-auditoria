import { Router } from "express";
import {
    login,
    crearUsuario,
    getUsuarios,
    getUsuarioById,
    actualizarUsuario,
    eliminarUsuario,
    getSegmentos,
    getSegmentosProfit
} from "../controllers/usuario.controller.js";

const router = Router();

// Login
router.post("/login", login);

// Crear usuario
router.post("/crear", crearUsuario);

// Obtener segmentos de Bitrix24
router.get("/segmentos", getSegmentos);

// Obtener segmentos de Profit (SQL Server)
router.get("/segmentos-profit", getSegmentosProfit);

// Obtener todos los usuarios (con filtros opcionales)
router.get("/", getUsuarios);

// Obtener usuario por ID
router.get("/:id", getUsuarioById);

// Actualizar usuario
router.put("/:id", actualizarUsuario);

// Eliminar usuario (soft delete por defecto, ?hard=true para eliminación permanente)
router.delete("/:id", eliminarUsuario);

export default router;
