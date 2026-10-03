/**
 * Loads the shipped relative-model artifact from disk (cached), or builds a
 * seed artifact if none has been trained yet so the module still functions
 * end-to-end (clearly flagged seedBaseline).
 */

import fs from "fs";
import path from "path";
import { runRelativeTraining } from "./train";
import { buildSeedBaselineDataset } from "./dataset";
import type { RelativeModelArtifact } from "./types";

let cached: RelativeModelArtifact | null = null;

export function artifactPath(): string {
  return path.resolve(__dirname, "artifacts", "relative_model.json");
}

function trainSeedArtifact(): RelativeModelArtifact {
  const records = buildSeedBaselineDataset();
  const { artifact } = runRelativeTraining(records, {
    trainYears: [2023, 2024],
    validateYear: 2025,
    category: "engineering",
  });
  return artifact;
}

export function loadRelativeModel(force = false): RelativeModelArtifact | null {
  if (!force && cached) return cached;
  try {
    if (fs.existsSync(artifactPath())) {
      const raw = fs.readFileSync(artifactPath(), "utf-8");
      cached = JSON.parse(raw) as RelativeModelArtifact;
      return cached;
    }
  } catch (err) {
    console.warn("[relative] failed to read artifact, falling back to seed:", err);
  }
  const seed = trainSeedArtifact();
  cached = seed;
  return seed;
}

export function saveRelativeModel(artifact: RelativeModelArtifact): void {
  const dir = path.dirname(artifactPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(artifactPath(), JSON.stringify(artifact, null, 2), "utf-8");
  cached = artifact;
}

export function getSeedBaselineRecords() {
  return buildSeedBaselineDataset();
}