/**
 * NIRF DIFF CALCULATOR — comparison types.
 *
 * The diff calculator is a PURE COMPARISON layer. It does not compute anything
 * of its own: it takes the report produced by the existing absolute engine
 * (`computeAbsolute`, untouched) and sets it beside the official values read
 * from the repository's `expected_output/` graphs.
 *
 *   actual  = official value printed on the NIRF graph (`expected_output/`)
 *   mine    = value computed by the current absolute-parameter business logic
 *   delta   = actual − mine   (negative ⇒ the engine over-states the score)
 *
 * Discipline:
 *   - A sub-parameter the engine could not compute yields `mine: null` and
 *     `delta: null`. Nothing is imputed, defaulted or back-filled.
 *   - Every row carries the engine's own status so an "unable" cell can never be
 *     mistaken for a zero.
 */

import type { AbsoluteParameterCode, SubKey } from "../absolute/types";

/** How the uploaded PDF was matched to its official graph. */
export type DiffMatchMethod = "filename" | "nirf-id" | "name-exact" | "name-similar";

export interface DiffParamSpec {
  /** Absolute-engine sub-parameter key (identical to the graph's column key). */
  key: SubKey;
  /** Label shown in the UI. FQE is surfaced as "FQU" per the requested spec. */
  uiLabel: string;
  /** Official NIRF sub-parameter name. */
  officialName: string;
  /** Parent parameter code (TLR / GO / OI). */
  parameter: AbsoluteParameterCode;
  /** Marks this sub-parameter carries (30 / 20 / 40 / 15 / 20). */
  maxMarks: number;
}

export interface DiffRow {
  key: SubKey;
  uiLabel: string;
  officialName: string;
  parameter: AbsoluteParameterCode;
  parameterWeight: number;
  maxMarks: number;
  /** Official value from `expected_output/`; null when the graph cell was unreadable. */
  actual: number | null;
  /** Value produced by the absolute engine; null when it could not compute. */
  mine: number | null;
  /** actual − mine; null when either side is missing. */
  delta: number | null;
  /** |delta|; null when either side is missing. */
  absDelta: number | null;
  /** Engine status for the "mine" side: computed | partial | unable. */
  status: "computed" | "partial" | "unable";
  /** Source tables the engine read for this sub-parameter. */
  sourceTables: string[];
  /** Tables the engine needed but the PDF did not provide. */
  missingTables: string[];
  /** One-line explanation of the delta. */
  note: string;
}

export interface DiffSummary {
  /** Number of rows where both sides exist and a delta could be formed. */
  compared: number;
  /** Rows in the comparison set (always DIFF_PARAMS.length). */
  total: number;
  /** Sub-parameters the engine could not compute. */
  unableKeys: SubKey[];
  /** Σ |delta| across compared rows. */
  totalAbsDelta: number;
  /** Mean |delta| across compared rows; null when nothing was comparable. */
  meanAbsDelta: number | null;
  /** Largest |delta| across compared rows; null when nothing was comparable. */
  maxAbsDelta: number | null;
  /** uiLabel of the row carrying `maxAbsDelta`. */
  maxAbsDeltaLabel: string | null;
  /** Max |delta| as a share of that sub-parameter's maxMarks (0-1). */
  maxAbsDeltaShare: number | null;
}

export interface DiffReport {
  category: string;
  year: number;
  institution: { name?: string; id?: string } | null;
  /** The official graph this comparison is anchored to. */
  expected: {
    slug: string;
    image: string;
    /** Public URL of the official graph, served from `expected_output/`. */
    imageUrl: string;
    nirfId: string;
    instituteName: string;
    title: string;
    ocrConfidence: number;
    /** How the uploaded PDF was matched to this graph. */
    matchMethod: DiffMatchMethod;
  };
  rows: DiffRow[];
  summary: DiffSummary;
  methodologyNote: string;
}
