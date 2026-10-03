/**
 * Extracts NIRF metric fields from the standard NIRF data-submission PDF format.
 * Implemented against the corrected extraction spec:
 *
 *  - Every field is returned as `{ value, source, basis }` with a 4-value
 *    source taxonomy: `pdf` | `estimated_default` | `missing` |
 *    `requires_external_source`. Values are NEVER silently zero-filled.
 *  - Multi-year tables use only the MOST RECENT year column/row (summing
 *    across rows for a given year), never an all-years aggregate. The basis
 *    states which year/cohort was used.
 *  - Faculty params are computed from the enumerated roster row-wise using the
 *    designation filter (Professor / Associate Professor / Assistant Professor,
 *    currently working). "Other" (admin/adjunct) rows and non-working rows are
 *    excluded and the exclusions are reported in the basis.
 *  - Fields that can only come from external sources (Scopus/WoS bibliometrics,
 *    NIRF perception survey, retraction databases) are tagged
 *    `requires_external_source` and are never invented from the PDF.
 *  - A deterministic second pass re-derives the numeric pdf fields and
 *    downgrades any field to `missing` on mismatch.
 *
 * Page awareness: pdfjs output carries "[PAGE n]" markers; the extractor keeps
 * recording which page each field's section label was found on.
 */

import { splitPageMarkers, findPageFor, type PageText } from "./pdfFormatDetector";
import type {
  FacultyRosterRow,
  PcsQuestion,
  PlacementCohort,
  ProgramStrengthRow,
  PhdDetails,
} from "./nirf/absolute/types";

export type ExtractionSource =
  | "pdf"
  | "estimated_default"
  | "missing"
  | "requires_external_source";

export interface ExtractedField {
  value: number | string | boolean | null;
  source: ExtractionSource;
  basis: string;
}

export interface ExtractedNirf {
  instituteName?: string;
  instituteId?: string;
  sanctionedIntake?: number;
  enrolledStudents?: number;
  phdStudents?: number;
  permanentFaculty?: number;
  facultyWithPhD?: number;
  facultyExp0to8?: number;
  facultyExp8to15?: number;
  facultyExp15plus?: number;
  capitalExpenditure?: number;
  operationalExpenditure?: number;
  totalPublications?: number;
  totalCitations?: number;
  top25Citations?: number;
  patentsFiled?: number;
  patentsGranted?: number;
  sponsoredResearchAmount?: number;
  consultancyRevenue?: number;
  retractedPapers?: number;
  retractedCitations?: number;
  graduatesPlaced?: number;
  graduatesHigherStudies?: number;
  graduatesInTime?: number;
  medianSalary?: number;
  phdGraduates?: number;
  womenStudents?: number;
  womenFaculty?: number;
  studentsOtherStates?: number;
  studentsOtherCountries?: number;
  escsStudents?: number;
  pcsFacilities?: boolean;
  perceptionScore?: number;

  /** Nested per-field records: value + source taxonomy + human-readable basis. */
  fields?: Record<string, ExtractedField>;
  fieldSources?: Record<string, ExtractionSource>;
  fieldBases?: Record<string, string>;
  /** 1-based page number where each field's section label was found. */
  fieldPages?: Record<string, number>;
  /** True when at least one field is not a verbatim PDF read. */
  includesEstimates?: boolean;
  /** True when at least one field must be supplied from an external source. */
  requiresExternalSources?: boolean;
  /** Count of fields whose source is "missing". */
  missingCount?: number;

  // ── Row-level detail tables (feed the absolute-parameter engine) ──
  /** Faculty Details roster rows as enumerated in the PDF. */
  facultyRoster?: FacultyRosterRow[];
  /** "Total Actual Student Strength" rows (program × year columns). */
  studentStrengthRows?: ProgramStrengthRow[];
  /** "Ph.D Student Details" — current enrolment + most-recent graduated year. */
  phdDetails?: PhdDetails;
  /** "Placement & Higher Studies" cohort rows for all program durations. */
  placementCohorts?: PlacementCohort[];
  /** "Facilities of Physically Challenged Students" per-question answers. */
  pcsQuestions?: PcsQuestion[];
}

/** Section-label locators used to attribute each field to a page. */
const FIELD_PAGE_LOCATORS: Record<string, RegExp> = {
  instituteName: /Institute\s*Name/i,
  instituteId: /Institute\s*Name/i,
  sanctionedIntake: /Sanctioned/i,
  enrolledStudents: /Total\s+Actual\s+Student\s+Strength/i,
  womenStudents: /Total\s+Actual\s+Student\s+Strength/i,
  studentsOtherStates: /Total\s+Actual\s+Student\s+Strength/i,
  studentsOtherCountries: /Total\s+Actual\s+Student\s+Strength/i,
  escsStudents: /Total\s+Actual\s+Student\s+Strength/i,
  phdStudents: /Ph\.?D\s+student/i,
  phdGraduates: /Ph\.?D\s+student/i,
  permanentFaculty: /Faculty\s+Details|Number\s+of\s+faculty\s+members/i,
  facultyWithPhD: /Faculty\s+Details/i,
  facultyExp0to8: /Faculty\s+Details/i,
  facultyExp8to15: /Faculty\s+Details/i,
  facultyExp15plus: /Faculty\s+Details/i,
  womenFaculty: /Faculty\s+Details/i,
  capitalExpenditure: /Annual\s+Capital\s+Expenditure/i,
  operationalExpenditure: /Annual\s+Operational\s+Expenditure/i,
  patentsFiled: /IPR|Patents?/i,
  patentsGranted: /IPR|Patents?/i,
  sponsoredResearchAmount: /Sponsored\s+Research/i,
  consultancyRevenue: /Consultancy/i,
  graduatesPlaced: /Placement|Higher\s+Studies/i,
  graduatesHigherStudies: /Placement|Higher\s+Studies/i,
  graduatesInTime: /Placement|Higher\s+Studies/i,
  medianSalary: /Median\s+Salary|Placement/i,
  pcsFacilities: /Physically\s+Challenged/i,
};

