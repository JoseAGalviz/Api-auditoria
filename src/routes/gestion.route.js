import { Router } from "express";
import { getGestionesPorDia } from "../controllers/gestion.controller.js";

const router = Router();

router.get("/semana", getGestionesPorDia);

export default router;
