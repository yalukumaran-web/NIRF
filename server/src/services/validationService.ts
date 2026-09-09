/**
 * Data validation service (Phase 3).
 *
 * Produces a structured validation report for submitted NIRF credentials,
 * driven by the methodology field catalog (server/src/nirf/fields.ts) rather
 * than hard-coded rules. Checks:
 *   - completeness  : required / needed fields present and finite
 *   - range         : numeric bounds from the field metadata
 *   - plausibility  : cross-field invariants (e.g. women <= enrolled,
 *                     top-25 citations <= total citations, ...)
 *   - calculation-readiness : whether the engine can produce each parameter
 *
 * The report drives the UI wizard (per-section status), the API response
 * (fields/raw-metrics endpoint) and the upload acceptance decision.
 */

import { getMethodology } from "../nirf/registry";
import type { FieldMetadata, NIRFCategory } from "../nirf/types";
import type { RawMetrics } from "../types/metrics";

export type ValidationSeverity = "error" | "warning" | "ok";

export interface FieldIssue {
  fieldId: string;
  key: string;
  label: string;
  severity: ValidationSeverity;
  message: string;
  submittedValue?: number | boolean | string | null;
}

export interface ValidationSection {
  parameter: string;
  label: string;
  issues: FieldIssue[];
  errors: number;
  warnings: number;
}

export interface ValidationSummary {
  complete: boolean; // no errors anywhere
  finalScoreAvailable: boolean; // complete AND perceptionScore provided
  errorCount: number;
  warningCount: number;
  filledRequired: number;
  totalRequired: number;
  completenessPercent: number;
  missingRequiredKeys: string[];
  missingNeededKeys: string[];
  insufficientParameters: string[]; // parameters whose engine-critical inputs are incomplete
}

export interface ValidationReport {
  category: NIRFCategory;
  year: number;
  summary: ValidationSummary;
  sections: ValidationSection[];
  fields: FieldIssue[]; // flattened
}

export type MetricValue = number | boolean | string | null | undefined;

export function readValue(metrics: RawMetrics, key: string): MetricValue {
  return (metrics as unknown as Record<string, unknown>)[key] as MetricValue;
}

function isNum(v: MetricValue): v is number {
  return typeof v === "number" && !Number.isNaN(v);
}

function isBool(v: MetricValue): v is boolean {
  return typeof v === "boolean";
}

function isDefined(v: MetricValue): boolean {
  return v !== undefined && v !== null;
}

/** Round up to 1 decimal for the completeness percent. */
function pct(n: number, d: number): number {
  return d === 0 ? 100 : Math.round((n / d) * 1000) / 10;
}

