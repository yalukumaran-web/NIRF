import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  train,
  datasets,
  trainingRuns,
  modelStatus,
  modelPredict,
} from "../controllers/mlController";

const router = Router();

router.get("/datasets", datasets);
router.get("/training-runs", trainingRuns);
router.get("/model", modelStatus);
router.post("/model/predict", modelPredict);
router.post("/train", requireAuth, requireRole("admin"), train);

export default router;