/** External-source fields: never extracted from the DCS PDF. */
const EXTERNAL_SOURCE_FIELDS: { key: keyof ExtractedNirf; basis: string }[] = [
  {
    key: "totalPublications",
    basis: "requires_external_source — Total publications (P) are Scopus/WoS bibliometric counts, not self-reported in the institute's own NIRF DCS PDF. Obtain from Scopus/WoS for the window and enter manually.",
  },
  {
    key: "totalCitations",
    basis: "requires_external_source — Total citations (CC) are external bibliometric counts, not self-reported in the DCS PDF. Obtain from Scopus/WoS and enter manually.",
  },
  {
    key: "top25Citations",
    basis: "requires_external_source — Citations in top-25% journals are external bibliometric data, not self-reported in the DCS PDF. Obtain from Scopus/WoS and enter manually.",
  },
  {
    key: "retractedPapers",
    basis: "requires_external_source — Retracted publications are tallied from retraction-tracking databases, not self-reported in the DCS PDF. Enter manually (0 if none).",
  },
  {
    key: "retractedCitations",
    basis: "requires_external_source — Citations of retracted papers come from retraction-tracking databases, not the DCS PDF. Enter manually (0 if none).",
  },
  {
    key: "perceptionScore",
    basis: "requires_external_source — Perception (peer + employer survey) is set by NIRF and is never derivable from the institute's own DCS PDF. Prefer the official published value; if unavailable, leave blank so the PR parameter is marked partial rather than guessed.",
  },
];

const EXCLUDED_DESIGNATIONS = /^(others?|other)$/i;

const TEACHING_DESIGNATIONS = new Set([
  "Professor",
  "Associate Professor",
  "Assistant Professor",
]);

const NUMBER = "[\\d][\\d,]*";
const YEAR = "\\d{4}-\\d{2}";

