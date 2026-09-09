import { Request, Response } from "express";
import { parsePdf } from "../services/pdfParser";

export async function uploadPdf(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  try {
    const result = await parsePdf(req.file.path);
    return res.json({
      file: {
        original: req.file.originalname,
        stored: req.file.filename,
        path: req.file.path,
      },
      extracted: result.extracted,
      missing: result.missing,
      textSnippet: result.textSnippet,
      includesEstimates: result.extracted.includesEstimates ?? false,
      requiresExternalSources: result.extracted.requiresExternalSources ?? false,
      missingCount: result.extracted.missingCount ?? 0,
    });
  } catch (e) {
    return res
      .status(422)
      .json({ error: "Could not parse PDF", detail: String(e) });
  }
}
