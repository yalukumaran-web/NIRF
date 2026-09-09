/**
 * Model trainer — orchestrates dataset splitting, algorithm selection,
 * standardized fitting, evaluation and artifact production.
 *
 * Every produced artifact records:
 *   - schemaVersion   : version of the serialization schema
 *   - modelVersion    : semantic version of the artifact (caller-supplied)
 *   - datasetVersion  : identifies the exact training data snapshot used
 *   - featureKeys     : ordered feature schema (featureVersion provenance)
 *   - params          : hyper-parameters used (for reproducibility)
 * This satisfies the model/dataset/feature versioning requirement: any
 * artifact can be traced to the data and settings that produced it.
 */

import { buildForest, predictForest } from "./randomForest";
import { buildGbm, predictGbm } from "./gradientBoosting";
import { buildTree, predictCart, type CartParams } from "./cart";
import { expandPoly, fitLinear, linearImportance, predictLinear } from "./linearRegression";
import { mulberry32 } from "./random";
import { mae, mean, rmse, r2, std } from "./stats";
import type {
  DatasetRow,
  FeatureImportance,
  LinearArtifact,
  MetricSummary,
  ModelArtifact,
  ModelPredictor,
  TrainOptions,
  TrainingResult,
  TreeNode,
} from "./types";

export const MODEL_SCHEMA_VERSION = "1.0";

function splitRows(rows: DatasetRow[], testFraction: number, seed: number): { train: DatasetRow[]; test: DatasetRow[]; trainIdx: number[]; testIdx: number[] } {
  const rng = mulberry32(seed);
  const n = rows.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
  }
  const nTest = Math.max(1, Math.round(n * testFraction));
  const testIdx = idx.slice(0, nTest);
  const trainIdx = idx.slice(nTest);
  return {
    train: trainIdx.map((i) => rows[i]),
    test: testIdx.map((i) => rows[i]),
    trainIdx,
    testIdx,
  };
}

function toMatrix(rows: DatasetRow[]): { X: number[][]; y: number[] } {
  return {
    X: rows.map((r) => r.features.slice()),
    y: rows.map((r) => r.target),
  };
}

function standardize(X: number[][]): { scaled: number[][]; mean: number[]; std: number[] } {
  const p = X[0]?.length ?? 0;
  const mu = new Array(p).fill(0);
  const sd = new Array(p).fill(1);
  for (let j = 0; j < p; j++) {
    const col = X.map((r) => r[j]);
    mu[j] = mean(col);
    const s = std(col);
    sd[j] = s === 0 ? 1 : s;
  }
  const scaled = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  return { scaled, mean: mu, std: sd };
}

function normalizeImportanceRaw(values: number[], p: number): number[] {
  let total = 0;
  for (const v of values) total += v;
  if (total <= 0) return new Array(p).fill(0);
  return values.map((v) => v / total);
}

function importanceList(keys: string[], values: number[]): FeatureImportance[] {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  return keys.map((key, i) => ({ key, importance: Number((values[i] / total).toFixed(4)) }));
}

interface FitMeta {
  nTrain: number;
  nTest: number;
  targetMean: number;
}

