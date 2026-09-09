import type { Officiality } from "../../nirf/types";

export type SubStatus = "ok" | "partial" | "insufficient_data";

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