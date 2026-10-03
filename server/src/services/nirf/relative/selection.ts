/**
 * Parameter strategy selection (Step 2/3 conclusions).
 *
 * EDA of the scoring shapes across the dataset decides the model family per
 * parameter:
 *  - cohort-normalized (linear or log-scaled vs the cohort's best performer):
 *      PU, QP (log-scaled — right-skewed counts), IPR, FPPP.
 *  - bounded/saturating against a fixed benchmark (not cohort-relative):
 *      GPHD.
 *  - external survey, never derived: PR.
 *
 * Parameters removed (depend on Absolute-only fields): SS, FRU, GPH, MS.
 */

export const RATIO_KEYS = ["pu", "qp", "ipr", "fppp"] as const;

export const CAPPED_KEYS = ["gphd"] as const;

/** Extract the combined raw metric for a parameter from a record ("definition" mirror). */
export function ratioRawMetric(key: string, raw: Record<string, number | null | undefined>): number | null {
  switch (key) {
    case "pu": return raw.totalPublications ?? null;
    case "qp": return raw.totalCitations ?? null;
    case "ipr": return (raw.patentsGranted ?? 0) + (raw.patentsFiled ?? 0);
    case "fppp": return (raw.sponsoredResearchAmount ?? 0) + (raw.consultancyRevenue ?? 0);
    default: return null;
  }
}

/** Extract the combined raw metric for a capped parameter. */
export function cappedRawMetric(key: string, raw: Record<string, number | null | undefined>): number | null {
  switch (key) {
    case "gphd": return raw.phdGraduates ?? null;
    default: return null;
  }
}