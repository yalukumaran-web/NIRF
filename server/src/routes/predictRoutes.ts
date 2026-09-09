import { Router } from "express";
import { upload } from "../middlewares/upload";
import { requireAuth } from "../middlewares/auth";
import { predictFromPdf, listPredictions } from "../controllers/predictController";

const router = Router();

router.post("/predict", requireAuth, upload.single("file"), predictFromPdf);
router.get("/predictions", requireAuth, listPredictions);

export default router;
