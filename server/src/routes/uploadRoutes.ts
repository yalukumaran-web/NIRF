import { Router } from "express";
import { upload } from "../middlewares/upload";
import { requireAuth } from "../middlewares/auth";
import { uploadPdf } from "../controllers/uploadController";

const router = Router();

router.post("/", requireAuth, upload.single("file"), uploadPdf);

export default router;
