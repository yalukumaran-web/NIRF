/**
 * NIRF DIFF CALCULATOR — comparison engine.
 *
 * Takes the report the EXISTING absolute engine already produced and sets it
 * beside the official values read from `expected_output/`. No formula lives
 * here: there is nothing to recalibrate, only two numbers to subtract.
 *
 *   delta = actual (official graph) − mine (absolute engine)
 *
 * A sub-parameter is only compared when BOTH sides exist. The engine's own
 * `partial` / `unable` status is carried through to the row so a comparison
 * that rests on an incomplete table is never presented as a clean one.
 */

import type { ExpectedOutputRecord } from "../../../data/expectedOutput2025";
import type { AbsoluteReport, SubKey } from "../absolute/types";
import type {
  DiffMatchMethod,
  DiffParamSpec,
  DiffReport,
  DiffRow,
  DiffSummary,
} from "./types";

/**
 * The seven sub-parameters NIRF prints on the official graphs that the absolute
 * engine also computes, in the order requested for the diff view.
 * `fqe` is surfaced as "FQU" (NIRF's parameter sheet label).
 */
export const DIFF_PARAMS: DiffParamSpec[] = [
  {
    key: "fsr",
    uiLabel: "FSR",
    officialName: "FSR: Faculty-Student Ratio",
    parameter: "TLR",
    maxMarks: 30,
  },
  {
    key: "fqe",
    uiLabel: "FQU",
    officialName: "FQE: Faculty Qualification & Experience",
    parameter: "TLR",
    maxMarks: 20,
  },
  {
    key: "gph",
    uiLabel: "GPH",
    officialName: "GPH: Placement and Higher Studies",
    parameter: "GO",
    maxMarks: 40,
  },
  {
    key: "wd",
    uiLabel: "WD",
    officialName: "WD: Women Diversity",
    parameter: "OI",
    maxMarks: 30,
  },
  {
    key: "rd",
    uiLabel: "RD",
    officialName: "RD: Region Diversity",
    parameter: "OI",
    maxMarks: 30,
  },
  {
    key: "pcs",
    uiLabel: "PCS",
    officialName: "PCS: Facilities for Physically Challenged",
    parameter: "OI",
    maxMarks: 20,
  },
  {
    key: "gue",
    uiLabel: "GUE",
    officialName: "GUE: Metric for University Examinations",
    parameter: "GO",
    maxMarks: 15,
  },
];

function officialScore(
  scores: ExpectedOutputRecord["scores"],
  key: SubKey
): number | null {
  const raw = (scores as unknown as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rowNote(row: {
  actual: number | null;
  mine: number | null;
  delta: number | null;
  status: DiffRow["status"];
  uiLabel: string;
}): string {
  if (row.actual === null) {
    return `Official ${row.uiLabel} was not readable on the graph — not compared.`;
  }
  if (row.mine === null || row.status === "unable") {
    return `The absolute engine could not compute ${row.uiLabel} (source table absent) — not compared.`;
  }
  const dir =
    Math.abs(row.delta ?? 0) < 0.005
      ? "matches the official value"
      : (row.delta ?? 0) > 0
        ? "official is higher than computed"
        : "computed is higher than official";
  const partial =
    row.status === "partial" ? " (computed from an incomplete source table)" : "";
  return `${row.delta! > 0 ? "+" : ""}${round2(row.delta ?? 0).toFixed(2)} — ${dir}${partial}.`;
}

export interface ComputeDiffInput {
  /** Report from `computeAbsolute` — used verbatim, never recomputed here. */
  report: AbsoluteReport;
  /** Official record read from `expected_output/`. */
  expected: ExpectedOutputRecord;
  /** Absolute path of the official graph. */
  imagePath: string;
  /** Public URL that serves the official graph. */
  imageUrl: string;
  /** How the upload was matched to the graph. */
  matchMethod: DiffMatchMethod;
}

export function computeDiff(input: ComputeDiffInput): DiffReport {
  const { report, expected } = input;

  const rows: DiffRow[] = DIFF_PARAMS.map((spec) => {
    const sub = report.subs.find((s) => s.key === spec.key);
    const actual = officialScore(expected.scores, spec.key);
    const mine = sub?.score ?? null;
    const status = sub?.status ?? "unable";
    const comparable = actual !== null && mine !== null;
    const delta = comparable ? round2((actual as number) - (mine as number)) : null;

    const row: DiffRow = {
      key: spec.key,
      uiLabel: spec.uiLabel,
      officialName: sub?.officialName ?? spec.officialName,
      parameter: spec.parameter,
      parameterWeight: sub?.parameterWeight ?? 0,
      maxMarks: spec.maxMarks,
      actual,
      mine,
      delta,
      absDelta: delta === null ? null : Math.abs(delta),
      status,
      sourceTables: sub?.sourceTables ?? [],
      missingTables: sub?.missingTables ?? [],
      note: "",
    };
    row.note = rowNote(row);
    return row;
  });

  const comparedRows = rows.filter((r) => r.delta !== null);
  const totalAbsDelta = comparedRows.reduce((sum, r) => sum + (r.absDelta ?? 0), 0);
  const worst = comparedRows.reduce<DiffRow | null>(
    (acc, r) => (acc === null || (r.absDelta ?? 0) > (acc.absDelta ?? 0) ? r : acc),
    null
  );

  const summary: DiffSummary = {
    compared: comparedRows.length,
    total: rows.length,
    unableKeys: rows.filter((r) => r.mine === null).map((r) => r.key),
    totalAbsDelta: round2(totalAbsDelta),
    meanAbsDelta:
      comparedRows.length > 0 ? round2(totalAbsDelta / comparedRows.length) : null,
    maxAbsDelta: worst ? (worst.absDelta ?? null) : null,
    maxAbsDeltaLabel: worst ? worst.uiLabel : null,
    maxAbsDeltaShare: worst ? round2((worst.absDelta ?? 0) / worst.maxMarks) : null,
  };

  return {
    category: report.category,
    year: report.year,
    institution: report.institution,
    expected: {
      slug: expected.slug,
      image: expected.image,
      imageUrl: input.imageUrl,
      nirfId: expected.nirfId,
      instituteName: expected.instituteName,
      title: expected.title,
      ocrConfidence: expected.ocrConfidence,
      matchMethod: input.matchMethod,
    },
    rows,
    summary,
    methodologyNote:
      "actual = the official value printed on the NIRF graph in `expected_output/` " +
      `(matched by ${input.matchMethod}); mine = the absolute-parameter engine's own ` +
      "sub-parameter score computed from the uploaded credentials PDF; delta = actual − mine. " +
      "The engine is reused unchanged and no value is imputed: a sub-parameter that either " +
      "side could not produce is left uncompared rather than defaulted.",
  };
}
