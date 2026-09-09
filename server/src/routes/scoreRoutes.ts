import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  saveMetrics,
  listScores,
  scoreBreakdown,
  setCategory,
} from "../controllers/scoreController";

const router = Router();

router.use(requireAuth);
router.post("/metrics", saveMetrics);
router.get("/scores", listScores);
router.get("/scores/:id/breakdown", scoreBreakdown);
router.put("/category", setCategory);

export default router;
