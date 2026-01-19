import { Router } from "express";
import { getBitrixCompanies, getAllBitrixCompanies } from "../controllers/cliente.controller.js";

const router = Router();

// IMPORTANTE: Ahora /companies trae TODOS los registros optimizado
// Si necesitas paginación, usa /companies/paginated
router.get("/companies/paginated", getBitrixCompanies);
router.get("/companies", getAllBitrixCompanies);

export default router;