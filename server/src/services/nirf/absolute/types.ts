/**
 * NIRF ABSOLUTE-PARAMETER ENGINE — input & output types.
 *
 * These sub-parameters are computed ENTIRELY from the current-year dataset
 * (no prior-year history, no cross-institute percentiles), using the official
 * formula families:
 *
 *   FSR = 30 × min(15 × (F/N), 1)                       (TLR, 30 marks)
 *   GUE = 15 × min(Pooled Ng% / 80%, 1)                 (GO, 15 marks)
 *   PCS = Σ per-question facility marks, capped at 20   (OI, 20 marks)
 *   FQE = FQ(10) + FE(10)                               (TLR, 20 marks)
 *   WD  = 15×min(NWS/50%,1) + 15×min(NWF/20%,1)         (OI, 30 marks)
 *   RD  = 25×(OOS share) + 5×(OOC share)                (OI, 30 marks)
 *
 * Contribution to the overall 100-point score:
 *   contribution = (subScore / subMaxMarks) × (subMaxMarks × parameterWeight)
 *   where parameterWeight is TLR=0.30, GO=0.20, OI=0.10.
 *   Max contributions: FSR 9.0, FQE 6.0, GUE 3.0, PCS 2.0, WD 3.0, RD 3.0
 *   → the six absolute sub-parameters top out at 26.0 points of the 100.
 */

export type AbsoluteStatus = "computed" | "partial" | "unable";

export interface AbsoluteInput {
  /** Row-wise Faculty Details roster (verbatim rows). */
  facultyRoster?: FacultyRosterRow[];
  /** Fallback "Number of faculty members entered" summary count (no roster). */
  facultySummary?: number | null;
  /** Row-wise "Total Actual Student Strength" table (UG/PG program rows). */
  studentStrength?: ProgramStrengthRow[];
  /** "Ph.D Student Details" — current enrolment. */
  phdDetails?: PhdDetails;
  /** "Placement & Higher Studies" cohort rows across program durations. */
  placementCohorts?: PlacementCohort[];
  /** "Facilities of Physically Challenged Students" per-question answers. */
  pcsQuestions?: PcsQuestion[];
  /** Free-form note about how the input was assembled (source of truth). */
  coverageNote?: string;
}

export interface FacultyRosterRow {
  serial: number;
  designation: string;
  gender: string;
  qualification: string;
  experienceMonths: number;
  working: boolean;
}

export interface ProgramStrengthRow {
  label: string;
  male: number | null;
  female: number | null;
  total: number | null;
  withinState: number | null;
  outsideState: number | null;
  outsideCountry: number | null;
  economicallyBackward: number | null;
  sociallyChallenged: number | null;
}

export interface PhdDetails {
  /** Enrolled (current year). */
  fullTime: number | null;
  partTime: number | null;
  /** Most recent reported graduating year. */
  graduatedFullTime: number | null;
  graduatedPartTime: number | null;
}

export interface PlacementCohort {
  /** e.g. "UG [4 Years Program(s)]". */
  program: string;
  /** Program duration in years (4/5/2/…). */
  durationYears: number;
  admitYear: string;
  /** "No. of first year students intake in the year". */
  firstYearIntake: number | null;
  /** "No. of first year students admitted in the year". */
  firstYearAdmitted: number | null;
  /** Lateral-entry admit year (may be absent for PG tables). */
  lateralYear: string | null;
  /** "No. of students admitted through Lateral entry". */
  lateralAdmitted: number | null;
  gradYear: string;
  /** "No. of students graduating in minimum stipulated time". */
  graduatedInTime: number | null;
  /** Separate lateral in-time count IF the table reports it separately. */
  graduatedInTimeLateral: number | null;
  placed: number | null;
  medianSalary: number | null;
  higherStudies: number | null;
}

export interface PcsQuestion {
  key: "liftsRamps" | "wheelchairTransport" | "speciallyDesignedToilets";
  label: string;
  /** Verbatim answer text read from the PDF, e.g. "Yes, more than 80% of the buildings". */
  rawAnswer: string;
}

// ── Output ──────────────────────────────────────────────────────────────────

export interface CalcStep {
  /** Short operation name. */
  label: string;
  /** Literal arithmetic with the raw numbers plugged in. */
  equation: string;
  result: number | string | null;
}

export interface Flag {
  severity: "info" | "warning" | "error";
  message: string;
}

/** Marks a sub-parameter carries INSIDE its parameter (sums to 100/parameter). */
export const SUB_PARAMETER_MARKS = {
  fsr: 30,
  fqe: 20,
  gue: 15,
  pcs: 20,
  wd: 30,
  rd: 30,
  fru: 30,
} as const;

export type SubKey = keyof typeof SUB_PARAMETER_MARKS;

export type AbsoluteParameterCode = "TLR" | "GO" | "OI";

export interface SubParamResult {
  key: SubKey;
  /** Short label, e.g. "FSR". */
  label: string;
  /** Official full sub-parameter name. */
  officialName: string;
  /** Parent parameter code. */
  parameter: AbsoluteParameterCode;
  /** Parent parameter weight in the 100-point overall score. */
  parameterWeight: number;
  /** Marks this sub-parameter carries within its parameter. */
  maxMarks: number;
  /** Max points this sub-parameter can contribute to the overall 100. */
  maxContribution: number;
  /** Score out of `maxMarks`; null => unable to compute. */
  score: number | null;
  /** Points contributed to the overall 100; null => unable. */
  contribution: number | null;
  status: AbsoluteStatus;
  /** Exact source tables the formula read from. */
  sourceTables: string[];
  /** Tables the formula needed but the dataset did not provide. */
  missingTables: string[];
  /** Ordered arithmetic trace (literal equations). */
  steps: CalcStep[];
  /** Assumptions / exclusions / mismatches flagged. */
  flags: Flag[];
  /** official_formula | assumption | needs_verification. */
  officiality: "official_formula" | "assumption" | "needs_verification";
  /** Human-readable summary of what was computed and how. */
  note?: string;
}

export interface AbsoluteSummary {
  /** Sum of `contribution` for every sub-parameter that computed. */
  totalComputed: number;
  /** Fixed max across all six absolute sub-parameters (26.0). */
  totalMax: number;
  /** Sum of maxContribution for the sub-parameters that computed. */
  availableMax: number;
  hasUnable: boolean;
  unableKeys: SubKey[];
}

export interface AbsoluteReport {
  category: string;
  year: number;
  institution: { name?: string; id?: string } | null;
  inputs: Record<string, number | string | null>;
  subs: SubParamResult[];
  summary: AbsoluteSummary;
  methodologyNote: string;
}