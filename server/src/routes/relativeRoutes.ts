import { Router } from "express";
import multer from "multer";
import {
  predictRelative,
  trainRelative,
  getRelativeModel,
  getRelativeErrorReport,
} from "../controllers/relativeController";

const router = Router();

// Public, stateless relative-parameter prediction + training endpoints —
// mounted before the auth-wrapped routers, like /api/absolute.
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

router.post("/predict", predictRelative);
router.post("/train", memoryUpload.single("file"), trainRelative);
router.get("/model", getRelativeModel);
router.get("/error-report", getRelativeErrorReport);

export default router;