/** Fit an algorithm-specific artifact on (X, y) and return it plus raw feature importance. */
function fitArtifact(
  X: number[][],
  y: number[],
  opts: TrainOptions,
  meta: FitMeta,
  seed: number
): { artifact: ModelArtifact; rawImportance: number[] } {
  const p = opts.featureKeys.length;
  const algo = opts.algorithm;
  let artifact: ModelArtifact;
  let rawImportance: number[] = [];

  switch (algo) {
    case "linear": {
      const degree = (opts.params?.degree as number) ?? 1;
      const l1Ratio = (opts.params?.l1Ratio as number) ?? 0;
      const alpha = (opts.params?.alpha as number) ?? 1.0;
      const maxIter = (opts.params?.maxIter as number) ?? 1000;
      const tol = (opts.params?.tol as number) ?? 1e-9;

      const { scaled, mean: mu, std: sd } = standardize(X);
      const design = scaled.map((r) => expandPoly(r, degree));
      const fit = fitLinear(design, y, { alpha, l1Ratio, maxIter, tol });
      const linear: LinearArtifact = {
        intercept: fit.intercept,
        weights: fit.weights,
        featureMean: mu,
        featureStd: sd,
        degree,
        nFeatures: p,
        nIter: maxIter,
      };
      rawImportance = linearImportance(fit, sd);
      artifact = {
        algo,
        schemaVersion: MODEL_SCHEMA_VERSION,
        featureKeys: opts.featureKeys,
        targetName: opts.targetName,
        params: { alpha, l1Ratio, degree, maxIter, tol },
        linear,
        fitMeta: {
            nTrain: meta.nTrain,
            nTest: meta.nTest,
            targetMean: meta.targetMean,
            trainedAt: new Date().toISOString(),
          },
      };
      break;
    }
    case "cart": {
      const params = {
        maxDepth: (opts.params?.maxDepth as number) ?? 6,
        minSamplesSplit: (opts.params?.minSamplesSplit as number) ?? 5,
        minSamplesLeaf: (opts.params?.minSamplesLeaf as number) ?? 1,
      };
      const { root, importance } = buildTree(X, y, params, null);
      rawImportance = importance;
      artifact = {
        algo,
        schemaVersion: MODEL_SCHEMA_VERSION,
        featureKeys: opts.featureKeys,
        targetName: opts.targetName,
        params,
        tree: root,
        fitMeta: { nTrain: meta.nTrain, nTest: meta.nTest, targetMean: meta.targetMean, trainedAt: new Date().toISOString() },
      };
      break;
    }
    case "forest": {
      const params = {
        nEstimators: (opts.params?.nEstimators as number) ?? 200,
        maxDepth: (opts.params?.maxDepth as number) ?? 8,
        minSamplesSplit: (opts.params?.minSamplesSplit as number) ?? 5,
        minSamplesLeaf: (opts.params?.minSamplesLeaf as number) ?? 1,
        maxBins: (opts.params?.maxBins as number) ?? 32,
        maxFeatures: (opts.params?.maxFeatures as "sqrt" | number | undefined) ?? "sqrt",
        seed: opts.seed ?? 42,
      };
      const { trees, importance } = buildForest(X, y, params);
      rawImportance = importance;
      artifact = {
        algo,
        schemaVersion: MODEL_SCHEMA_VERSION,
        featureKeys: opts.featureKeys,
        targetName: opts.targetName,
        params,
        forest: trees,
        fitMeta: { nTrain: meta.nTrain, nTest: meta.nTest, targetMean: meta.targetMean, trainedAt: new Date().toISOString() },
      };
      break;
    }
    case "gbm": {
      const params = {
        nEstimators: (opts.params?.nEstimators as number) ?? 120,
        learningRate: (opts.params?.learningRate as number) ?? 0.08,
        maxDepth: (opts.params?.maxDepth as number) ?? 2,
        minSamplesSplit: (opts.params?.minSamplesSplit as number) ?? 5,
        minSamplesLeaf: (opts.params?.minSamplesLeaf as number) ?? 1,
        maxBins: (opts.params?.maxBins as number) ?? 32,
        seed: opts.seed ?? 42,
      };
      const g = buildGbm(X, y, params);
      rawImportance = g.importance;
      artifact = {
        algo,
        schemaVersion: MODEL_SCHEMA_VERSION,
        featureKeys: opts.featureKeys,
        targetName: opts.targetName,
        params,
        staged: { init: g.init, lr: g.lr, trees: g.trees },
        fitMeta: { nTrain: meta.nTrain, nTest: meta.nTest, targetMean: meta.targetMean, trainedAt: new Date().toISOString() },
      };
      break;
    }
  }

  return { artifact, rawImportance };
}

