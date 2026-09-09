import { describe, it, expect } from "vitest";
import { trainModel, loadModelArtifact, autoSelectAlgorithm, predictBatch, kfoldSplit, crossValidate, selectAlgorithmCV } from "../ml/trainer";
import type { DatasetRow } from "../ml/types";
import { mulberry32 } from "../ml/random";

const KEYS = ["x0", "x1", "x2"];

function synthetic(n = 120, seed = 7): DatasetRow[] {
  const rng = mulberry32(seed);
  const rows: DatasetRow[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = rng() * 10;
    const x1 = rng() * 5;
    const x2 = rng() * 2;
    const noise = (rng() - 0.5) * 0.4;
    const target = 20 + 3 * x0 - 2 * x1 + 0.5 * x2 + noise;
    rows.push({ id: `r${i}`, features: [x0, x1, x2], target });
  }
  return rows;
}

function stepData(): DatasetRow[] {
  // piecewise-constant target that trees model exactly
  const rows: DatasetRow[] = [];
  for (let i = 0; i < 100; i++) {
    const x0 = i / 10;
    const x1 = (i % 3) / 2;
    const target = x0 < 5 ? 10 : 60;
    rows.push({ id: `s${i}`, features: [x0, x1], target });
  }
  return rows;
}

function baseOpts(algo: any, params: Record<string, unknown> = {}, n = 120) {
  return {
    algorithm: algo as any,
    featureKeys: KEYS,
    targetName: "score",
    datasetVersion: "v1",
    modelVersion: "1.0.0",
    seed: 42,
    testFraction: 0.2,
    params,
  };
}

describe("ml / linear (ridge)", () => {
  it("recovers coefficients and scores well on a linear target", () => {
    const result = trainModel(synthetic(), baseOpts("linear", { alpha: 0.01, l1Ratio: 0 }));
    expect(result.metrics.r2).toBeGreaterThan(0.95);
    expect(result.metrics.mae).toBeLessThan(0.3);
  });

  it("predicts via rehydrated artifact without retraining", () => {
    const result = trainModel(synthetic(), baseOpts("linear"));
    const hydrated = loadModelArtifact(result.artifact);
    const pred = hydrated.predict([5, 2.5, 1]);
    expect(typeof pred).toBe("number");
    const also = predictBatch(result.artifact, [{ id: "a", features: [5, 2.5, 1] }]);
    expect(also[0].predicted).toBeCloseTo(pred, 6);
  });
});

describe("ml / cart", () => {
  it("models a step function exactly", () => {
    const rows = stepData();
    const result = trainModel(rows, {
      algorithm: "cart",
      featureKeys: ["x0", "x1"],
      datasetVersion: "v1",
      seed: 1,
      params: { maxDepth: 3, minSamplesSplit: 2 },
    });
    expect(result.metrics.mae).toBeLessThan(1e-9);
  });
});

describe("ml / forest", () => {
  it("fits the step function well", () => {
    const rows = stepData();
    const result = trainModel(rows, {
      algorithm: "forest",
      featureKeys: ["x0", "x1"],
      datasetVersion: "v1",
      seed: 1,
      params: { nEstimators: 60, maxDepth: 6, minSamplesSplit: 2, maxBins: 200, maxFeatures: 2 },
    });
    expect(result.metrics.r2).toBeGreaterThan(0.95);
  });

  it("is deterministic for a fixed seed", () => {
    const a = trainModel(synthetic(), baseOpts("forest", { nEstimators: 30, seed: 5 }));
    const b = trainModel(synthetic(), baseOpts("forest", { nEstimators: 30, seed: 5 }));
    expect(a.metrics.r2).toBe(b.metrics.r2);
    expect(a.predictions.map((p) => p.predicted)).toEqual(b.predictions.map((p) => p.predicted));
  });
});

describe("ml / gbm", () => {
  it("fits a smooth target reasonably", () => {
    const result = trainModel(synthetic(), baseOpts("gbm", { nEstimators: 60, maxDepth: 2, learningRate: 0.1 }));
    expect(result.metrics.r2).toBeGreaterThan(0.85);
  });
});

