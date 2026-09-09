import { Router } from "express";
import {
  listInstitutions,
  institutionDetail,
  officialRanking,
} from "../controllers/institutionController";
import { compareInstitutions } from "../controllers/comparisonController";

const router = Router();

router.get("/institutions", listInstitutions);
router.get("/institutions/:id", institutionDetail);
router.get("/rankings/official", officialRanking);
router.post("/comparisons", compareInstitutions);

export default router;