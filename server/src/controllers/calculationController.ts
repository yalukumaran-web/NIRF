import { Request, Response } from "express";
import { z } from "zod";
import { getInstitution } from "../services/authService";
import { getDocument, getDocumentExtracted } from "../services/documentService";
import { validateRawMetrics } from "../services/validationService";
import { computeScore } from "../services/nirf/engine";
import { computeAndSave } from "../services/scoreService";
import { recordCalcRun, listCalcRuns, getCalcRun } from "../services/calculationService";
import { audit } from "../services/audit";
import type { NIRFCategory, RawMetrics } from "../types/metrics";

const runSchema = z.object({
  documentId: z.number().int().positive().optional(),
  metrics: z.record(z.any()).optional(),
  year: z.number().int().min(2020).max(2030).optional(),
  kind: z.enum(["engine", "ml_prediction"]).optional(),
});

export async function runCalculation(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const inst = await getInstitution(req.user.userId);
  if (!inst) return res.status(404).json({ error: "No institution for user" });

  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { documentId, metrics, year, kind } = parsed.data;

  const category = inst.category as NIRFCategory;

  let source: Record<string, unknown>;
  let metricsSource: "extracted" | "manual" | "official" = "manual";
  if (documentId) {
    const doc = await getDocument(documentId, req.user.userId, req.user.role);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    source = (doc.extracted_json as Record<string, unknown>) ?? {};
    metricsSource = "extracted";
  } else if (metrics) {
    source = metrics;
  } else {
    return res.status(400).json({ error: "Provide metrics or documentId" });
  }

  const calYear = year ?? (source.year as number) ?? new Date().getFullYear();
  const raw = source as unknown as RawMetrics;

  const validation = validateRawMetrics(raw, { category, year: calYear });

  const score = computeScore(raw, { category, year: calYear });

  await computeAndSave(inst.id, raw, category);

  const runId = await recordCalcRun({
    userId: req.user.userId,
    institutionId: inst.id,
    uploadedDocId: documentId ?? null,
    category,
    year: calYear,
    kind: kind ?? "engine",
    metricsSource,
    methodologyVersion: score.methodologyVersion ?? null,
    metrics: source,
    validation,
    result: score,
  });

  await audit(req.user, "calc.run", "calc_runs", String(runId), {
    kind: kind ?? "engine",
    finalScore: score.finalScore,
    hasInsufficient: score.hasInsufficientData,
  });

  return res.status(201).json({
    runId,
    institution: inst,
    category,
    year: calYear,
metricsSource,
      validation: validation.summary,
      score: {
        finalScore: score.finalScore,
        hasInsufficientData: score.hasInsufficientData,
        insufficientParams: score.insufficientParams,
        parameters: score.parameters.map((p) => ({
          parameter: p.parameter,
          label: p.label,
          weight: p.weight,
          weightedScore: p.weightedScore,
          unweightedScore: p.unweightedScore,
          penalty: p.penalty,
        })),
      },
      methodology: {
        version: score.methodologyVersion,
        name: score.methodologyName,
        source: score.methodologySource,
        finalScoreFormula: score.finalScoreFormula,
      },
    });
}

export async function listCalculations(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const runs = await listCalcRuns(req.user.userId, req.user.role);
  return res.json({ runs });
}

export async function calculationDetail(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid run id" });
  const run = await getCalcRun(id, req.user.role, req.user.userId);
  if (!run) return res.status(404).json({ error: "Calculation run not found" });
  return res.json({ run });
}