/** Cross-field plausibility invariants (engineering category family). */
function checkPlausibility(metrics: RawMetrics, issues: FieldIssue[]): void {
  const num = (k: string) => {
    const v = readValue(metrics, k);
    return isNum(v) ? v : undefined;
  };
  const warn = (fieldId: string, prop: string, label: string, message: string) =>
    issues.push({ fieldId, key: prop, label, severity: "warning", message });

  const enrolled = num("enrolledStudents");
  const faculty = num("permanentFaculty");
  const pubs = num("totalPublications");
  const cites = num("totalCitations");

  const atMost = (subset: string, superset: string, subsetLabel: string, supLabel: string) => {
    const a = num(subset);
    const b = num(superset);
    if (a !== undefined && b !== undefined && a > b) {
      warn(subset, subset, subsetLabel, `${subsetLabel} (${a}) exceeds ${supLabel} (${b}).`);
    }
  };

  atMost("facultyWithPhD", "permanentFaculty", "Faculty with PhD", "Permanent faculty");
  atMost("womenFaculty", "permanentFaculty", "Women faculty", "Permanent faculty");
  atMost("top25Citations", "totalCitations", "Top-25% citations", "Total citations");
  atMost("retractedPapers", "totalPublications", "Retracted papers", "Total publications");
  atMost("retractedCitations", "totalCitations", "Retracted citations", "Total citations");
  atMost("womenStudents", "enrolledStudents", "Women students", "Enrolled students");
  atMost("escsStudents", "enrolledStudents", "ESCS students", "Enrolled students");
  atMost("studentsOtherCountries", "enrolledStudents", "Students from other countries", "Enrolled students");

  if (enrolled !== undefined) {
    const oos = num("studentsOtherStates");
    const ooc = num("studentsOtherCountries");
    if (oos !== undefined && ooc !== undefined && oos + ooc > enrolled) {
      warn("OI_003", "studentsOtherStates", "Students from other states",
        `Other-states + other-countries (${oos + ooc}) exceeds enrolled students (${enrolled}).`);
    }
  }

  const exp = [num("facultyExp0to8"), num("facultyExp8to15"), num("facultyExp15plus")];
  if (faculty !== undefined && exp.every((e) => e !== undefined)) {
    const sum = (exp as number[]).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - faculty) > Math.max(0.1 * faculty, 1)) {
      issues.push({
        fieldId: "TLR_006",
        key: "facultyExp0to8",
        label: "Faculty experience bands",
        severity: "warning",
        message: `Faculty experience bands sum to ${sum} but permanent faculty is ${faculty}.`,
      });
    }
  }

  const placed = num("graduatesPlaced");
  const higher = num("graduatesHigherStudies");
  const inTime = num("graduatesInTime");
  if (placed !== undefined && higher !== undefined && inTime !== undefined && placed + higher > inTime) {
    warn("GO_001", "graduatesPlaced", "Graduates placed",
      `Placed + higher studies (${placed + higher}) exceeds graduates completing in time (${inTime}).`);
  }

  if (placed !== undefined && placed === 0) {
    issues.push({
      fieldId: "GO_001",
      key: "graduatesPlaced",
      label: "Graduates placed",
      severity: "warning",
      message: "Zero graduates placed — placement data may be incomplete.",
    });
  }

  if (pubs !== undefined && pubs === 0) {
    issues.push({
      fieldId: "RP_001",
      key: "totalPublications",
      label: "Total publications",
      severity: "warning",
      message: "Zero publications are reported for the window.",
    });
  }
  if (cites !== undefined && cites === 0) {
    issues.push({
      fieldId: "RP_002",
      key: "totalCitations",
      label: "Total citations",
      severity: "warning",
      message: "Zero citations are reported for the window.",
    });
  }

  const capExp = num("capitalExpenditure");
  const opExp = num("operationalExpenditure");
  if (enrolled !== undefined && enrolled > 0) {
    const perStudent = ((capExp ?? 0) + (opExp ?? 0)) / enrolled;
    if (perStudent < 10000) {
      issues.push({
        fieldId: "TLR_009",
        key: "capitalExpenditure",
        label: "Capital expenditure",
        severity: "warning",
        message: `Combined expenditure per student (₹${Math.round(perStudent)}) is implausibly low.`,
      });
    }
  }
}

