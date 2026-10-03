import type { Officiality } from "../../nirf/types";

export type SubStatus = "ok" | "partial" | "insufficient_data";

/** One arithmetic step in a sub-parameter's calculation (values plugged in). */
export interface Step {
  label: string;
  equation: string;
  result: number | string | null;
}

/** Honest transparency flag — mirrors the absolute module's severity levels. */
export interface Flag {
  severity: "info" | "warning" | "error";
  message: string;
}

export interface SubScore {
  key: string;
  label: string;
  /** Official NIRF sub-parameter full name (from methodology config). */
  officialName?: string;
  /** e.g. "TLR.SS" — parameter code + sub key. */
  domain?: string;
  /** Max marks out of 100 assigned to this sub-parameter. */
  marks?: number;
  /** Normalized value [0,1] before mark scaling. */
  rawValue?: number;
  /** Clamped normalized value [0,1]. */
  normalized?: number;
  /** Marks scored (0..marks). null => insufficient data. */
  score: number | null; // null => insufficient data
  status: SubStatus;
  /** True when the sub-parameter was deliberately excluded from computation
   *  (e.g. absolute-methodology parameters skipped in the relative PDF flow).
   *  Its score is null — it neither helps nor penalizes the parameter, which
   *  renormalizes over the included marks. */
  excluded?: boolean;
  missingFields: string[];
  /** Human-readable formula as published (or best known). */
  formula?: string;
  /** Official document reference. */
  formulaRef?: string;
  /** official | calibrated_approximation | requires_verification. */
  officiality?: Officiality;
  /** Description of the normalization rule applied. */
  normalizationNote?: string;
  /** Plain-language explanation of what the metric rewards. */
  explanation?: string;
  /** Weighted contribution to the final 100-scale score (score × parameter weight). */
  contribution?: number | null;
  /** Max possible contribution (marks × parameter weight). */
  maxContribution?: number;
  /** Ordered arithmetic trace with actual values used (mirrors the absolute module). */
  steps?: Step[];
  /** Transparency flags: missing / partial / below-threshold messages. */
  flags?: Flag[];
}

export interface ParameterScore {
  parameter: "TLR" | "RP" | "GO" | "OI" | "PR";
  label: string;
  /** Official NIRF parameter full name. */
  officialName?: string;
  weight: number;
  weightedScore: number; // 0-100 * weight
  unweightedScore: number | null; // null if insufficient data
  status: "ok" | "partial" | "insufficient_data";
  subs: SubScore[];
  penalty?: number;
}

export interface ScoreResult {
  category: string;
  year: number;
  finalScore: number | null;
  finalWeighted: number | null; // finalScore already weighted to 100 scale
  parameters: ParameterScore[];
  insufficientParams: string[];
  hasInsufficientData: boolean;
  /** Parameters computed from only a subset of their inputs (renormalized). */
  partialParams?: string[];
  /** Score renormalized over whichever parameters had data (0-100). */
  renormalizedFinalScore?: number | null;
  /** Methodology configuration used for this calculation. */
  methodologyVersion?: string;
  methodologyName?: string;
  methodologySource?: string;
  finalScoreFormula?: string;
}