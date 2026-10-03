export interface User {
  id: number;
  email: string;
  name: string;
  role?: "user" | "admin";
}

export interface Institution {
  id: number;
  name: string;
  category: string;
}

export interface TraceStep {
  label: string;
  equation: string;
  result: number | string | null;
}

export interface TraceFlag {
  severity: "info" | "warning" | "error";
  message: string;
}

export interface SubScore {
  key: string;
  label: string;
  officialName?: string;
  domain?: string;
  marks?: number;
  rawValue?: number;
  normalized?: number;
  score: number | null;
  status: "ok" | "partial" | "insufficient_data";
  excluded?: boolean;
  missingFields: string[];
  formula?: string;
  formulaRef?: string;
  officiality?: "official" | "calibrated_approximation" | "requires_verification";
  normalizationNote?: string;
  explanation?: string;
  contribution?: number | null;
  maxContribution?: number;
  steps?: TraceStep[];
  flags?: TraceFlag[];
}

export interface ParameterScore {
  parameter: "TLR" | "RP" | "GO" | "OI" | "PR";
  label: string;
  weight: number;
  weightedScore: number;
  unweightedScore: number | null;
  status?: "ok" | "partial" | "insufficient_data";
  subs: SubScore[];
  penalty?: number;
}

export interface ScoreResult {
  category: string;
  year: number;
  finalScore: number | null;
  finalWeighted: number | null;
  parameters: ParameterScore[];
  insufficientParams: string[];
  partialParams?: string[];
  renormalizedFinalScore?: number | null;
  hasInsufficientData: boolean;
}

export interface ScoreRow {
  id: number;
  institution_id: number;
  year: number;
  category: string;
  tlr: number | null;
  rp: number | null;
  go: number | null;
  oi: number | null;
  pr: number | null;
  rp_penalty: number | null;
  final_score: number | null;
  has_insufficient: boolean;
}

export interface PredictionResult {
  predictedRank: number;
  composite: number;
  confidence: number;
  model: { n: number; spearmanR: number };
  percentileScores: Record<string, number>;
  extracted: Record<string, number | boolean>;
  missing: string[];
  predictionId: number;
}