export function trainModel(rows: DatasetRow[], opts: TrainOptions): TrainingResult {
  if (rows.length < 4) throw new Error("trainModel requires at least 4 rows");
  if (opts.featureKeys.length === 0) throw new Error("featureKeys must not be empty");
  for (const r of rows) {
    if (r.features.length !== opts.featureKeys.length) {
      throw new Error(`Row "${r.id}" has ${r.features.length} features; expected ${opts.featureKeys.length}`);
    }
  }

  const seed = opts.seed ?? 42;
  const testFraction = opts.testFraction ?? 0.2;
  const split = splitRows(rows, testFraction, seed);
  const { X, y } = toMatrix(split.train);
  const { artifact, rawImportance } = fitArtifact(X, y, opts, {
    nTrain: split.train.length,
    nTest: split.test.length,
    targetMean: mean(y),
  }, seed);

  const predictor = loadModelArtifact(artifact);
  const predictions = split.test.map((r) => ({
    id: r.id,
    actual: r.target,
    predicted: predictor.predict(r.features),
  }));
  const metrics: MetricSummary = {
    mae: mae(predictions.map((p) => p.actual), predictions.map((p) => p.predicted)),
    rmse: rmse(predictions.map((p) => p.actual), predictions.map((p) => p.predicted)),
    r2: r2(predictions.map((p) => p.actual), predictions.map((p) => p.predicted)),
    n: predictions.length,
  };

  artifact.fitMeta.trainedAt = new Date().toISOString();
  artifact.fitMeta.datasetVersion = opts.datasetVersion;
  artifact.fitMeta.modelVersion = opts.modelVersion ?? "1.0.0";
  artifact.importance = importanceList(opts.featureKeys, rawImportance);

  return {
    artifact,
    metrics,
    importance: artifact.importance,
    predictions,
    split,
    datasetVersion: opts.datasetVersion,
    modelVersion: opts.modelVersion ?? "1.0.0",
  };
}

/** Rehydrate a predictor from a stored artifact without re-training. */
export function loadModelArtifact(artifact: ModelArtifact): ModelPredictor {
  switch (artifact.algo) {
    case "linear": {
      const lin = artifact.linear!;
      return {
        artifact,
        predict: (features) => predictLinear(
          { intercept: lin.intercept, weights: lin.weights },
          features,
          lin.featureMean,
          lin.featureStd,
          lin.degree
        ),
      };
    }
    case "cart":
      return { artifact, predict: (features) => predictCart(artifact.tree!, [features])[0] };
    case "forest": {
      const trees = artifact.forest ?? [];
      return { artifact, predict: (features) => predictForest(trees, features) };
    }
    case "gbm": {
      const staged = artifact.staged!;
      return {
        artifact,
        predict: (features) => predictGbm({ init: staged.init, lr: staged.lr, trees: staged.trees }, features),
      };
    }
  }
}

export function predict(artifact: ModelArtifact, features: number[]): number {
  return loadModelArtifact(artifact).predict(features);
}

/** Predict for multiple rows (batch). */
export function predictBatch(artifact: ModelArtifact, rows: { id: string; features: number[] }[]): { id: string; predicted: number }[] {
  const predictor = loadModelArtifact(artifact);
  return rows.map((r) => ({ id: r.id, predicted: predictor.predict(r.features) }));
}

/** Pick the best algorithm for a dataset by test R² (used by Train endpoint). */
export function autoSelectAlgorithm(
  rows: DatasetRow[],
  opts: Omit<TrainOptions, "algorithm">
): { algorithm: TrainOptions["algorithm"]; result: TrainingResult } {
  let best: TrainingResult | null = null;
  let bestAlgo: TrainOptions["algorithm"] = "linear";
  const candidates: TrainOptions["algorithm"][] = ["linear", "cart", "forest", "gbm"];
  for (const algo of candidates) {
    try {
      const result = trainModel(rows, { ...opts, algorithm: algo });
      if (!best || result.metrics.r2 > best.metrics.r2) {
        best = result;
        bestAlgo = algo;
      }
    } catch {
      // skip algorithm that fails to fit the data
    }
  }
  if (!best) throw new Error("model training failed for all algorithms");
  return { algorithm: bestAlgo, result: best };
}

// ── K-Fold cross-validation (Phase 1 §15/§16) ──────────────────────────────

export interface CvFold {
  trainIdx: number[];
  testIdx: number[];
}

/** Mean ± standard deviation of a metric across folds. */
export interface CvMetric {
  mean: number;
  std: number;
}

export interface CrossValidationResult {
  folds: number;
  /** Per-fold metrics, one entry per fold. */
  perFold: MetricSummary[];
  /** Mean ± std of MAE across folds. */
  mae: CvMetric;
  /** Mean ± std of RMSE across folds. */
  rmse: CvMetric;
  /** Mean ± std of R² across folds. */
  r2: CvMetric;
  /** Metrics computed over all out-of-fold predictions pooled together. */
  pooled: MetricSummary;
}

function aggMetric(values: number[]): CvMetric {
  return { mean: mean(values), std: std(values) };
}

