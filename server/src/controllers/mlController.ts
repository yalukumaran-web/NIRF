import { Request, Response } from "express";
import { z } from "zod";
import {
  listDatasets,
  listTrainingRuns,
  getActiveModel,
  getActiveModelArtifact,
  trainFromDataset,
} from "../services/mlService";
import { predictBatch } from "../ml/trainer";

const trainSchema = z.object({
  datasetVersion: z.string().min(1),
  algorithm: z.enum(["linear", "cart", "forest", "gbm", "auto"]).optional(),
  modelVersion: z.string().optional(),
  seed: z.number().int().optional(),
  testFraction: z.number().min(0.05).max(0.5).optional(),
  params: z.record(z.any()).optional(),
  targetName: z.string().optional(),
});

const predictSchema = z.object({
  features: z.array(z.number()).min(1),
});

export async function train(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });

  const parsed = trainSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  try {
    const result = await trainFromDataset(parsed.data, req.user.email, req.user.role);
    return res.status(201).json(result);
  } catch (e) {
    return res.status(422).json({ error: "Training failed", detail: String(e) });
  }
}

export async function datasets(req: Request, res: Response) {
  const ds = await listDatasets();
  return res.json({ datasets: ds });
}

export async function trainingRuns(req: Request, res: Response) {
  const runs = await listTrainingRuns();
  return res.json({ runs });
}

export async function modelStatus(req: Request, res: Response) {
  const model = await getActiveModel();
  if (!model) return res.json({ model: null, message: "No model trained yet" });
  return res.json({ model });
}

export async function modelPredict(req: Request, res: Response) {
  const parsed = predictSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const artifact = await getActiveModelArtifact();
  if (!artifact) return res.status(404).json({ error: "No trained model available" });

  const predicted = predictBatch(artifact, [{ id: "x", features: parsed.data.features }]);
  return res.json({ predicted: predicted[0].predicted });
}