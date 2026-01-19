import { Router } from "express";
import { getProfitBitrixData } from "../controllers/profitBitrix.controller.js";

const router = Router();

router.get("/", getProfitBitrixData);

export default router;
