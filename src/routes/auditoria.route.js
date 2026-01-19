import { Router } from "express";
import { crearRegistro } from "../controllers/auditoria.controller.js";

const router = Router();

// Guardar registro
router.post("/", crearRegistro);

export default router;
