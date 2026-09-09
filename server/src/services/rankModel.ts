/**
 * Rank-prediction model for NIRF Engineering institutions.
 *
 * Strategy:
 *  1. Compute NIRF sub-scores (SS, FSR, FQE, FRU, PU, QP, IPR, FPPP, GPH,
 *     GUE, GMS, GPHD, RD, WD, ESCS, PCS) using the scoring engine.
 *  2. Normalize each sub-score to a percentile within the training population.
 *  3. Combine via NIRF-aligned parameter weights into a composite [0,1].
 *  4. Linear calibration maps composite → predicted rank.
 *
 * The features ARE the NIRF sub-scores — this ensures the prediction is
 * directly interpretable and consistent with the scoring engine.
 */

import type { RawMetrics } from "../types/metrics";
import { computeScore, type ScoreOptions } from "./nirf/engine";

export interface SubScoreFeatures {
  // TLR sub-scores (each 0-100)
  ss: number;
  fsr: number;
  fqe: number;
  fru: number;
  // RP sub-scores (each 0-100)
  pu: number;
  qp: number;
  ipr: number;
  fppp: number;
  // GO sub-scores (each 0-100)
  gph: number;
  gue: number;
  gms: number;
  gphd: number;
  // OI sub-scores (each 0-100)
  rd: number;
  wd: number;
  escs: number;
  pcs: number;
}

export type FeatureKey = keyof SubScoreFeatures;

export const FEATURE_KEYS: FeatureKey[] = [
  "ss", "fsr", "fqe", "fru",
  "pu", "qp", "ipr", "fppp",
  "gph", "gue", "gms", "gphd",
  "rd", "wd", "escs", "pcs",
];

/** Parameter weights (NIRF 2025 Engineering) */
const PARAM_WEIGHTS: Record<string, number[]> = {
  TLR: [20, 30, 20, 30],  // SS, FSR, FQE, FRU (marks out of 100)
  RP: [35, 40, 15, 10],   // PU, QP, IPR, FPPP
  GO: [40, 15, 25, 20],   // GPH, GUE, GMS, GPHD
  OI: [30, 30, 20, 20],   // RD, WD, ESCS, PCS
};

/** Extract sub-scores from a computeScore result as a flat feature vector. */
export function extractSubScores(m: RawMetrics, category: string): SubScoreFeatures | null {
  const result = computeScore(m as any, { category: category as any, year: m.year });
  // Stage 2: only COMPLETE sub-scores are usable as training features. A
  // partial or missing-input sub-score is never silently zero-filled; the
  // whole record is rejected instead so no fabricated value reaches training.
  const complete = result.parameters.every((p) => p.subs.every((s) => s.status === "ok"));
  if (!complete) return null;

  const vals: Record<string, number> = {};
  for (const p of result.parameters) {
    for (const s of p.subs) {
      if (s.score !== null) vals[s.key] = s.score;
    }
  }

  return {
    ss: vals.ss,
    fsr: vals.fsr,
    fqe: vals.fqe,
    fru: vals.fru,
    pu: vals.pu,
    qp: vals.qp,
    ipr: vals.ipr,
    fppp: vals.fppp,
    gph: vals.gph,
    gue: vals.gue,
    gms: vals.gms,
    gphd: vals.gphd,
    rd: vals.rd,
    wd: vals.wd,
    escs: vals.escs,
    pcs: vals.pcs,
  };
}

/** Percentile of `v` within a sorted training array (fraction in [0,1]). */
export function percentile(v: number, sortedAsc: number[]): number {
  if (!sortedAsc.length) return 0.5;
  // Constant array — all values identical — return 0.5 (median)
  if (sortedAsc[0] === sortedAsc[sortedAsc.length - 1]) return 0.5;
  if (v <= sortedAsc[0]) return 0;
  if (v >= sortedAsc[sortedAsc.length - 1]) return 1;
  let lo = 0;
  let hi = sortedAsc.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo / (sortedAsc.length - 1);
}

/** Normalize features to percentiles using stored bands. */
export function normalizeFeatures(
  f: SubScoreFeatures,
  bands: Record<string, number[]>
): SubScoreFeatures {
  const out = {} as SubScoreFeatures;
  for (const k of FEATURE_KEYS) {
    out[k] = percentile(f[k], bands[k] || []);
  }
  return out;
}

export interface ModelConfig {
  category: string;
  featureOrder: FeatureKey[];
  percentileBands: Record<string, number[]>;
  featureWeights: Record<string, number>;
  rankIntercept: number;
  rankSlope: number;
  n: number;
  spearmanR: number;
}

/** Composite score in [0,1] from sub-score percentiles using NIRF-aligned weights. */
export function compositeScore(f: SubScoreFeatures, cfg: ModelConfig): number {
  // Weight each sub-score by its NIRF mark allocation within its parameter
  const allKeys: { key: FeatureKey; param: "TLR" | "RP" | "GO" | "OI"; idx: number }[] = [
    { key: "ss", param: "TLR", idx: 0 },
    { key: "fsr", param: "TLR", idx: 1 },
    { key: "fqe", param: "TLR", idx: 2 },
    { key: "fru", param: "TLR", idx: 3 },
    { key: "pu", param: "RP", idx: 0 },
    { key: "qp", param: "RP", idx: 1 },
    { key: "ipr", param: "RP", idx: 2 },
    { key: "fppp", param: "RP", idx: 3 },
    { key: "gph", param: "GO", idx: 0 },
    { key: "gue", param: "GO", idx: 1 },
    { key: "gms", param: "GO", idx: 2 },
    { key: "gphd", param: "GO", idx: 3 },
    { key: "rd", param: "OI", idx: 0 },
    { key: "wd", param: "OI", idx: 1 },
    { key: "escs", param: "OI", idx: 2 },
    { key: "pcs", param: "OI", idx: 3 },
  ];

  const paramWeights = { TLR: 0.30, RP: 0.30, GO: 0.20, OI: 0.10 };
  let totalWeighted = 0;
  let totalWeight = 0;

  for (const item of allKeys) {
    const nirfMarks = PARAM_WEIGHTS[item.param][item.idx];
    const paramW = paramWeights[item.param];
    const subWeight = nirfMarks * paramW; // effective weight of this sub-score
    totalWeighted += subWeight * f[item.key];
    totalWeight += subWeight;
  }

  return totalWeight > 0 ? totalWeighted / totalWeight : 0;
}

export function predictRank(cfg: ModelConfig, f: SubScoreFeatures): { composite: number; rank: number } {
  const composite = compositeScore(f, cfg);
  const rank = cfg.rankIntercept + cfg.rankSlope * composite;
  return { composite, rank: Math.max(1, Math.round(rank)) };
}

export function spearman(xs: number[], ys: number[]): number {
  const rankX = ranks(xs);
  const rankY = ranks(ys);
  const n = rankX.length;
  const mx = rankX.reduce((a, b) => a + b, 0) / n;
  const my = rankY.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rankX[i] - mx;
    const b = rankY[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(xs.length);
  for (let i = 0; i < idx.length; i++) out[idx[i].i] = i + 1;
  return out;
}

/** Default weights from NIRF mark allocations. */
export function defaultWeights(): Record<string, number> {
  return {
    ss: 20, fsr: 30, fqe: 20, fru: 30,
    pu: 35, qp: 40, ipr: 15, fppp: 10,
    gph: 40, gue: 15, gms: 25, gphd: 20,
    rd: 30, wd: 30, escs: 20, pcs: 20,
  };
}
