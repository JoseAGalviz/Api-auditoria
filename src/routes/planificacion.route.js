import { Router } from "express";
import { savePlanificacion, getPlanificacion } from "../controllers/planificacion.controller.js";

const router = Router();

router.post("/", savePlanificacion);
router.get("/", getPlanificacion);

export default router;
