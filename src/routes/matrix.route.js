import { Router } from "express";
import { saveMatrixData, getMatrixData } from "../controllers/matrix.controller.js";

const router = Router();

router.post("/", saveMatrixData);
router.get("/", getMatrixData);

export default router;
