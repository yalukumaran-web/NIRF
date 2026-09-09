/**
 * Random forest regression — bagging of CART trees with per-node feature
 * subsampling (sqrt is the default). Deterministic for a fixed seed.
 */

import { buildTree, predictTree, type CartParams } from "./cart";
import { mulberry32, type Rng } from "./random";
import { mean } from "./stats";
import type { TreeNode } from "./types";

export interface ForestParams extends CartParams {
  nEstimators?: number; // 200
  seed?: number;
}

export interface ForestResult {
  trees: TreeNode[];
  /** mean per-feature importance across trees (unnormalized). */
  importance: number[];
}

export function buildForest(
  X: number[][],
  y: number[],
  params: ForestParams = {}
): ForestResult {
  const nEstimators = params.nEstimators ?? 200;
  const seed = params.seed ?? 42;
  const rng: Rng = mulberry32(seed);
  const n = X.length;
  const p = X[0]?.length ?? 1;

  const trees: TreeNode[] = [];
  const importance = new Array(p).fill(0);

  const forestParams: CartParams = {
    maxDepth: params.maxDepth ?? 8,
    minSamplesSplit: params.minSamplesSplit ?? 5,
    minSamplesLeaf: params.minSamplesLeaf ?? 1,
    minImpurityDecrease: params.minImpurityDecrease ?? 0,
    maxBins: params.maxBins ?? 32,
    maxFeatures: params.maxFeatures ?? "sqrt",
  };

  for (let t = 0; t < nEstimators; t++) {
    // bootstrap sample
    const idx = new Array<number>(n);
    for (let i = 0; i < n; i++) idx[i] = Math.floor(rng() * n);
    const Xb = idx.map((i) => X[i]);
    const yb = idx.map((i) => y[i]);
    const { root, importance: imp } = buildTree(Xb, yb, forestParams, rng);
    trees.push(root);
    for (let j = 0; j < p; j++) importance[j] += imp[j];
  }

  return { trees, importance };
}

export function predictForest(trees: TreeNode[], features: number[]): number {
  let s = 0;
  for (const t of trees) s += predictTree(t, features);
  return s / trees.length;
}

export function predictForestBatch(trees: TreeNode[], X: number[][]): number[] {
  return X.map((f) => predictForest(trees, f));
}