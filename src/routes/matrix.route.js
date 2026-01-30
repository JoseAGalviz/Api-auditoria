import { Router } from "express";
import { saveMatrixData, getMatrixData } from "../controllers/matrix.controller.js";


const router = Router();

router.post("/matrix", saveMatrixData); // Manejo de posible typo en la solicitud
router.get("/", getMatrixData);

export default router;