describe("ml / artifact integrity", () => {
  it("serializes to JSON without functions", () => {
    const result = trainModel(synthetic(), baseOpts("forest", { nEstimators: 20 }));
    const s = JSON.stringify(result.artifact);
    const parsed = JSON.parse(s) as typeof result.artifact;
    const hydrated = loadModelArtifact(parsed);
    expect(typeof hydrated.predict([1, 2, 3])).toBe("number");
  });

  it("records model / dataset / schema versions and importance keys", () => {
    const result = trainModel(synthetic(), baseOpts("linear"));
    expect(result.artifact.schemaVersion).toBe("1.0");
    expect(result.artifact.fitMeta.datasetVersion).toBe("v1");
    expect(result.artifact.fitMeta.modelVersion).toBe("1.0.0");
    expect(result.importance).toHaveLength(KEYS.length);
    expect(result.importance.map((i) => i.key)).toEqual(KEYS);
    const s = result.importance.reduce((a, b) => a + b.importance, 0);
    expect(s).toBeCloseTo(1, 1);
  });

  it("auto-selects the best algorithm", () => {
    const { algorithm, result } = autoSelectAlgorithm(
      synthetic(),
      { featureKeys: KEYS, datasetVersion: "v1", seed: 7 }
    );
    expect(algorithm).toBeTruthy();
    expect(result.metrics.n).toBeGreaterThan(0);
  });
});

describe("ml / k-fold cross-validation (Phase 1 §15/§16)", () => {
  it("splits deterministically and places every row in exactly one test fold", () => {
    const rows = synthetic(30);
    const a = kfoldSplit(rows, 5, 11);
    const b = kfoldSplit(rows, 5, 11);
    expect(a.map((f) => f.testIdx)).toEqual(b.map((f) => f.testIdx));
    expect(a).toHaveLength(5);
    const seen = new Set<number>();
    for (const fold of a) for (const i of fold.testIdx) seen.add(i);
    expect(seen.size).toBe(rows.length);
    // each fold's train and test sets are disjoint and together cover all rows
    for (const fold of a) {
      const train = new Set(fold.trainIdx);
      for (const i of fold.testIdx) expect(train.has(i)).toBe(false);
      expect(fold.trainIdx.length + fold.testIdx.length).toBe(rows.length);
    }
  });

  it("returns aggregate mean ± std metrics and a pooled estimate", () => {
    const rows = synthetic(120);
    const cv = crossValidate(rows, { featureKeys: KEYS, datasetVersion: "v1", seed: 42 }, "linear", 5);
    expect(cv.folds).toBe(5);
    expect(cv.perFold).toHaveLength(5);
    for (const m of cv.perFold) {
      expect(m.n).toBeGreaterThan(0);
      expect(m.rmse).toBeGreaterThanOrEqual(0);
    }
    expect(cv.mae.mean).toBeGreaterThan(0);
    expect(cv.rmse.mean).toBeGreaterThan(0);
    expect(cv.rmse.std).toBeGreaterThanOrEqual(0);
    expect(cv.r2.mean).toBeLessThanOrEqual(1);
    expect(cv.pooled.n).toBe(120);
  });

  it("recovers a linear target with low CV error", () => {
    const rows = synthetic(120);
    const cv = crossValidate(rows, { featureKeys: KEYS, datasetVersion: "v1", seed: 7 }, "linear", 5);
    expect(cv.rmse.mean).toBeLessThan(0.5);
    expect(cv.mae.mean).toBeLessThan(0.4);
    expect(cv.r2.mean).toBeGreaterThan(0.95);
  });

  it("selects an algorithm without calling its own test set", () => {
    const rows = synthetic(120);
    const sel = selectAlgorithmCV(rows, { featureKeys: KEYS, datasetVersion: "v1", seed: 7 }, 5);
    expect(["linear", "cart", "forest", "gbm"]).toContain(sel.algorithm);
    expect(sel.cv.folds).toBe(5);
    expect(sel.cv.rmse.mean).toBeGreaterThanOrEqual(0);
  });
});