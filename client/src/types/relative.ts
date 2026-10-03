export type SourceTag =
  | "from_dcs_pdf"
  | "cross_validated_web"
  | "historical_actual"
  | "rank_band_proxy"
  | "model_prediction"
  | "model_estimated"
  | "missing";

export type RelativeStatus = "computed" | "estimated" | "low_confidence" | "missing_data";

export type RelativeStrategy =
  | "cohort_ratio"
  | "cohort_log_ratio"
  | "linear_capped"
  | "gbm"
  | "historical_or_rank_band";

export type RelativeFieldKey =
  | "sanctionedIntake"
  | "enrolledStudents"
  | "phdStudents"
  | "permanentFaculty"
  | "facultyWithPhD"
  | "capitalExpenditure"
  | "operationalExpenditure"
  | "totalPublications"
  | "totalCitations"
  | "top25Citations"
  | "patentsFiled"
  | "patentsGranted"
  | "sponsoredResearchAmount"
  | "consultancyRevenue"
  | "graduatesPlaced"
  | "graduatesHigherStudies"
  | "medianSalary"
  | "phdGraduates";

export interface RelativeFieldValue {
  key: RelativeFieldKey;
  value: number | null;
  source: SourceTag;
  basis?: string;
  estimatedFallback?: boolean;
}

export interface CohortStat {
  max: number | null;
  median: number | null;
  mean: number | null;
  std: number | null;
  cohortSize: number | null;
  estimated?: boolean;
}

export type CohortStats = Partial<Record<string, CohortStat>>;

export interface CohortContext {
  year: number;
  category: string;
  stats: CohortStats;
  cohortSize: number | null;
  stale: boolean;
  note: string;
}

export interface RelativeStep {
  label: string;
  equation: string;
  result: number | string | null;
}

export interface RelativeFlag {
  severity: "info" | "warning" | "error";
  message: string;
}

export interface RelativeParamResult {
  key: string;
  code: string;
  name: string;
  parameter: "TLR" | "RP" | "GO" | "PR";
  parameterWeight: number;
  maxMarks: number;
  score: number | null;
  status: RelativeStatus;
  strategy: RelativeStrategy;
  originTag: "model_prediction" | "historical_actual" | "rank_band_proxy";
  confidence: number;
  confidenceLabel: string;
  sourceFields: RelativeFieldValue[];
  formulaLine: string;
  explanation: string;
  warning?: string;
  hasWarning: boolean;
  steps: RelativeStep[];
  flags: RelativeFlag[];
  missingFields: string[];
}

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

export interface RelativeModelMeta {
  seedBaseline: boolean;
  trainYears: number[];
  validateYear: number | null;
  provenanceNote: string;
}

export interface RelativePredictResponse {
  report: RelativeReport;
  modelMeta: RelativeModelMeta;
}