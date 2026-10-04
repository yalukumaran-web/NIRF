import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import {
  compareDiff,
  getDiffOfficial,
  listDiffColleges,
  serveDiffGraph,
} from "../controllers/diffController";

const router = Router();

/**
 * PDF-only, in memory: one file, same ceiling as the absolute endpoint.
 * A rejected upload answers with clean JSON instead of multer's HTML page.
 */
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    if (ok) cb(null, true);
    else cb(new Error("Only PDF uploads are accepted."));
  },
});

function acceptPdf(req: Request, res: Response, next: NextFunction) {
  pdfUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message =
        err instanceof multer.MulterError
          ? err.code === "LIMIT_FILE_SIZE"
            ? "PDF exceeds the 40 MB limit."
            : err.message
          : err instanceof Error
            ? err.message
            : "Upload rejected.";
      return res.status(400).json({ error: message });
    }
    return next();
  });
}

/** Official values available for comparison (from `expected_output/`). */
router.get("/colleges", listDiffColleges);
/** The official row for one college, without an upload. */
router.get("/official/:slug", getDiffOfficial);
/** Serves the official graph image out of `expected_output/`. */
router.get("/graph/:slug", serveDiffGraph);
/** The diff calculator: PDF in, actual / mine / delta out. */
router.post("/compare", acceptPdf, compareDiff);

export default router;
