import { Router } from "express";
import multer from "multer";
import { scoreAbsolute } from "../controllers/absoluteController";

const router = Router();

// Public, stateless calculator endpoint: accepts a PDF upload OR a JSON payload.
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 1 },
});

router.post("/score", memoryUpload.single("file"), scoreAbsolute);

export default router;