/** Deterministic seeded K-Fold split — every instance appears in exactly one test fold. */
export function kfoldSplit(rows: DatasetRow[], folds: number, seed: number): CvFold[] {
  const n = rows.length;
  const k = Math.max(2, Math.min(folds, n));
  const rng = mulberry32(seed);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
  }
  const base = Math.floor(n / k);
  const rem = n % k;
  const parts: CvFold[] = [];
  let start = 0;
  for (let f = 0; f < k; f++) {
    const size = base + (f < rem ? 1 : 0);
    const testIdx = idx.slice(start, start + size);
    const testSet = new Set(testIdx);
    const trainIdx = idx.filter((i) => !testSet.has(i));
    parts.push({ trainIdx, testIdx });
    start += size;
  }
  return parts;
}

/**
 * K-Fold cross-validation for a single algorithm. Fits on each training fold,
 * evaluates on the held-out fold, and reports per-fold plus aggregated
 * metrics (mean ± std) — a more reliable estimate than a single split.
 */
export function crossValidate(
  rows: DatasetRow[],
  opts: Omit<TrainOptions, "algorithm">,
  algorithm: TrainOptions["algorithm"],
  folds = 5,
  seed = opts.seed ?? 42
): CrossValidationResult {
  if (rows.length < 4) throw new Error("crossValidate requires at least 4 rows");
  if (opts.featureKeys.length === 0) throw new Error("featureKeys must not be empty");
  for (const r of rows) {
    if (r.features.length !== opts.featureKeys.length) {
      throw new Error(`Row "${r.id}" has ${r.features.length} features; expected ${opts.featureKeys.length}`);
    }
  }

  const splits = kfoldSplit(rows, folds, seed);
  const perFold: MetricSummary[] = [];
  const pooledActual: number[] = [];
  const pooledPredicted: number[] = [];

  for (const fold of splits) {
    const trainRows = fold.trainIdx.map((i) => rows[i]);
    const testRows = fold.testIdx.map((i) => rows[i]);
    const { X, y } = toMatrix(trainRows);
    const { artifact } = fitArtifact(X, y, { ...opts, algorithm }, {
      nTrain: trainRows.length,
      nTest: testRows.length,
      targetMean: mean(y),
    }, seed);
    const predictor = loadModelArtifact(artifact);
    for (const r of testRows) {
      pooledActual.push(r.target);
      pooledPredicted.push(predictor.predict(r.features));
    }
    perFold.push({
      mae: mae(pooledActual.slice(-testRows.length), pooledPredicted.slice(-testRows.length)),
      rmse: rmse(pooledActual.slice(-testRows.length), pooledPredicted.slice(-testRows.length)),
      r2: r2(pooledActual.slice(-testRows.length), pooledPredicted.slice(-testRows.length)),
      n: testRows.length,
    });
  }

  return {
    folds: splits.length,
    perFold,
    mae: aggMetric(perFold.map((m) => m.mae)),
    rmse: aggMetric(perFold.map((m) => m.rmse)),
    r2: aggMetric(perFold.map((m) => m.r2)),
    pooled: {
      mae: mae(pooledActual, pooledPredicted),
      rmse: rmse(pooledActual, pooledPredicted),
      r2: r2(pooledActual, pooledPredicted),
      n: pooledActual.length,
    },
  };
}

/**
 * Compare candidate algorithms with K-Fold CV and pick the best by mean RMSE
 * (tie-break: higher mean R²). Unlike autoSelectAlgorithm, model selection is
 * not made on a single held-out split.
 */
export function selectAlgorithmCV(
  rows: DatasetRow[],
  opts: Omit<TrainOptions, "algorithm">,
  folds = 5,
  seed = opts.seed ?? 42
): { algorithm: TrainOptions["algorithm"]; cv: CrossValidationResult } {
  const candidates: TrainOptions["algorithm"][] = ["linear", "cart", "forest", "gbm"];
  let best: TrainOptions["algorithm"] = "linear";
  let bestCv: CrossValidationResult | null = null;
  for (const algo of candidates) {
    try {
      const cv = crossValidate(rows, opts, algo, folds, seed);
      if (
        !bestCv ||
        cv.rmse.mean < bestCv.rmse.mean ||
        (cv.rmse.mean === bestCv.rmse.mean && cv.r2.mean > bestCv.r2.mean)
      ) {
        best = algo;
        bestCv = cv;
      }
    } catch {
      // skip algorithm that fails to fit the data
    }
  }
  if (!bestCv) throw new Error("model training failed for all algorithms");
  return { algorithm: best, cv: bestCv };
}

export type { CartParams } from "./cart";
export type { TreeNode } from "./types";