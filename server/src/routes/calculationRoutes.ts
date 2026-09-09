import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  runCalculation,
  listCalculations,
  calculationDetail,
} from "../controllers/calculationController";

const router = Router();

router.use(requireAuth);
router.post("/calculations", runCalculation);
router.get("/calculations", listCalculations);
router.get("/calculations/:id", calculationDetail);

export default router;