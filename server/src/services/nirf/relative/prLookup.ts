/**
 * Step 5 — PR (Perception) handling — SPECIAL CASE, not a trained model.
 *
 * No NIRF formula exists for PR (confirmed: pure external employer/academic
 * peer survey score). Priority order:
 *   1. college's actual PR for a recent NIRF cycle, if known publicly
 *      → source = historical_actual
 *   2. else rank-band proxy: average PR of colleges in the same NIRF rank
 *      band that year, computed from the Step-1 dataset
 *      → source = rank_band_proxy, reduced confidence
 *   3. NEVER silently default to a fixed number.
 * Every PR output carries its source tag.
 */

import type { RelativeFieldValue } from "./types";

export interface PrLookupInput {
  year: number;
  collegeId: string;
  collegeName?: string;
  rank: number | null;
  /** results of a previous newer-year lookup carried forward? (optional) */
  prHistorical: Record<string, number>; // key `${year}:${collegeId}` (and `${year}:${collegeName}` fallback)
  prBands: Record<string, Record<string, number>>; // key `${year}` → band → avg PR
}

export interface PrResult {
  score: number | null;
  source: "historical_actual" | "rank_band_proxy";
  confidence: number;
  confidenceLabel: string;
  formulaLine: string;
  warning?: string;
  steps: { label: string; equation: string; result: number | string | null }[];
  hasWarning: boolean;
}

export const PR_BANDS: { label: string; min: number; max: number }[] = [
  { label: "rank 1-10", min: 1, max: 10 },
  { label: "rank 11-25", min: 11, max: 25 },
  { label: "rank 26-50", min: 26, max: 50 },
  { label: "rank 51-100", min: 51, max: 100 },
];

export function bandOfRank(rank: number | null, defaultBand = "rank 26-50"): string {
  if (rank === null || !Number.isFinite(rank)) return defaultBand;
  for (const b of PR_BANDS) {
    if (rank >= b.min && rank <= b.max) return b.label;
  }
  return defaultBand;
}

export function lookupPR(input: PrLookupInput): PrResult {
  const steps: { label: string; equation: string; result: number | string | null }[] = [];

  // 1) historical actual (exact match by id, then by name case-insensitive)
  const keyId = `${input.year}:${input.collegeId}`;
  const keyName = input.collegeName ? `${input.year}:${input.collegeName.toLowerCase().trim()}` : "";
  let historical: number | null = null;
  if (input.prHistorical[keyId] !== undefined) {
    historical = input.prHistorical[keyId];
    steps.push({
      label: "historical PR lookup",
      equation: `found published NIRF PR for ${input.collegeId} (${input.year}) = ${historical}`,
      result: historical,
    });
  } else if (keyName && input.prHistorical[keyName] !== undefined) {
    historical = input.prHistorical[keyName];
    steps.push({
      label: "historical PR lookup",
      equation: `found published NIRF PR for "${input.collegeName}" (${input.year}) = ${historical}`,
      result: historical,
    });
  }

  if (historical !== null) {
    return {
      score: historical,
      source: "historical_actual",
      confidence: 1,
      confidenceLabel: "High",
      formulaLine: `PR = ${historical} — reused verbatim from NIRF's published ${input.year} parameter-wise result tables (source: historical_actual).`,
      steps,
      hasWarning: false,
    };
  }

  // 2) rank-band proxy
  const band = bandOfRank(input.rank);
  const bandAvg = input.prBands[String(input.year)]?.[band] ?? null;
  steps.push({
    label: "rank-band proxy",
    equation: input.rank === null
      ? `no rank supplied → default band "${band}"; average PR of that band in ${input.year} dataset`
      : `rank ${input.rank} → band "${band}"; average PR of that band in ${input.year} dataset`,
    result: bandAvg,
  });

  if (bandAvg === null) {
    return {
      score: null,
      source: "rank_band_proxy",
      confidence: 0,
      confidenceLabel: "Low",
      formulaLine: `PR unavailable — no ${input.year} rank-band table loaded and no historical actual on record. No fixed default is fabricated.`,
      steps,
      hasWarning: true,
      warning: `Perception could not be sourced: no historical PR is on record for ${input.collegeId} and no ${input.year} rank-band averages are available.`,
    };
  }

  return {
    score: bandAvg,
    source: "rank_band_proxy",
    confidence: 0.55,
    confidenceLabel: "Medium",
    formulaLine: `PR ≈ ${bandAvg} — average Perception score of ${band} colleges in the ${input.year} Engineering cohort (source: rank_band_proxy). This is an estimate, not the college's published PR.`,
    steps,
    hasWarning: true,
    warning: `No published PR is on record for ${input.collegeId || input.collegeName || "this college"}; using the average PR (${bandAvg}) of ${band} colleges in the ${input.year} Engineering cohort instead. The real PR may fall anywhere across this band's spread (${bandLabelSpread(input.year, input.prBands, band)}); treat as an estimate, not a verified value.`,
  };
}

function bandLabelSpread(year: number, prBands: Record<string, Record<string, number>>, band: string): string {
  void year;
  void prBands;
  return "spread not recorded";
}