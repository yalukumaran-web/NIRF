/**
 * NIRF RELATIVE-PARAMETER PREDICTION MODULE — input & output types.
 *
 * This module is a NET-NEW, ADDITIVE service alongside the Absolute Parameters
 * module (FSR, GUE, PCS, FQE, WD, RD). It predicts the sub-parameters that
 * NIRF scores RELATIVELY (against that year's applicant cohort) rather than
 * against a fixed absolute benchmark.
 *
 * IMPORTANT: Relative fields contain ONLY fields NOT present in the Absolute
 * engine. Fields that are already computed by Absolute (permanentFaculty,
 * facultyWithPhD, enrolledStudents, phdStudents, sanctionedIntake,
 * graduatesPlaced, graduatesHigherStudies, medianSalary) are excluded.
 *
 * Remaining relative parameters:
 *   RP   → PU (35), QP (40), IPR (15), FPPP (10)
 *   GO   → GPHD (20)
 *   PR   → Perception (100)  — external survey, never derived from data.
 *
 * Parameters that depend on Absolute-only fields (SS, FRU, GPH, MS) have been
 * removed since those fields are exclusively handled by the Absolute engine.
 *
 * Max marks match NIRF's official engineering sub-parameter allocation. Every
 * output carries full provenance: source tags per raw input, the exact formula
 * (or model) used, an arithmetic trace, plain-language warnings naming the
 * actual missing/estimated fields, and a confidence label.
 */

export type SourceTag =
  | "from_dcs_pdf" // raw figure read verbatim from the institution's DCS submission
  | "cross_validated_web" // raw figure sourced/cross-checked from the institution's own website/annual report
  | "historical_actual" // published NIRF result (target score) reused verbatim
  | "rank_band_proxy" // PR estimate = average PR of the college's NIRF rank band
  | "model_prediction" // score produced by a fitted per-parameter model
  | "model_estimated" // raw input itself was estimated (cohort-median/fallback), not sourced
  | "missing"; // field not found in any source

export type RelativeStatus =
  | "computed" // every required input verbatim, cohort current, closed-form or model within tolerance
  | "estimated" // some input was model-estimated / source was cross-validated web, or cohort stale
  | "low_confidence" // significant missing inputs or a fallback (e.g. PR rank-band proxy)
  | "missing_data"; // one or more mandatory raw inputs absent — value unreliable

export type RelativeStrategy =
  | "cohort_ratio" // score = maxMarks × min(raw / cohort_max, 1)
  | "cohort_log_ratio" // score = maxMarks × min(log(1+raw) / log(1+cohort_max), 1) — skewed metrics
  | "linear_capped" // linear up to a fixed benchmark threshold, then flat at maxMarks
  | "gbm" // gradient-boosted regressor on [raw, cohort_max, cohort_median, cohort_std, rank]
  | "historical_or_rank_band"; // PR only — real published value, else rank-band proxy

// ── Raw input ────────────────────────────────────────────────────────────────

export type RelativeFieldKey =
  | "capitalExpenditure"
  | "operationalExpenditure"
  | "totalPublications"
  | "totalCitations"
  | "top25Citations"
  | "patentsFiled"
  | "patentsGranted"
  | "sponsoredResearchAmount"
  | "consultancyRevenue"
  | "phdGraduates";

/** One raw input value with provenance tags. */
export interface RelativeFieldValue {
  key: RelativeFieldKey;
  value: number | null;
  source: SourceTag;
  /** Human-readable basis: which DCS table / web page / fallback. */
  basis?: string;
  /** True when a missing field was substituted with an estimate. */
  estimatedFallback?: boolean;
}

export interface RelativeRawInput {
  instituteName?: string;
  instituteId?: string;
  rank?: number | null;
  /** Any subset of the relative-only raw fields; missing keys are treated as absent. Fields already computed by the Absolute engine (permanentFaculty, facultyWithPhD, enrolledStudents, phdStudents, sanctionedIntake, graduatesPlaced, graduatesHigherStudies, medianSalary) are excluded. */
  fields: Partial<Record<RelativeFieldKey, RelativeFieldValue>>;
}

// ── Cohort context ───────────────────────────────────────────────────────────

export interface CohortStat {
  /** Column/cohort max for the raw metric that year (denominator of ratio). */
  max: number | null;
  median: number | null;
  mean: number | null;
  std: number | null;
  /** Number of applicant institutions contributing to this cohort statistic. */
  cohortSize: number | null;
  /** True when this statistic is a calibrated baseline, not measured from real DCS data. */
  estimated?: boolean;
}

/**
 * Cohort statistics have one entry per raw field PLUS derived combined-metric
 * keys that NIRF normalizes (e.g. "iprTotalPatents" = granted+filed).
 */
export type CohortStats = Partial<Record<string, CohortStat>>;

export interface CohortContext {
  year: number;
  category: string;
  stats: CohortStats;
  cohortSize: number | null;
  /** True when stats are stale (prediction year != stats year). */
  stale: boolean;
  /** Human note describing how the cohort stats were obtained. */
  note: string;
}

// ── Trace / flags ────────────────────────────────────────────────────────────

export interface RelativeStep {
  label: string;
  /** Literal arithmetic with the raw numbers plugged in. */
  equation: string;
  result: number | string | null;
}