export function validateRawMetrics(
  metrics: RawMetrics,
  opts: { category: NIRFCategory; year: number }
): ValidationReport {
  const ctx = getMethodology(opts.category, opts.year);
  const fields: FieldMetadata[] = ctx.methodology.fields;
  const issues: FieldIssue[] = [];

  let filledRequired = 0;
  let totalRequired = 0;
  const missingRequiredKeys: string[] = [];
  const missingNeededKeys: string[] = [];

  for (const f of fields) {
    if (f.parameter === "INST") continue; // identity fields live on the institution record, not RawMetrics
    const v = readValue(metrics, f.key);
    const present = isDefined(v) && (f.dataType === "boolean" ? isBool(v) : isNum(v));

    if (f.class === "mandatory") {
      totalRequired += 1;
      if (present) filledRequired += 1;
    }

    if (f.class === "mandatory" && !present) {
      missingRequiredKeys.push(f.key);
      issues.push({
        fieldId: f.fieldId,
        key: f.key,
        label: f.shortLabel,
        severity: "error",
        message: `Required ${f.subParameter} value missing.`,
        submittedValue: present ? (v as number) : undefined,
      });
      continue;
    }
    if (f.class === "needed" && !present) {
      missingNeededKeys.push(f.key);
      issues.push({
        fieldId: f.fieldId,
        key: f.key,
        label: f.shortLabel,
        severity: "warning",
        message: `Field recommended for a complete ${f.parameter} calculation.`,
      });
      continue;
    }
    if (!present) continue;

    // Type mismatch
    if (f.dataType === "boolean" && !isBool(v)) {
      issues.push({ fieldId: f.fieldId, key: f.key, label: f.shortLabel, severity: "error", message: "Expected a boolean value.", submittedValue: v as MetricValue });
      continue;
    }
    if (f.dataType !== "boolean" && !isNum(v)) {
      issues.push({ fieldId: f.fieldId, key: f.key, label: f.shortLabel, severity: "error", message: "Expected a numeric value.", submittedValue: v as MetricValue });
      continue;
    }

    const n = v as number;
    // Range from metadata
    if (f.min !== undefined && n < f.min) {
      issues.push({ fieldId: f.fieldId, key: f.key, label: f.shortLabel, severity: "error", message: `Value ${n} is below the minimum (${f.min}).`, submittedValue: n });
    }
    if (f.max !== undefined && n > f.max) {
      issues.push({ fieldId: f.fieldId, key: f.key, label: f.shortLabel, severity: "error", message: `Value ${n} exceeds the maximum (${f.max}).`, submittedValue: n });
    }
    // Zero-intake warnings
    if ((f.key === "sanctionedIntake" || f.key === "enrolledStudents") && n === 0) {
      issues.push({ fieldId: f.fieldId, key: f.key, label: f.shortLabel, severity: "warning", message: "Zero value reported — verify this is correct." });
    }
  }

  checkPlausibility(metrics, issues);

  // Parameters whose engine-critical inputs are incomplete.
  const insufficient = new Set<string>();
  for (const p of ctx.methodology.parameters) {
    const critical = p.subParameters.flatMap((s) => s.inputFields).filter((k) => !(k === "perceptionScore"));
    const missingCritical = critical.filter((k) => !isDefined(readValue(metrics, k)));
    if (missingCritical.length > 0) insufficient.add(p.code);
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const complete = errorCount === 0;
  const prDefined = isDefined(readValue(metrics, "perceptionScore"));

  // Group by parameter for the wizard section display.
  const sections: ValidationSection[] = ["TLR", "RP", "GO", "OI", "PR"].map((code) => {
    const pdef = ctx.parameterByCode[code];
    const sectionIssues = issues.filter((i) => {
      const f = ctx.fields.get(i.key);
      return (f?.parameter ?? code) === code;
    });
    return {
      parameter: code,
      label: pdef?.label ?? code,
      issues: sectionIssues,
      errors: sectionIssues.filter((i) => i.severity === "error").length,
      warnings: sectionIssues.filter((i) => i.severity === "warning").length,
    };
  });

  return {
    category: opts.category,
    year: opts.year,
    sections,
    fields: issues,
    summary: {
      complete,
      finalScoreAvailable: complete && prDefined,
      errorCount,
      warningCount,
      filledRequired,
      totalRequired,
      completenessPercent: pct(filledRequired, totalRequired),
      missingRequiredKeys,
      missingNeededKeys,
      insufficientParameters: [...insufficient],
    },
  };
}

/** Quick boolean gate used by the upload flow to accept extraction output. */
export function acceptsExtraction(report: ValidationReport): boolean {
  // Extraction output is accepted when all mandatory fields are present
  // (warnings about plausibility are acceptable at this stage).
  return report.summary.missingRequiredKeys.length === 0 &&
    report.summary.errorCount === 0;
}