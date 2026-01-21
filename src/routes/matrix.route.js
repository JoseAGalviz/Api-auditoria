import { Router } from "express";
import { saveMatrixData } from "../controllers/matrix.controller.js";

const router = Router();

router.post("/", saveMatrixData);

export default router;