export interface RelativeFlag {
  severity: "info" | "warning" | "error";
  message: string;
}

// ── Per-parameter result ─────────────────────────────────────────────────────

export interface RelativeGbmModel {
  init: number;
  lr: number;
  trees: RelativeGbmTree[];
  featureOrder: string[];
}

export interface RelativeGbmTree {
  value: number;
  featureIndex: number;
  threshold: number;
  left?: RelativeGbmTree;
  right?: RelativeGbmTree;
}

export interface RelativeParamResult {
  key: string; // "pu" | "qp" | "ipr" | "fppp" | "gphd" | "pr"
  code: string; // "SS"
  name: string; // official full name
  parameter: "TLR" | "RP" | "GO" | "PR";
  parameterWeight: number; // 0.30 etc.
  maxMarks: number; // e.g. 35
  score: number | null; // predicted out of maxMarks
  status: RelativeStatus;
  strategy: RelativeStrategy;
  /** Where this value came from: model_prediction / historical_actual / rank_band_proxy. */
  originTag: "model_prediction" | "historical_actual" | "rank_band_proxy";
  confidence: number; // 0..1
  confidenceLabel: string; // "Confidence: High" etc.
  /** Data-source subtitle (step 8:2): which raw input fields fed this param. */
  sourceFields: RelativeFieldValue[];
  /** One-line human formula statement reflecting cohort-relative nature. */
  formulaLine: string;
  /** Plain-language explanation what NIRF measures for this parameter. */
  explanation: string;
  /** Amber warning box text; only present when exclusions/estimates occurred. */
  warning?: string;
  /** Whether the warning/note box should be rendered. */
  hasWarning: boolean;
  /** Ordered arithmetic trace incl. cohort-derived intermediates. */
  steps: RelativeStep[];
  flags: RelativeFlag[];
  /** Raw inputs this param required but were absent/missing. */
  missingFields: string[];
}

// ── Report ───────────────────────────────────────────────────────────────────

export interface RelativeReport {
  category: string;
  year: number;
  institution: { name?: string; id?: string } | null;
  cohort: CohortContext;
  params: RelativeParamResult[];
  summary: {
    cohortYearUsed: number;
    cohortStale: boolean;
    averageConfidence: number;
    estimatedFields: string[];
    missingFields: string[];
  };
  methodologyNote: string;
}

// ── Training dataset (Step 1) ────────────────────────────────────────────────

export interface RelativeTrainingRecord {
  collegeId: string;
  collegeName: string;
  year: number;
  category: string;
  rank: number | null;
  /** Raw institutional inputs with provenance (from_dcs_pdf / cross_validated_web)… */
  raw: Partial<Record<RelativeFieldKey, number | null>>;
  /** …with a parallel map of the source tag of each raw value. */
  rawSources: Partial<Record<RelativeFieldKey, SourceTag>>;
  /** Target = NIRF-published sub-parameter scores for that college/year. */
  targets: Partial<Record<"pu" | "qp" | "ipr" | "fppp" | "gphd" | "pr", number | null>>;
  /** 0..1 fraction of the required raw fields present. */
  completeness: number;
  /** True when the record passed the completeness threshold into the training set. */
  eligible: boolean;
  /** Provenance of this record (from_dcs_pdf / cross_validated_web / seed_baseline_demo). */
  provenance: string;
}

// ── Model artifact ───────────────────────────────────────────────────────────

export interface RelativeModelArtifact {
  version: string;
  trainedAt: string;
  category: string;
  trainYears: number[];
  validateYear: number;
  countTrain: number;
  countValidate: number;
  /** Per-parameter fitted model specs + chosen strategy. */
  params: Partial<
    Record<
      "pu" | "qp" | "ipr" | "fppp" | "gphd",
      {
        strategy: RelativeStrategy;
        maxMarks: number;
        /** For cohort_ratio family: scaling flags. */
        logScaled?: boolean;
        /** For linear_capped: the fixed benchmark threshold. */
        benchmark?: number;
        /** For gbm: the fitted model + feature order. */
        gbm?: RelativeGbmModel;
        mae: number;
        maxError: number;
        chosenBy: "formula" | "gbm";
      }
    >
  >;
  /** Per-year cohort stats snapshot used by the shipped model. */
  cohort: CohortContext;
  /** PR rank-band lookup tables (per year). */
  prBands: Record<string, Record<string, number>>;
  /** Historical PR actuals keyed `${year}:${collegeId}`. */
  prHistorical: Record<string, number>;
  /** Provenance honesty: true means cohort/targets came from a calibrated demo baseline. */
  seedBaseline: boolean;
  provenanceNote: string;
}

// ── Validation / error report (Step 3, 6, 10) ────────────────────────────────

export interface ParamErrorSummary {
  key: string;
  mae: number;
  maxError: number;
  withinTolerance: number; // count of colleges within ±2 marks
  total: number;
  worst: { collegeId: string; actual: number | null; predicted: number | null; error: number }[];
}

export interface RelativeErrorReport {
  validateYear: number;
  perParam: ParamErrorSummary[];
  overallMae: number;
  collegesFlagged: { collegeId: string; collegeName: string; param: string; error: number }[];
  passedTolerance: boolean;
  note: string;
}