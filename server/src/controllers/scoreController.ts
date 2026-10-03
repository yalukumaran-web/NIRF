import { Request, Response } from "express";
import { rawMetricsSchema, categorySchema } from "../services/validation";
import {
  getInstitution,
  updateCategory,
} from "../services/authService";
import {
  upsertRawMetrics,
  computeAndSave,
  getScores,
  getBreakdown,
} from "../services/scoreService";
import type { NIRFCategory } from "../types/metrics";

export async function saveMetrics(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const inst = await getInstitution(req.user.userId);
  if (!inst) return res.status(404).json({ error: "No institution for user" });

  const parsed = rawMetricsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  try {
    await upsertRawMetrics(inst.id, parsed.data);
    const score = await computeAndSave(
      inst.id,
      parsed.data,
      inst.category as NIRFCategory,
      parsed.data.excludedSubParameters
    );
    return res.status(201).json({
      institution: inst,
      category: inst.category,
      score,
    });
  } catch (e) {
    return res.status(500).json({ error: "Failed to compute score", detail: String(e) });
  }
}

export async function listScores(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const inst = await getInstitution(req.user.userId);
  if (!inst) return res.status(404).json({ error: "No institution for user" });
  const scores = await getScores(inst.id);
  return res.json({ institution: inst, scores });
}

export async function scoreBreakdown(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid score id" });
  const breakdown = await getBreakdown(id);
  return res.json({ scoreId: id, breakdown });
}

export async function setCategory(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const parsed = categorySchema.safeParse(req.body.category);
  if (!parsed.success) return res.status(400).json({ error: "Invalid category" });
  await updateCategory(req.user.userId, parsed.data);
  const inst = await getInstitution(req.user.userId);
  return res.json({ institution: inst });
}
