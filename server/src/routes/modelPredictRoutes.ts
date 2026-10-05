import { Router } from "express";
import { upload } from "../middlewares/upload";
import { requireAuth } from "../middlewares/auth";
import { predictModelFromPdf } from "../controllers/predictModelController";

const router = Router();

router.post("/predict-model", requireAuth, upload.single("file"), predictModelFromPdf);

export default router;
