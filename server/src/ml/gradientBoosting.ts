/**
 * Gradient boosting regression (squared loss).
 *
 * Stages are shallow CART trees fit to the current negative gradient
 * (residual). Predictions = init + lr · Σ stage trees. Deterministic for a
 * fixed seed so model retraining is reproducible.
 */

import { buildTree, predictTree, type CartParams } from "./cart";
import { mulberry32, type Rng } from "./random";
import { mean } from "./stats";
import type { TreeNode } from "./types";

export interface GbmParams extends CartParams {
  nEstimators?: number; // 120
  learningRate?: number; // 0.08
  seed?: number;
}

export interface GbmResult {
  init: number;
  lr: number;
  trees: TreeNode[];
  importance: number[];
}

export function buildGbm(
  X: number[][],
  y: number[],
  params: GbmParams = {}
): GbmResult {
  const nEstimators = params.nEstimators ?? 120;
  const lr = params.learningRate ?? 0.08;
  const seed = params.seed ?? 42;
  const rng: Rng = mulberry32(seed);
  const n = X.length;
  const p = X[0]?.length ?? 1;

  const init = mean(y);
  const residuals = y.map((v) => v - init);
  const trees: TreeNode[] = [];
  const importance = new Array(p).fill(0);

  const stageParams: CartParams = {
    maxDepth: params.maxDepth ?? 2,
    minSamplesSplit: params.minSamplesSplit ?? 5,
    minSamplesLeaf: params.minSamplesLeaf ?? 1,
    minImpurityDecrease: params.minImpurityDecrease ?? 0,
    maxBins: params.maxBins ?? 32,
    maxFeatures: params.maxFeatures,
  };

  for (let m = 0; m < nEstimators; m++) {
    const { root, importance: imp } = buildTree(X, residuals, stageParams, rng);
    if (root.featureIndex === -1) {
      trees.push(root);
      continue;
    }
    trees.push(root);
    for (let j = 0; j < p; j++) importance[j] += imp[j];
    // update residuals
    for (let i = 0; i < n; i++) {
      residuals[i] -= lr * predictTree(root, X[i]);
    }
  }

  return { init, lr, trees, importance };
}

export function predictGbm(
  result: Pick<GbmResult, "init" | "lr" | "trees">,
  features: number[]
): number {
  let s = result.init;
  for (const t of result.trees) s += result.lr * predictTree(t, features);
  return s;
}

export function predictGbmBatch(
  result: Pick<GbmResult, "init" | "lr" | "trees">,
  X: number[][]
): number[] {
  return X.map((f) => predictGbm(result, f));
}