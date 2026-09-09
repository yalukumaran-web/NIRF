import { Request, Response } from "express";
import { parsePdf } from "../services/pdfParser";
import { getInstitution } from "../services/authService";
import { predictFromMetrics, savePrediction } from "../services/predictService";

export async function predictFromPdf(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });

  const inst = await getInstitution(req.user.userId);
  if (!inst) return res.status(404).json({ error: "No institution for user" });

  try {
    const parsed = await parsePdf(req.file.path);

    const prediction = await predictFromMetrics(parsed.extracted as any, inst.category);

    const result = await savePrediction(inst.id, {
      year: new Date().getFullYear(),
      sourceFile: req.file.originalname,
      extracted: parsed.extracted,
      predictedRank: prediction.predictedRank,
      composite: prediction.composite,
      confidence: prediction.confidence,
      modelCategory: inst.category,
      parameterBreakdown: prediction.percentileScores,
    });

    return res.json({
      institution: inst,
      predictedRank: prediction.predictedRank,
      composite: prediction.composite,
      confidence: prediction.confidence,
      model: prediction.model,
      percentileScores: prediction.percentileScores,
      extracted: parsed.extracted,
      missing: parsed.missing,
      predictionId: result[0]?.id ?? result,
    });
  } catch (e: any) {
    return res
      .status(422)
      .json({ error: "Prediction failed", detail: String(e && e.message ? e.message : e) });
  }
}

export async function listPredictions(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const inst = await getInstitution(req.user.userId);
  if (!inst) return res.status(404).json({ error: "No institution for user" });
  const { query } = await import("../db/db");
  const rows = await query(
    `SELECT id, year, source_file, predicted_rank, composite, confidence, model_category, extracted_json, created_at
     FROM predictions WHERE institution_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [inst.id]
  );
  return res.json({ predictions: rows });
}
