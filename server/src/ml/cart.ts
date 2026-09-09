/**
 * CART regression tree (squared-error impurity).
 *
 * Deterministic given the RNG (drives per-node feature subsetting for the
 * random forest). The tree is built lazily on demand inside train/predict,
 * and serialized as plain JSON for storage.
 */

import type { Rng } from "./random";
import { mean } from "./stats";
import type { TreeNode } from "./types";

export interface CartParams {
  maxDepth?: number; // 6
  minSamplesSplit?: number; // 5
  minSamplesLeaf?: number; // 1
  minImpurityDecrease?: number; // 0
  maxBins?: number; // 32 candidate thresholds per feature
  maxFeatures?: number | "sqrt" | "log2"; // per-node feature subset size
}

function subsetFeatures(p: number, maxFeatures: number | "sqrt" | "log2" | undefined, rng: Rng | null): number[] {
  if (maxFeatures === undefined || maxFeatures === null) {
    const all = [];
    for (let k = 0; k < p; k++) all.push(k);
    return all;
  }
  const m = maxFeatures === "sqrt" ? Math.max(1, Math.round(Math.sqrt(p))) : maxFeatures === "log2" ? Math.max(1, Math.round(Math.log2(p))) : maxFeatures;
  const pool: number[] = [];
  for (let k = 0; k < p; k++) pool.push(k);
  if (rng === null) return pool.slice(0, Math.min(m!, p));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const hold: number = pool[i];
    pool[i] = pool[j];
    pool[j] = hold;
  }
  return pool.slice(0, Math.min(m!, p));
}

function variance(y: number[], idx: number[]): number {
  if (idx.length === 0) return 0;
  let s = 0;
  let sq = 0;
  for (const i of idx) {
    s += y[i];
    sq += y[i] * y[i];
  }
  const v = sq / idx.length - (s / idx.length) ** 2;
  return v < 0 ? 0 : v;
}

export interface TreeBuildResult {
  root: TreeNode;
  /** per-feature accumulated n×gain importance */
  importance: number[];
}

/**
 * Build a regression tree. `featureSubset` may be provided by the forest to
 * reuse a pre-computed subset at each node; otherwise derived per node.
 */
export function buildTree(
  X: number[][],
  y: number[],
  params: CartParams = {},
  rng: Rng | null = null
): TreeBuildResult {
  const maxDepth = params.maxDepth ?? 6;
  const minSamplesSplit = params.minSamplesSplit ?? 5;
  const minSamplesLeaf = params.minSamplesLeaf ?? 1;
  const minImpurityDecrease = params.minImpurityDecrease ?? 0;
  const maxBins = params.maxBins ?? 32;
  const p = X[0]?.length ?? 0;
  const importance = new Array(p).fill(0);

  const startIdx = X.map((_, i) => i);

  function build(idx: number[], depth: number): TreeNode {
    const n = idx.length;
    const node: TreeNode = {
      featureIndex: -1,
      threshold: 0,
      left: null,
      right: null,
      value: mean(idx.map((i) => y[i])),
      n,
    };
    if (depth >= maxDepth || n < Math.max(minSamplesSplit, minSamplesLeaf + 1)) return node;

    const parentVariance = variance(y, idx);
    if (parentVariance <= 1e-12) return node;

    const feats = subsetFeatures(p, params.maxFeatures, rng);

    let bestGain = 0;
    let bestFeat = -1;
    let bestThr = 0;
    let bestLeft: number[] = [];
    let bestRight: number[] = [];

    for (const j of feats) {
      // sort indices by feature value
      const sorted = idx
        .map((i) => ({ i, v: X[i][j] }))
        .sort((a, b) => a.v - b.v);
      if (sorted.length < 2 || sorted[0].v === sorted[sorted.length - 1].v) continue;

      let totalSum = 0;
      let totalSq = 0;
      for (const r of sorted) {
        totalSum += y[r.i];
        totalSq += y[r.i] * y[r.i];
      }

      let leftSum = 0;
      let leftSq = 0;
      const binSize = Math.max(1, Math.ceil(sorted.length / maxBins));
      for (let s = 0; s < sorted.length - 1; s++) {
        const r = sorted[s];
        leftSum += y[r.i];
        leftSq += y[r.i] * y[r.i];
        // only evaluate candidate at end of a bin and when the next value differs
        if ((s + 1) % binSize !== 0 && s !== sorted.length - 2) continue;
        if (sorted[s].v === sorted[s + 1].v) continue;

        const leftN = s + 1;
        const rightN = sorted.length - leftN;
        if (leftN < minSamplesLeaf || rightN < minSamplesLeaf) continue;

        const leftMean = leftSum / leftN;
        const rightMean = (totalSum - leftSum) / rightN;
        let leftVar = leftSq / leftN - leftMean * leftMean;
        let rightVar = (totalSq - leftSq) / rightN - rightMean * rightMean;
        if (leftVar < 0) leftVar = 0;
        if (rightVar < 0) rightVar = 0;

        const gain = parentVariance - (leftN / n) * leftVar - (rightN / n) * rightVar;
        if (gain > bestGain) {
          bestGain = gain;
          bestFeat = j;
          bestThr = (sorted[s].v + sorted[s + 1].v) / 2;
          bestLeft = sorted.slice(0, leftN).map((r) => r.i);
          bestRight = sorted.slice(leftN).map((r) => r.i);
        }
      }
    }

    if (bestFeat === -1 || bestGain <= minImpurityDecrease) return node;

    node.featureIndex = bestFeat;
    node.threshold = bestThr;
    node.left = build(bestLeft, depth + 1);
    node.right = build(bestRight, depth + 1);
    node.featGain = n * bestGain;
    importance[bestFeat] += node.featGain;

    return node;
  }

  const root = build(startIdx, 0);
  return { root, importance };
}

export function predictTree(root: TreeNode, features: number[]): number {
  let node = root;
  while (node.featureIndex !== -1 && node.left && node.right) {
    if (features[node.featureIndex] <= node.threshold) node = node.left;
    else node = node.right;
  }
  return node.value;
}

export function predictCart(root: TreeNode, X: number[][]): number[] {
  return X.map((f) => predictTree(root, f));
}

export function normalizeImportance(importance: number[]): number[] {
  let total = 0;
  for (const v of importance) total += v;
  if (total <= 0) {
    return importance.map(() => 0);
  }
  return importance.map((v) => v / total);
}