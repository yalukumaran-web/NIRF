/**
 * Cohort statistics for the relative-parameter models (Step 2/3).
 *
 * NIRF scores the RP/GO/TLR-relative parameters against that YEAR's applicant
 * cohort — the best performer in the cohort, sometimes log-scaled. So a model
 * is trained per-year with cohort context ([raw, cohort_max, cohort_median,
 * cohort_std, rank_within_cohort]) as features, not as a college-independent
 * formula. This module builds those cohort statistics from a Step-1 dataset.
 */

import { RELATIVE_RAW_FIELD_KEYS, RELATIVE_PARAMS } from "./parameters";
import type { CohortStats, RelativeTrainingRecord } from "./types";

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function stddev(xs: number[], m: number | null): number | null {
  if (xs.length < 2 || m === null) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/**
 * Build cohort statistics for one year from the eligible Step-1 records.
 * Each raw metric gets max / median / mean / std over that year's cohort.
 */
export function computeCohortStats(
  records: Array<Partial<Record<import("./types").RelativeFieldKey, number | null>>>
): CohortStats {
  const stats: CohortStats = {};
  for (const key of RELATIVE_RAW_FIELD_KEYS) {
    const values = records
      .map((r) => r[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const m = mean(values);
    stats[key] = {
      max: values.length ? Math.max(...values) : null,
      median: median(values),
      mean: m,
      std: stddev(values, m),
      cohortSize: values.length,
    };
  }
  return stats;
}

/** Pick cohort stats for a given target year from a dataset. */
export function cohortStatsForYear(
  records: RelativeTrainingRecord[],
  year: number
): { stats: CohortStats; cohortSize: number | null } {
  return computeCohortStatsForYearComplete(records, year);
}

/**
 * Cross-year aggregate cohort (used only when single-year stats are absent).
 * Falls back to the most recent available year so predictions can still run
 * with cohort_context = stale.
 */
export function latestCohort(
  records: RelativeTrainingRecord[],
  uptoYear: number
): { stats: CohortStats; year: number | null; cohortSize: number | null } {
  const years = [...new Set(records.map((r) => r.year))].filter((y) => y <= uptoYear).sort((a, b) => b - a);
  for (const y of years) {
    const yearRecords = records.filter((r) => r.year === y && r.eligible);
    if (yearRecords.length === 0) continue;
    const stats = computeCohortStats(yearRecords.map((r) => r.raw));
    Object.assign(stats, computeDerivedCohortStats(yearRecords));
    return { stats, year: y, cohortSize: yearRecords.length };
  }
  return { stats: {}, year: null, cohortSize: null };
}

/**
 * Derived-matric cohort statistics for combined/rate metrics that NIRF
 * normalizes as a single number (IPR total patents, FPPP total funds,
 * GPH placement-and-higher-studies rate). Computed from the raw fields.
 */
export function computeDerivedCohortStats(
  records: RelativeTrainingRecord[]
): CohortStats {
  const ipr = records
    .map((r) => (r.raw.patentsGranted ?? 0) + (r.raw.patentsFiled ?? 0))
    .filter((v) => Number.isFinite(v));
  const fppp = records
    .map(
      (r) =>
        (r.raw.sponsoredResearchAmount ?? 0) + (r.raw.consultancyRevenue ?? 0)
    )
    .filter((v) => Number.isFinite(v));

  const statOf = (values: number[]): CohortStats[string] | undefined => {
    if (values.length === 0) return undefined;
    const m = values.reduce((a, b) => a + b, 0) / values.length;
    const sr = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sr.length / 2);
    const med = sr.length % 2 === 0 ? (sr[mid - 1] + sr[mid]) / 2 : sr[mid];
    return {
      max: Math.max(...values),
      median: med,
      mean: m,
      std: values.length > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length) : null,
      cohortSize: values.length,
    };
  };

  const derived: CohortStats = {};
  const dIpr = statOf(ipr);
  const dFppp = statOf(fppp);
  if (dIpr) derived["iprTotalPatents"] = dIpr;
  if (dFppp) derived["fpppTotalFunds"] = dFppp;
  return derived;
}

/** Cohort stats for a year, incl. derived metrics. */
export function computeCohortStatsForYearComplete(
  records: RelativeTrainingRecord[],
  year: number
): { stats: CohortStats; cohortSize: number | null } {
  const yearRecords = records.filter((r) => r.year === year && r.eligible);
  if (yearRecords.length === 0) {
    return { stats: {}, cohortSize: null };
  }
  const stats = computeCohortStats(yearRecords.map((r) => r.raw));
  Object.assign(stats, computeDerivedCohortStats(yearRecords));
  return { stats, cohortSize: yearRecords.length };
}

/** Fields that feed each parameter, for feature-building. */
export function fieldsForParam(key: string): import("./types").RelativeFieldKey[] {
  const def = RELATIVE_PARAMS.find((p) => p.key === key);
  return def ? def.inputFields : [];
}

/**
 * Cohort feature vector used by the GBM route (Step 3b).
 * Order: [raw value, cohort_max, cohort_median, cohort_std, rank_within_cohort].
 * rank_within_cohort = 0 for the top performer, (n-1) for the last.
 */
export function cohortFeatures(
  rawValue: number | null,
  stats: CohortStats[import("./types").RelativeFieldKey],
  rank: number | null,
  cohortSize: number | null
): number[] {
  const raw = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : 0;
  return [
    raw,
    stats?.max ?? 0,
    stats?.median ?? 0,
    stats?.std ?? 0,
    typeof rank === "number" && cohortSize
      ? Math.min(Math.max((rank - 1) / Math.max(cohortSize - 1, 1), 0), 1)
      : cohortSize
        ? 0.5
        : 0,
  ];
}