/**
 * Relative-parameter catalog for the NIRF prediction module.
 *
 * IMPORTANT: Only parameters that use fields NOT present in the Absolute engine
 * are included. Parameters depending on Absolute-only fields (SS, FRU, GPH, MS)
 * have been removed.
 *
 * Remaining parameters:
 *   RP  → PU (35), QP (40), IPR (15), FPPP (10)
 *   GO  → GPHD (20)
 *   PR  → Perception (100)
 *
 * Max marks and parameter weights follow NIRF's official engineering
 * methodology. Each entry carries the plain-language explanation surfaced by
 * the UI (Step 8), the raw input fields that feed it, and the default scoring
 * strategy selected for it (Step 2/3).
 */

import type { RelativeFieldKey, RelativeStrategy } from "./types";

export interface RelativeParamDef {
  key: string;
  code: string;
  /** Official full name. */
  name: string;
  parameter: "TLR" | "RP" | "GO" | "PR";
  parameterLabel: string;
  parameterWeight: number;
  maxMarks: number;
  /**
   * Default strategy (Step 2/3 decision):
   *  - PU / QP  → cohort_log_ratio  (skewed publication/citation counts)
   *  - IPR / FPPP / GPH / MS → cohort_ratio (relative to best performer)
   *  - SS / FRU / GPHD → linear_capped (bounded/saturating, fixed benchmark)
   *  - PR → historical_or_rank_band (external survey, never derived)
   */
  defaultStrategy: RelativeStrategy;
  /** Raw field keys consumed by this parameter. */
  inputFields: RelativeFieldKey[];
  /** Explanation of what NIRF actually measures & how it is derived. */
  explanation: string;
}

export const RELATIVE_PARAMS: RelativeParamDef[] = [
  {
    key: "pu",
    code: "PU",
    name: "Publications",
    parameter: "RP",
    parameterLabel: "Research & Professional Practice",
    parameterWeight: 0.3,
    maxMarks: 35,
    defaultStrategy: "cohort_log_ratio",
    inputFields: ["totalPublications"],
    explanation:
      "Publications score reflects your total Scopus/Web-of-Science indexed papers over the 3-year window, scored relative to the highest-performing institution in your peer group that year — not against a fixed target. Because publication counts are right-skewed, the ratio is log-scaled so the leader does not crush mid-tier colleges.",
  },
  {
    key: "qp",
    code: "QP",
    name: "Quality of Publications",
    parameter: "RP",
    parameterLabel: "Research & Professional Practice",
    parameterWeight: 0.3,
    maxMarks: 40,
    defaultStrategy: "cohort_log_ratio",
    inputFields: ["totalCitations", "top25Citations", "totalPublications"],
    explanation:
      "QP measures citation impact: how much your work is cited, and how much of it lives in top-25% journals. Like PU it is cohort-relative against the year's best citation performer, log-scaled because citations are strongly skewed.",
  },
  {
    key: "ipr",
    code: "IPR",
    name: "IPR & Patents",
    parameter: "RP",
    parameterLabel: "Research & Professional Practice",
    parameterWeight: 0.3,
    maxMarks: 15,
    defaultStrategy: "cohort_ratio",
    inputFields: ["patentsFiled", "patentsGranted"],
    explanation:
      "IPR scores patents filed/published and patents granted, relative to the most prolific patenting institution in your cohort that year. Granted patents weigh more than filed ones.",
  },
  {
    key: "fppp",
    code: "FPPP",
    name: "Footprint — Sponsored Research & Consultancy",
    parameter: "RP",
    parameterLabel: "Research & Professional Practice",
    parameterWeight: 0.3,
    maxMarks: 10,
    defaultStrategy: "cohort_ratio",
    inputFields: ["sponsoredResearchAmount", "consultancyRevenue"],
    explanation:
      "FPPP (NIRF: Projects and Professional Practice) scores sponsored-research funds and consultancy revenue, combined and then normalized against the cohort's best-funded institution that year.",
  },
  {
    key: "gphd",
    code: "GPHD",
    name: "PhD Graduates",
    parameter: "GO",
    parameterLabel: "Graduation Outcomes",
    parameterWeight: 0.2,
    maxMarks: 20,
    defaultStrategy: "linear_capped",
    inputFields: ["phdGraduates"],
    explanation:
      "GPHD rewards the number of PhD graduates in the window against a fixed benchmark, saturating at 20 marks past the threshold — a bounded, non-relative measure.",
  },
  {
    key: "pr",
    code: "PR",
    name: "Perception",
    parameter: "PR",
    parameterLabel: "Peer Perception & Employer Survey",
    parameterWeight: 0.1,
    maxMarks: 100,
    defaultStrategy: "historical_or_rank_band",
    inputFields: [],
    explanation:
      "Perception has NO derivable formula — it is an external peer/employer survey score published by NIRF. The module reuses a published historical actual when available (source=historical_actual), otherwise falls back to the average PR of colleges in your NIRF rank band that year (source=rank_band_proxy). It is never silently defaulted to a fixed number.",
  },
];

export const RELATIVE_PARAMS_BY_KEY: Record<string, RelativeParamDef> = Object.fromEntries(
  RELATIVE_PARAMS.map((p) => [p.key, p])
);

/** All raw fields the module consumes (for completeness scoring). Only fields NOT in the Absolute engine. */
export const RELATIVE_RAW_FIELD_KEYS: RelativeFieldKey[] = [
  "capitalExpenditure",
  "operationalExpenditure",
  "totalPublications",
  "totalCitations",
  "top25Citations",
  "patentsFiled",
  "patentsGranted",
  "sponsoredResearchAmount",
  "consultancyRevenue",
  "phdGraduates",
];