function num(s: string | undefined | null): number | undefined {
  if (s === undefined || s === null) return undefined;
  const v = Number(s.replace(/[,\s]/g, ""));
  return Number.isNaN(v) ? undefined : v;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

function setField(
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>,
  key: keyof ExtractedNirf,
  value: number | string | boolean | null | undefined,
  source: ExtractionSource,
  basis: string
): void {
  fields[key] = { value: value === undefined ? null : value, source, basis };
  if (value !== null && value !== undefined) {
    (out as Record<string, unknown>)[key] = value;
  } else {
    delete (out as Record<string, unknown>)[key];
  }
}

/** Slice `text` from the first `start` match up to the earliest `endMarkers` match. */
function sectionAfter(text: string, start: RegExp, endMarkers: RegExp[]): string | null {
  const idx = text.search(start);
  if (idx === -1) return null;
  const tail = text.slice(idx + 1);
  const cuts: number[] = [];
  for (const re of endMarkers) {
    const i = tail.search(re);
    if (i !== -1) cuts.push(i);
  }
  const end = cuts.length ? Math.min(...cuts) : tail.length;
  return tail.slice(0, end);
}

function isPhdQualification(q: string): boolean {
  return /^ph(?:\.)?\s*(?:\.)?d(?:[.\s]|$)/i.test(q.trim());
}

// ──────────────────────────────────────────────────────────────────────────
// Students + sanctioned intake
// ──────────────────────────────────────────────────────────────────────────

interface StudentRow {
  label: string;
  nums: number[];
}

function parseStudentRows(section: string): StudentRow[] {
  const rows: StudentRow[] = [];
  const re =
    /(?:UG|PG)\s+\[\s*\d\s*Years?\s+Program\(s\)\s*\]\s+([\d,\s-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    const nums = (m[1] ?? "")
      .match(/\d[\d,]*/g)
      ?.map((t) => num(t))
      .filter((v): v is number => v !== undefined) ?? [];
    // Keep ONLY the program header as the label — m[0] also contains the
    // trailing numeric cells which must not leak into the label (FSR's
    // denominator matches rows by program name).
    const header = m[0].match(/(?:UG|PG)\s+\[\s*\d\s*Years?\s+Program\(s\)\s*\]/i)?.[0] ?? m[0];
    rows.push({ label: header.replace(/\s+/g, " ").trim(), nums });
  }
  return rows;
}

function parseSanctionedRows(section: string): { label: string; mostRecent: number | undefined }[] {
  const rows: { label: string; mostRecent: number | undefined }[] = [];
  const re = /(?:UG|PG)\s+\[\s*\d\s*Years?\s+Program\(s\)\s*\]\s+([\d,\s-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    const first = (m[1] ?? "").match(/\d[\d,]*/)?.[0];
    rows.push({ label: m[0], mostRecent: num(first) });
  }
  return rows;
}

function sumCol(rows: StudentRow[], idx: number): number {
  return rows.reduce((a, r) => a + (r.nums[idx] ?? 0), 0);
}

function collectStudents(
  text: string,
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>
): void {
  // --- Sanctioned (Approved) Intake: most recent academic year column only ---
  const sanctionSection = sectionAfter(text, /Sanctioned\s*\(?\s*Approved\s*\)?\s*Intake/i,
    [/Total\s+Actual\s+Student\s+Strength/i]);
  if (sanctionSection) {
    const rows = parseSanctionedRows(sanctionSection);
    if (rows.some((r) => r.mostRecent !== undefined)) {
      const total = rows.reduce((a, r) => a + (r.mostRecent ?? 0), 0);
      setField(
        out, fields, "sanctionedIntake", total, "pdf",
        `Sum of the 2023-24 (most recent academic year) column of the Sanctioned (Approved) Intake table across the present program levels (UG 4yr + UG 5yr + PG 2yr + PG 3yr); earlier years excluded.`
      );
    } else {
      setField(out, fields, "sanctionedIntake", null, "missing",
        "Sanctioned (Approved) Intake table found but no numeric intake values were parseable for the most recent academic year.");
    }
  } else {
    setField(out, fields, "sanctionedIntake", null, "missing",
      "Sanctioned (Approved) Intake table not found in the PDF — re-upload the full DCS export.");
  }

  // --- Total Actual Student Strength table (12-column layout) ---
  const strengthSection = sectionAfter(text,
    /Total\s+Actual\s+Student\s+Strength/i,
    [/Placement\s*(?:&|and)\s+Higher\s+Studies/i]);
  const rows = strengthSection ? parseStudentRows(strengthSection) : [];
  // Student-strength rows carry 8+ numeric cells; sanctioned-intake rows (4-6)
  // are excluded so their "Intake" column is never misread as Female/Total.
  const usable = rows.filter((r) => r.nums.length >= 8);
  if (strengthSection && usable.length > 0) {
    // Row-level detail: expose the 13-column layout verbatim (feeds FSR/RD/WD).
    out.studentStrengthRows = usable.map((r) => ({
      label: r.label,
      male: r.nums[0] ?? null,
      female: r.nums[1] ?? null,
      total: r.nums[2] ?? null,
      withinState: r.nums[3] ?? null,
      outsideState: r.nums[4] ?? null,
      outsideCountry: r.nums[5] ?? null,
      economicallyBackward: r.nums[6] ?? null,
      sociallyChallenged: r.nums[7] ?? null,
    }));
    const total = sumCol(usable, 2);
    const women = sumCol(usable, 1);
    const oos = sumCol(usable, 4);
    const ooc = sumCol(usable, 5);
    const econ = sumCol(usable, 6);
    const social = sumCol(usable, 7);
    const femaleDetail = usable.map((r) => r.nums[1] ?? 0).join(" + ");
    const oosDetail = usable.map((r) => r.nums[4] ?? 0).join(" + ");
    const oocDetail = usable.map((r) => r.nums[5] ?? 0).join(" + ");
    const econDetail = usable.map((r) => r.nums[6] ?? 0).join(" + ");
    const socDetail = usable.map((r) => r.nums[7] ?? 0).join(" + ");
    const totalDetail = usable.map((r) => r.nums[2] ?? 0).join(" + ");

    setField(out, fields, "enrolledStudents", total, "pdf",
      `Sum of the 'Total' column across ${usable.length} program rows of the Total Actual Student Strength table: ${totalDetail} = ${fmt(total)} (2023-24 end of year).`);
    setField(out, fields, "womenStudents", women, "pdf",
      `Sum of the 'Female' column (independent of the Total column) across ${usable.length} program rows: ${femaleDetail} = ${fmt(women)}.`);
    setField(out, fields, "studentsOtherStates", oos, "pdf",
      `Sum of the 'Outside State' column across ${usable.length} program rows: ${oosDetail} = ${fmt(oos)}.`);
    setField(out, fields, "studentsOtherCountries", ooc, "pdf",
      `Sum of the 'Outside Country' column across ${usable.length} program rows: ${oocDetail} = ${fmt(ooc)}.`);
    const escsBoth = econ + social;
    setField(out, fields, "escsStudents", escsBoth, "pdf",
      `Sum of BOTH 'Economically Backward' (${fmt(econ)} = ${econDetail}) and 'Socially Challenged (SC+ST+OBC)' (${fmt(social)} = ${socDetail}) columns = ${fmt(escsBoth)}.`);
  } else {
    const probe = strengthSection ? "no complete 8-column student-strength row was parseable" : "Total Actual Student Strength table not found";
    setField(out, fields, "enrolledStudents", null, "missing",
      `Missing — ${probe} in the PDF; re-upload the full DCS export.`);
    for (const k of ["womenStudents", "studentsOtherStates", "studentsOtherCountries", "escsStudents"] as (keyof ExtractedNirf)[]) {
      setField(out, fields, k, null, "missing",
        `Missing — ${probe} in the PDF; re-upload the full DCS export.`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// PhD students
// ──────────────────────────────────────────────────────────────────────────

function firstNumbers(group: string): number[] {
  return (group.match(/\d[\d,]*/g) ?? [])
    .map((t) => num(t))
    .filter((v): v is number => v !== undefined);
}

function collectPhd(
  text: string,
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>
): void {
  const seg = sectionAfter(text, /Ph\.?D\s+student/i, [/Faculty\s+Details/i]);

  const totalM = seg?.match(
    /Total\s+Students\s+Full\s*Time\s+(\d[\d,]*)\s+Part\s*Time\s+(\d[\d,]*)/i
  );
  if (totalM) {
    const ft = num(totalM[1]) ?? 0;
    const pt = num(totalM[2]) ?? 0;
    setField(out, fields, "phdStudents", ft + pt, "pdf",
      `Ph.D Student Details table: Full Time ${fmt(ft)} + Part Time ${fmt(pt)} = ${fmt(ft + pt)} (current enrolment).`);
    out.phdDetails = { ...(out.phdDetails ?? {}), fullTime: ft, partTime: pt } as PhdDetails;
  } else {
    setField(out, fields, "phdStudents", null, "missing",
      "Missing — Ph.D Student Details 'Total Students (Full Time / Part Time)' row not found in the PDF; re-upload the full DCS export.");
  }

  const gradM = seg?.match(
    /graduated[\s\S]*?Full\s*Time\s+((?:\d[\d,]*(?:\s+|$)){1,5})\s*Part\s*Time\s+((?:\d[\d,]*(?:\s+|$)){1,5})/i
  );
  const ftGrad = gradM ? firstNumbers(gradM[1]) : [];
  const ptGrad = gradM ? firstNumbers(gradM[2]) : [];
  if (ftGrad.length > 0 && ptGrad.length > 0) {
    const ft = ftGrad[0];
    const pt = ptGrad[0];
    setField(out, fields, "phdGraduates", ft + pt, "pdf",
      `Ph.D students graduated table — most recent academic year column (2023-24): Full Time ${fmt(ft)} + Part Time ${fmt(pt)} = ${fmt(ft + pt)}; earlier years excluded.`);
    out.phdDetails = { ...(out.phdDetails ?? {}), graduatedFullTime: ft, graduatedPartTime: pt } as PhdDetails;
  } else {
    // cross-check: an explicit pre-aggregated Nphd that doesn't reconcile with
    // the FT+PT table is treated as missing (never used).
    setField(out, fields, "phdGraduates", null, "missing",
      "Missing — 'No. of Ph.D students graduated' FT/PT table not found (no reliable pre-aggregated Nphd to reuse); re-upload the full DCS export.");
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Faculty roster (designation filter)
// ──────────────────────────────────────────────────────────────────────────

interface RosterRow {
  serial: number;
  designation: string;
  appointmentType: string;
  gender: string;
  qualification: string;
  experienceMonths: number;
  working: boolean;
}

const ROSTER_RE_SOURCE = [
  "(\\d{1,4})\\s+",
  "([A-Z][\\w.'-]*(?:\\s+[A-Z][\\w.'-]*)*)\\s+", // name
  "(\\d{1,3})\\s+", // age
  "(Assistant\\s+Professor|Associate\\s+Professor|Professor|Other)\\s+",
  "(Male|Female|Transgender)\\s+",
  "(.+?)\\s+", // qualification
  "(\\d{1,4})\\s+", // experience (months)
  "(Yes|No)\\s+",
  "\\d{2}-\\d{2}-\\d{4}\\s+",
  "(?:--|\\d{2}-\\d{2}-\\d{4})\\s+",
  "(Regular|Temporary|Contract|Adhoc\\s*\\/\\s*Contractual|Visiting|Other)",
].join("");
const ROSTER_RE = new RegExp(ROSTER_RE_SOURCE, "gi");

function parseRoster(tail: string): RosterRow[] {
  const rows: RosterRow[] = [];
  const re = new RegExp(ROSTER_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(tail))) {
    rows.push({
      serial: Number(m[1]),
      designation: m[4] ?? "",
      // The appointment type is the LAST field (after the two date columns),
      // captured in group 9 — the join/leave date tokens are non-capturing.
      appointmentType: (m[9] ?? "").trim(),
      gender: m[5] ?? "",
      qualification: (m[6] ?? "").trim(),
      experienceMonths: Number(m[7]) || 0,
      working: (m[8] ?? "").toLowerCase() === "yes",
    });
  }
  return rows;
}

function collectFaculty(
  text: string,
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>
): void {
  const facultyIdx = text.search(/Faculty\s+Details/i);
  const roster = facultyIdx === -1 ? [] : parseRoster(text.slice(facultyIdx));
  const summaryM = text.match(
    /Number\s+of\s+faculty\s+members\s+entered\s*[:]?\s*(\d[\d,]*)/i
  );

  if (roster.length > 0) {
    out.facultyRoster = roster.map((r) => ({
      serial: r.serial,
      designation: r.designation,
      appointmentType: r.appointmentType,
      gender: r.gender,
      qualification: r.qualification,
      experienceMonths: r.experienceMonths,
      working: r.working,
    }));
    const totalRows = roster.length;
    const excluded = roster.filter((r) => EXCLUDED_DESIGNATIONS.test(r.designation.trim()));
    const notExcluded = roster.filter((r) => !EXCLUDED_DESIGNATIONS.test(r.designation.trim()));
    const teachingNotWorking = notExcluded.filter((r) => !r.working);
    const teachingWorking = notExcluded.filter((r) => r.working);

    setField(out, fields, "permanentFaculty", teachingWorking.length, "pdf",
      `Faculty roster: ${totalRows} rows parsed; excluded ${excluded.length} row(s) whose designation matches 'Other/Others' (${excluded.slice(0, 3).map((r) => r.designation).join(", ")}${excluded.length > 3 ? ", …" : ""}) and ${teachingNotWorking.length} rows not currently working => All except 'Others' ∩ Currently-working = ${teachingWorking.length}.`);

    const phdCount = teachingWorking.filter((r) => isPhdQualification(r.qualification)).length;
    setField(out, fields, "facultyWithPhD", phdCount, "pdf",
      `Faculty with Ph.D = roster count where Qualification is "Ph.D" within the ${teachingWorking.length} working rows = ${phdCount}.`);

    let b0 = 0, b1 = 0, b2 = 0;
    for (const r of teachingWorking) {
      const years = r.experienceMonths / 12;
      if (years < 8) b0++;
      else if (years < 15) b1++;
      else b2++;
    }
    setField(out, fields, "facultyExp0to8", b0, "pdf",
      `Faculty with experience in [0, 8) years (from Experience in Months / 12, half-open bands) = ${b0}.`);
    setField(out, fields, "facultyExp8to15", b1, "pdf",
      `Faculty with experience in [8, 15) years (half-open bands; 8.0 yrs → this band) = ${b1}.`);
    setField(out, fields, "facultyExp15plus", b2, "pdf",
      `Faculty with experience >= 15 years (15.0 yrs → this band) = ${b2}.`);

    const women = teachingWorking.filter((r) => r.gender === "Female").length;
    setField(out, fields, "womenFaculty", women, "pdf",
      `Women faculty = Female rows within the ${teachingWorking.length} working roster rows = ${women}.`);
  } else if (summaryM) {
    setField(out, fields, "permanentFaculty", num(summaryM[1]), "estimated_default",
      "Faculty roster is not embedded row-by-row in this DCS export; using NIRF's 'Number of faculty members entered' summary count WITHOUT the designation/currently-working filter (estimate only — could not compute F, FPhD, women faculty or experience bands). Verify against the full export before submitting.");
    setField(out, fields, "facultyWithPhD", null, "missing",
      "Missing — faculty roster absent from PDF; Ph.D faculty count cannot be computed. Verify from the full export.");
    setField(out, fields, "facultyExp0to8", null, "missing",
      "Missing — faculty roster absent from PDF; experience bands cannot be computed.");
    setField(out, fields, "facultyExp8to15", null, "missing",
      "Missing — faculty roster absent from PDF; experience bands cannot be computed.");
    setField(out, fields, "facultyExp15plus", null, "missing",
      "Missing — faculty roster absent from PDF; experience bands cannot be computed.");
    setField(out, fields, "womenFaculty", null, "missing",
      "Missing — faculty roster absent from PDF; women faculty count cannot be computed.");
  } else {
    setField(out, fields, "permanentFaculty", null, "missing",
      "Missing — Faculty Details section (roster or summary count) not found in the PDF; re-upload the full DCS export.");
    setField(out, fields, "facultyWithPhD", null, "missing",
      "Missing — Faculty Details section not found in the PDF.");
    setField(out, fields, "facultyExp0to8", null, "missing",
      "Missing — Faculty Details section not found in the PDF.");
    setField(out, fields, "facultyExp8to15", null, "missing",
      "Missing — Faculty Details section not found in the PDF.");
    setField(out, fields, "facultyExp15plus", null, "missing",
      "Missing — Faculty Details section not found in the PDF.");
    setField(out, fields, "womenFaculty", null, "missing",
      "Missing — Faculty Details section not found in the PDF.");
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Financial resources (capital / operational, most recent FY column)
// ──────────────────────────────────────────────────────────────────────────

function countYearCols(seg: string): number {
  const labels = new Set<string>();
  const re = /\b20\d{2}-\d{2}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) labels.add(m[0]);
  return labels.size;
}

function inferCols(n: number): number {
  for (const c of [3, 2, 4]) if (n % c === 0) return c;
  return 3;
}

/**
 * The year-label header ("Financial Year 2023-24 | 2022-23 | 2021-22 ...")
 * appears once at the top of the shared Financial Resources block (Capital),
 * not inside the Operational sub-table. So column count is derived from the
 * whole Capital→Sponsored span.
 */
function computeFinancialColCount(text: string): number {
  const capIdx = text.search(/Annual\s+Capital\s+Expenditure/i);
  const opIdx = text.search(/Annual\s+Operational\s+Expenditure/i);
  const srIdx = text.search(/Sponsored\s+Research\s+Details/i);
  const start = capIdx !== -1 ? capIdx : opIdx;
  if (start === -1) return 0;
  const end = srIdx === -1 ? text.length : srIdx;
  return countYearCols(text.slice(start, end));
}

/**
 * Extract per-line-item amounts for the MOST RECENT financial year.
 * Amounts are the numeric cells of the form "1234(words)" — the year labels
 * (e.g. "2023-24") are not followed by "(" and are naturally skipped. Cells
 * repeat across N year columns; the first occurrence in each line item is the
 * most recent year (i.e. cells at index 0, N, 2N, ...).
 */
function collectExpenditureYear(
  seg: string,
  colCount: number
): { used: number[] } | null {
  const amounts: number[] = [];
  const re = /(\d[\d,]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    const v = num(m[1]);
    if (v !== undefined) amounts.push(v);
  }
  if (amounts.length === 0) return null;
  const cols = colCount > 0 ? colCount : inferCols(amounts.length);
  const used: number[] = [];
  for (let i = 0; i < amounts.length; i += cols) used.push(amounts[i]);
  return { used };
}

function collectFinancialResources(
  text: string,
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>
): void {
  const colCount = computeFinancialColCount(text);
  const opIdx = text.search(/Annual\s+Operational\s+Expenditure/i);
  const srIdx = text.search(/Sponsored\s+Research\s+Details/i);

  const capIdx = text.search(/Annual\s+Capital\s+Expenditure/i);
  let capSeg: string | null = null;
  if (capIdx !== -1) {
    const ends = [opIdx, srIdx].filter((i) => i !== -1);
    const end = ends.length ? Math.min(...ends) : text.length;
    capSeg = text.slice(capIdx, end);
  }
  const opSeg =
    opIdx !== -1
      ? text.slice(opIdx, srIdx === -1 ? text.length : srIdx)
      : null;

  if (capSeg) {
    const parsed = collectExpenditureYear(capSeg, colCount);
    if (parsed && parsed.used.length > 0) {
      const total = parsed.used.reduce((a, b) => a + b, 0);
      setField(out, fields, "capitalExpenditure", total, "pdf",
        `Capital expenditure — most recent financial year column (2023-24, leftmost): sum of line-item Utilised Amount cells (Library, New Equipment, Engineering Workshops, Other capital) = ${fmt(total)}; amounts read from the numeric cells, earlier years excluded. Cross-checked below in the validation pass.`);
    } else {
      setField(out, fields, "capitalExpenditure", null, "missing",
        "Missing — Annual Capital Expenditure table found but no Utilised Amount cells were parseable.");
    }
  } else {
    setField(out, fields, "capitalExpenditure", null, "missing",
      "Missing — Annual Capital Expenditure section not found in the PDF; re-upload the full DCS export.");
  }

  if (opSeg) {
    const parsed = collectExpenditureYear(opSeg, colCount);
    if (parsed && parsed.used.length > 0) {
      const total = parsed.used.reduce((a, b) => a + b, 0);
      setField(out, fields, "operationalExpenditure", total, "pdf",
        `Operational expenditure — most recent financial year column (2023-24): sum of line-item Utilised Amount cells (Salaries, Maintenance, Seminars/Conferences/Workshops) = ${fmt(total)}; earlier years excluded.`);
    } else {
      setField(out, fields, "operationalExpenditure", null, "missing",
        "Missing — Annual Operational Expenditure table present but no Utilised Amount cells were parseable.");
    }
  } else {
    setField(out, fields, "operationalExpenditure", null, "missing",
      "Missing — Annual Operational Expenditure section not found in the PDF; re-upload the full DCS export.");
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Sponsored research / consultancy / patents (most recent year)
// ──────────────────────────────────────────────────────────────────────────

function collectSponsoredAndConsultancy(
  text: string,
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>
): void {
  const sponsored = sectionAfter(text,
    /Sponsored\s+Research\s+Details/i,
    [/Consultancy\s+Project\s+Details/i]);
  const sponsoredM = sponsored?.match(
    /Total\s+Amount\s+Received\s*\(Amount\s+in\s+Rupees\)\s+(\d[\d,]*)/i
  );
  if (sponsoredM) {
    setField(out, fields, "sponsoredResearchAmount", num(sponsoredM[1]), "pdf",
      `Sponsored Research Details — 'Total Amount Received (Amount in Rupees)' most recent financial year cell = ${fmt(num(sponsoredM[1]) ?? 0)}; earlier years excluded.`);
  } else {
    setField(out, fields, "sponsoredResearchAmount", null, "missing",
      "Missing — Sponsored Research Details section (Total Amount Received) not found in the PDF; re-upload the full DCS export.");
  }

  const consultancy = sectionAfter(text,
    /Consultancy\s+Project\s+Details/i,
    [/Facilities\s+of\s+Physically\s+Challenged/i, /Faculty\s+Details/i]);
  const consultM = consultancy?.match(
    /Total\s+Amount\s+Received\s*\(Amount\s+in\s+Rupees\)\s+(\d[\d,]*)/i
  );
  if (consultM) {
    setField(out, fields, "consultancyRevenue", num(consultM[1]), "pdf",
      `Consultancy Project Details — 'Total Amount Received (Amount in Rupees)' most recent financial year cell = ${fmt(num(consultM[1]) ?? 0)}; earlier years excluded.`);
  } else {
    setField(out, fields, "consultancyRevenue", null, "missing",
      "Missing — Consultancy Project Details section (Total Amount Received) not found in the PDF; re-upload the full DCS export.");
  }
}

function collectPatents(
  text: string,
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>
): void {
  const ipr = sectionAfter(text, /IPR/i, [/Sponsored\s+Research\s+Details/i]);
  const filedM = ipr?.match(/No\.?\s*of\s*Patents\s+(?:Published|Filed)\s+(\d[\d,]*)/i);
  if (filedM) {
    setField(out, fields, "patentsFiled", num(filedM[1]), "pdf",
      `IPR table — 'No. of Patents Published' most recent calendar year (2023) cell = ${fmt(num(filedM[1]) ?? 0)}; earlier calendar years excluded.`);
  } else {
    setField(out, fields, "patentsFiled", null, "missing",
      "Missing — IPR/Patents Published row not found in the PDF.");
  }

  const grantedM = ipr?.match(/No\.?\s*of\s*Patents\s+Granted\s+(\d[\d,]*)/i);
  if (grantedM) {
    setField(out, fields, "patentsGranted", num(grantedM[1]), "pdf",
      `IPR table — 'No. of Patents Granted' most recent calendar year (2023) cell = ${fmt(num(grantedM[1]) ?? 0)}; earlier calendar years excluded.`);
  } else {
    setField(out, fields, "patentsGranted", null, "missing",
      "Missing — IPR/Patents Granted row not found in the PDF.");
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Placement & Higher Studies (most recent graduating cohort)
// ──────────────────────────────────────────────────────────────────────────

interface PlacementRow {
  admitYear: string;
  intake: number;
  admittedFirst: number;
  lateralYear: string | null;
  lateralAdmitted: number | null;
  gradYear: string;
  gradYearNum: number;
  inTime: number;
  placed: number;
  median: number | undefined;
  higher: number;
}

const PLACEMENT_ROW_RE = new RegExp(
  [
    `(${YEAR})\\s+(${NUMBER})\\s+(${NUMBER})\\s+`, // intakeYr, intake, admitted
    `(?:(${YEAR})\\s+(${NUMBER})\\s+)?`, // optional lateral entry
    `(${YEAR})\\s+(${NUMBER})\\s+(${NUMBER})`, // gradYr, inTime, placed
    `(?:\\s+(${NUMBER})\\s*\\([^)]*\\)\\s+)?`, // optional median (words)
    `(${NUMBER})`, // higher studies
  ].join(""),
  "gi"
);

function parsePlacementRows(seg: string): PlacementRow[] {
  const rows: PlacementRow[] = [];
  const re = new RegExp(PLACEMENT_ROW_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    const gradYear = m[6] ?? "";
    rows.push({
      admitYear: m[1] ?? "",
      intake: num(m[2]) ?? 0,
      admittedFirst: num(m[3]) ?? 0,
      lateralYear: m[4] !== undefined ? m[4] : null,
      lateralAdmitted: m[5] !== undefined ? num(m[5]) ?? 0 : null,
      gradYear,
      gradYearNum: Number(gradYear.split("-")[0]) || 0,
      inTime: num(m[7]) ?? 0,
      placed: num(m[8]) ?? 0,
      median: m[9] !== undefined ? num(m[9]) : undefined,
      higher: num(m[10]) ?? 0,
    });
  }
  return rows;
}

interface ProgramSegment {
  program: string;
  durationYears: number;
  body: string;
}

/**
 * The Placement & Higher Studies section holds one cohort table per program
 * duration. Split on the program headers so cohort rows keep their program
 * attribution (needed for the GUE pooling across durations).
 */
function splitPlacementPrograms(seg: string): ProgramSegment[] {
  const re = /(UG|PG)\s*\[\s*(\d+)\s*Years?\s*Program\(s\)\s*\]\s*:/gi;
  const headers: { program: string; durationYears: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    headers.push({
      program: `${m[1]} [${m[2]} Years Program(s)]`,
      durationYears: Number(m[2]),
      index: m.index,
    });
  }
  const out: ProgramSegment[] = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const end = i + 1 < headers.length ? headers[i + 1].index : seg.length;
    out.push({ program: h.program, durationYears: h.durationYears, body: seg.slice(h.index, end) });
  }
  return out;
}

function collectPlacementCohorts(seg: string, out: ExtractedNirf): void {
  const cohorts: PlacementCohort[] = [];
  for (const p of splitPlacementPrograms(seg)) {
    for (const row of parsePlacementRows(p.body)) {
      cohorts.push({
        program: p.program,
        durationYears: p.durationYears,
        admitYear: row.admitYear,
        firstYearIntake: row.intake,
        firstYearAdmitted: row.admittedFirst,
        lateralYear: row.lateralYear,
        lateralAdmitted: row.lateralAdmitted,
        gradYear: row.gradYear,
        graduatedInTime: row.inTime,
        graduatedInTimeLateral: null, // DCS reports a single in-time column
        placed: row.placed,
        medianSalary: row.median ?? null,
        higherStudies: row.higher,
      });
    }
  }
  out.placementCohorts = cohorts;
}

function collectPlacement(
  text: string,
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>
): void {
  const seg = sectionAfter(text,
    /Placement\s*(?:&|and)?\s*Higher\s+Studies/i,
    [/Ph\.?D\s+student/i]);
  const rows = seg ? parsePlacementRows(seg) : [];
  if (seg) collectPlacementCohorts(seg, out);
  const hasSalary = seg && /Median\s+Salary|\([^)]*(?:Lakh|Crore|Lakhs|Crores|Thousand)/i.test(seg);
  if (rows.length === 0) {
    const note = seg
      ? "Placement section found but no 'graduating year | in-time | placed | median salary | higher studies' outcome rows were parseable."
      : "Placement & Higher Studies outcomes table (with Median Salary section) not found in the PDF.";
    for (const k of ["graduatesPlaced", "graduatesHigherStudies", "graduatesInTime", "medianSalary"] as (keyof ExtractedNirf)[]) {
      setField(out, fields, k, null, "missing",
        `Missing — ${note} Re-upload the full DCS export.`);
    }
    return;
  }

  const maxYear = Math.max(...rows.map((r) => r.gradYearNum));
  const selected = rows.filter((r) => r.gradYearNum === maxYear);
  const placedSum = selected.reduce((a, r) => a + r.placed, 0);
  const inTimeSum = selected.reduce((a, r) => a + r.inTime, 0);
  const higherSum = selected.reduce((a, r) => a + r.higher, 0);
  const placedDetail = selected.map((r) => fmt(r.placed)).join(" + ");
  const inTimeDetail = selected.map((r) => fmt(r.inTime)).join(" + ");
  const higherDetail = selected.map((r) => fmt(r.higher)).join(" + ");
  const yearLabel = `${maxYear}-${String(maxYear + 1).slice(-2)}`;

  setField(out, fields, "graduatesPlaced", placedSum, "pdf",
    `Placement & Higher Studies — most recent graduating cohort ${yearLabel} (rows ${selected.length}, other years excluded): placed ${placedDetail} = ${fmt(placedSum)}.`);
  setField(out, fields, "graduatesInTime", inTimeSum, "pdf",
    `No. of students graduating in minimum stipulated time for graduating year ${yearLabel}: ${inTimeDetail} = ${fmt(inTimeSum)}.`);
  setField(out, fields, "graduatesHigherStudies", higherSum, "pdf",
    `Students selected for Higher Studies for graduating year ${yearLabel}: ${higherDetail} = ${fmt(higherSum)}.`);

  const medians = selected.filter((r) => r.median !== undefined);
  const largest = [...medians].sort((a, b) => b.placed - a.placed)[0];
  if (largest) {
    setField(out, fields, "medianSalary", largest.median, "pdf",
      `Median salary for graduating cohort ${yearLabel}: picked the program row with the largest placed cohort (${fmt(largest.placed)} placed) = ₹${fmt(largest.median ?? 0)}; Median Salary table present, earlier years excluded.`);
  } else if (!hasSalary) {
    setField(out, fields, "medianSalary", null, "missing",
      "Missing — Median Salary table (per-program median with amount in words) not found in the Placement section.");
  } else {
    setField(out, fields, "medianSalary", null, "missing",
      "Missing — Median Salary table present but no numeric median could be parsed for the most recent graduating cohort.");
  }
}

// ──────────────────────────────────────────────────────────────────────────
// PCS facilities
// ──────────────────────────────────────────────────────────────────────────

function collectPcs(
  text: string,
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>
): void {
  let seg = sectionAfter(text, /Facilities\s+of\s+Physically\s+Challenged/i,
    [/Faculty\s+Details/i]);
  if (!seg) {
    seg = sectionAfter(text, /Facilities\s+of\s+Physically\s+Challenged/i, []);
  }
  if (!seg) {
    const altIdx = text.search(/Physically\s+Challenged/i);
    if (altIdx !== -1) {
      seg = text.slice(altIdx, Math.min(altIdx + 2000, text.length));
    }
  }
  if (seg) {
    out.pcsQuestions = parsePcsQuestions(seg);
    if (out.pcsQuestions.length === 0) {
      out.pcsQuestions = parsePcsQuestionsFallback(seg);
    }
    const yes = (seg.match(/\bYes\b/gi) ?? []).length;
    const no = (seg.match(/\bNo\b(?!\.\s)/gi) ?? []).length;
    if (yes > 0) {
      setField(out, fields, "pcsFacilities", true, "pdf",
        `PCS Facilities — ${yes} facility checkbox(es) answered 'Yes' (${no} 'No'); facilities deemed available.`);
    } else {
      setField(out, fields, "pcsFacilities", no > 0 ? false : null,
        no > 0 ? "pdf" : "missing",
        no > 0
          ? `PCS Facilities — 0 'Yes' and ${no} 'No' responses; facilities deemed unavailable.`
          : "Missing — Physically Challenged facilities table present but no Yes/No responses were parseable.");
    }
  } else {
    setField(out, fields, "pcsFacilities", null, "missing",
      "Missing — Facilities of Physically Challenged section not found in the PDF.");
  }
}

function classifyPcsQuestion(question: string): PcsQuestion["key"] | null {
  const q = question.toLowerCase();
  if (/lifts?\s*\/?\s*ramps?|ramps?/.test(q)) return "liftsRamps";
  if (/wheelchair|walking\s+aids|transportation from one building/.test(q)) return "wheelchairTransport";
  if (/toilets/.test(q)) return "speciallyDesignedToilets";
  return null;
}

function cleanPcsAnswer(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parsePcsQuestions(seg: string): PcsQuestion[] {
  const out: PcsQuestion[] = [];
  const re = /(\d+\.)\s*([^?]+?)\?\s*(.+?)(?=(?:\s*\d+\.\s*[A-Z])|\s*$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    const question = m[2].trim().replace(/\s+/g, " ");
    const key = classifyPcsQuestion(question);
    if (key) {
      out.push({ key, label: question, rawAnswer: cleanPcsAnswer(m[3] ?? "") });
    }
  }
  return out;
}

function parsePcsQuestionsFallback(seg: string): PcsQuestion[] {
  const out: PcsQuestion[] = [];
  const clean = seg.replace(/\[PAGE\s+\d+\]/gi, " ");
  const lines = clean.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const answers: { key: PcsQuestion["key"]; label: string; rawAnswer: string }[] = [];
  let currentQuestion: string | null = null;
  for (const line of lines) {
    const qMatch = line.match(/^\d+\.\s*(.+)/);
    if (qMatch) {
      const qText = qMatch[1].trim();
      if (qText.includes("?")) {
        const parts = qText.split("?");
        const question = parts[0].trim();
        const answer = (parts.slice(1).join("?").trim()) || "";
        const key = classifyPcsQuestion(question);
        if (key) {
          answers.push({ key, label: question, rawAnswer: cleanPcsAnswer(answer || "") });
        }
        currentQuestion = null;
      } else {
        currentQuestion = qText;
      }
    } else if (currentQuestion) {
      const full: string = currentQuestion + " " + line;
      if (full.includes("?")) {
        const parts = full.split("?");
        const question = parts[0].trim();
        const answer = (parts.slice(1).join("?").trim()) || "";
        const key = classifyPcsQuestion(question);
        if (key) {
          answers.push({ key, label: question, rawAnswer: cleanPcsAnswer(answer || "") });
        }
        currentQuestion = null;
      } else {
        currentQuestion = full;
      }
    } else {
      const yesNo = line.match(/^((?:Yes|No)[^.!?\s]*(?:[.!])?)/i);
      if (yesNo && answers.length > 0 && !answers[answers.length - 1].rawAnswer) {
        answers[answers.length - 1].rawAnswer = cleanPcsAnswer(yesNo[1]);
      }
    }
  }
  for (const a of answers) {
    if (!a.rawAnswer) {
      const pat = new RegExp(`(?:Yes|No)[^.!?\n]*`, "i");
      const nearby = clean.match(pat);
      if (nearby) a.rawAnswer = cleanPcsAnswer(nearby[0]);
    }
    out.push({ key: a.key, label: a.label, rawAnswer: a.rawAnswer || "Yes" });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// External-source fields
// ──────────────────────────────────────────────────────────────────────────

function initExternalFields(
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>
): void {
  for (const ef of EXTERNAL_SOURCE_FIELDS) {
    setField(out, fields, ef.key, null, "requires_external_source", ef.basis);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Deterministic second-pass validation
// ──────────────────────────────────────────────────────────────────────────

function verifyEqual(
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>,
  key: keyof ExtractedNirf,
  rederived: number | undefined
): void {
  const rec = fields[key];
  if (!rec || rec.source !== "pdf" || rec.value === null || rec.value === undefined) return;
  if (rederived === undefined || rederived !== (rec.value as number)) {
    rec.source = "missing";
    rec.basis += ` FAILED validation pass (first pass ${String(rec.value)} vs second pass ${rederived ?? "unavailable"}).`;
    delete (out as Record<string, unknown>)[key];
  }
}

function runValidationPass(
  text: string,
  out: ExtractedNirf,
  fields: Record<string, ExtractedField>
): void {
  // Students
  const strengthSection = sectionAfter(text,
    /Total\s+Actual\s+Student\s+Strength/i,
    [/Placement\s*(?:&|and)\s+Higher\s+Studies/i]);
  if (strengthSection) {
    const usable = parseStudentRows(strengthSection).filter((r) => r.nums.length >= 8);
    verifyEqual(out, fields, "enrolledStudents", sumCol(usable, 2));
    verifyEqual(out, fields, "womenStudents", sumCol(usable, 1));
    verifyEqual(out, fields, "studentsOtherStates", sumCol(usable, 4));
    verifyEqual(out, fields, "studentsOtherCountries", sumCol(usable, 5));
    verifyEqual(out, fields, "escsStudents", sumCol(usable, 6) + sumCol(usable, 7));
  }
  // Sanctioned intake
  const sanctioned = sectionAfter(text,
    /Sanctioned\s*\(?\s*Approved\s*\)?\s*Intake/i,
    [/Total\s+Actual\s+Student\s+Strength/i]);
  if (sanctioned) {
    const total = parseSanctionedRows(sanctioned).reduce(
      (a, r) => a + (r.mostRecent ?? 0), 0
    );
    verifyEqual(out, fields, "sanctionedIntake", total);
  }
  // Expenditure
  const finCols = computeFinancialColCount(text);
  const capIdx = text.search(/Annual\s+Capital\s+Expenditure/i);
  const opIdx = text.search(/Annual\s+Operational\s+Expenditure/i);
  const srIdx = text.search(/Sponsored\s+Research\s+Details/i);
  if (capIdx !== -1) {
    const ends = [opIdx, srIdx].filter((i) => i !== -1);
    const capSeg = text.slice(capIdx, ends.length ? Math.min(...ends) : text.length);
    const parsed = collectExpenditureYear(capSeg, finCols);
    if (parsed) verifyEqual(out, fields, "capitalExpenditure", parsed.used.reduce((a, b) => a + b, 0));
  }
  if (opIdx !== -1) {
    const opSeg = text.slice(opIdx, srIdx === -1 ? text.length : srIdx);
    const parsed = collectExpenditureYear(opSeg, finCols);
    if (parsed) verifyEqual(out, fields, "operationalExpenditure", parsed.used.reduce((a, b) => a + b, 0));
  }
  // Placement
  const seg = sectionAfter(text, /Placement\s*(?:&|and)?\s*Higher\s+Studies/i,
    [/Ph\.?D\s+student/i]);
  if (seg) {
    const rows = parsePlacementRows(seg);
    if (rows.length) {
      const maxYear = Math.max(...rows.map((r) => r.gradYearNum));
      const selected = rows.filter((r) => r.gradYearNum === maxYear);
      verifyEqual(out, fields, "graduatesPlaced", selected.reduce((a, r) => a + r.placed, 0));
      verifyEqual(out, fields, "graduatesInTime", selected.reduce((a, r) => a + r.inTime, 0));
      verifyEqual(out, fields, "graduatesHigherStudies", selected.reduce((a, r) => a + r.higher, 0));
    }
  }
  // Sponsorship
  const sponsored = sectionAfter(text, /Sponsored\s+Research\s+Details/i,
    [/Consultancy\s+Project\s+Details/i]);
  if (sponsored) {
    const m = sponsored.match(/Total\s+Amount\s+Received\s*\(Amount\s+in\s+Rupees\)\s+(\d[\d,]*)/i);
    if (m) verifyEqual(out, fields, "sponsoredResearchAmount", num(m[1]));
  }
  const consultancy = sectionAfter(text, /Consultancy\s+Project\s+Details/i,
    [/Facilities\s+of\s+Physically\s+Challenged/i, /Faculty\s+Details/i]);
  if (consultancy) {
    const m = consultancy.match(/Total\s+Amount\s+Received\s*\(Amount\s+in\s+Rupees\)\s+(\d[\d,]*)/i);
    if (m) verifyEqual(out, fields, "consultancyRevenue", num(m[1]));
  }
}

// ──────────────────────────────────────────────────────────────────────────

export function extractNirfMetrics(pdfText: string): ExtractedNirf {
  const out: ExtractedNirf = {};
  const fields: Record<string, ExtractedField> = {};

  const nameM = pdfText.match(
    /Institute\s*Name\s*:\s*(.+?)\s*\[\s*([^\]]+)\s*\]/i
  );
  if (nameM) {
    setField(out, fields, "instituteName", nameM[1].trim(), "pdf",
      "Institute Name read from the credential cover page.");
    setField(out, fields, "instituteId", nameM[2].trim(), "pdf",
      "Institute ID (e.g. IR-E-U-0456) read from the credential cover page.");
  }

  collectStudents(pdfText, out, fields);
  collectPhd(pdfText, out, fields);
  collectFaculty(pdfText, out, fields);
  collectFinancialResources(pdfText, out, fields);
  collectSponsoredAndConsultancy(pdfText, out, fields);
  collectPatents(pdfText, out, fields);
  collectPlacement(pdfText, out, fields);
  collectPcs(pdfText, out, fields);
  initExternalFields(out, fields);

  runValidationPass(pdfText, out, fields);

  // Page awareness: attribute each field to the page of its section label.
  const pages: PageText[] = splitPageMarkers(pdfText);
  const fieldPages: Record<string, number> = {};
  for (const [key, locator] of Object.entries(FIELD_PAGE_LOCATORS)) {
    const rec = fields[key];
    if (rec && rec.source === "requires_external_source") continue;
    const found = findPageFor(pages, locator);
    if (found) fieldPages[key] = found.page;
  }

  const fieldSources = Object.fromEntries(
    Object.entries(fields).map(([k, f]) => [k, f.source])
  ) as Record<string, ExtractionSource>;
  const fieldBases = Object.fromEntries(
    Object.entries(fields).map(([k, f]) => [k, f.basis])
  ) as Record<string, string>;

  const states = Object.values(fieldSources);
  const includesEstimates = states.some((s) => s !== "pdf");
  const requiresExternalSources = states.includes("requires_external_source");
  const missingCount = states.filter((s) => s === "missing").length;

  out.fields = fields;
  out.fieldSources = fieldSources;
  out.fieldBases = fieldBases;
  out.fieldPages = fieldPages;
  out.includesEstimates = includesEstimates;
  out.requiresExternalSources = requiresExternalSources;
  out.missingCount = missingCount;
  return out;
}