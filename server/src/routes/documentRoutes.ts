import { Router } from "express";
import { upload } from "../middlewares/upload";
import { requireAuth } from "../middlewares/auth";
import {
  uploadDocument,
  listMyDocuments,
  documentDetail,
  confirmDocument,
} from "../controllers/documentController";

const router = Router();

router.post("/", requireAuth, upload.single("file"), uploadDocument);
router.get("/", requireAuth, listMyDocuments);
router.get("/:id", requireAuth, documentDetail);
router.post("/:id/confirm", requireAuth, confirmDocument);

export default router;