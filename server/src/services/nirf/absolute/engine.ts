/**
 * NIRF ABSOLUTE-PARAMETER SCORING ENGINE.
 *
 * Computes the current-year-only ("absolute") sub-parameters with a full
 * arithmetic trace: every intermediate ratio is carried to 4+ decimals and
 * every operation is recorded as a literal equation with the raw numbers
 * plugged in. Only the FINAL sub-parameter score is rounded (2 decimals).
 *
 * Discipline (per the extraction spec):
 *  - Raw counts are taken VERBATIM from the input tables; nothing is inferred.
 *  - A table that is absent yields "unable to compute — source table absent",
 *    never a fabricated value.
 *  - Ambiguities and assumptions are surfaced as flags, never resolved silently.
 *  - Capped formulas report BOTH the uncapped and the capped value.
 *  - Blank/"N/A" cells exclude their row (and say so), never treated as zero.
 *
 * Scope: absolute parameters only (no year-over-year growth, no percentile
 * scaling). Relative/historical sub-parameters are out of scope here.
 */

import {
  AbsoluteInput,
  AbsoluteReport,
  CalcStep,
  Flag,
  PlacementCohort,
  SubKey,
  SubParamResult,
  SUB_PARAMETER_MARKS,
} from "./types";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format a number carrying at least 4 decimals (exactly 4 for cleanly
 * terminating values, never fewer). toFixed rounds, so `r4` is display-only;
 * ALL arithmetic keeps full IEEE-754 precision and only the final score is
 * rounded to 2 dp.
 */
export function r4(x: number): string {
  return x.toFixed(4);
}

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** NIRF-style cap f(x) = min(max(x,0),1). */
function f(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}

/** Build a single trace step. */
function step(label: string, equation: string, result: number | string | null): CalcStep {
  return { label, equation, result: typeof result === "number" ? Number(result.toFixed(6)) : result };
}

/** Round ONLY a final score to 2 decimals. */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function flag(severity: Flag["severity"], message: string): Flag {
  return { severity, message };
}

const EXCLUDED_DESIGNATIONS = /^(others?|other)$/i;

const TEACHING_DESIGNATIONS = new Set([
  "Professor",
  "Associate Professor",
  "Assistant Professor",
]);

function isTeaching(d: string): boolean {
  return !EXCLUDED_DESIGNATIONS.test(d.trim());
}

function isPhD(q: string): boolean {
  return /^ph(?:\.)?\s*(?:\.)?d(?:[.\s]|$)/i.test(q.trim());
}

/** Sum helper that reports blank cells as excluded rows. */
function sumOrNull(values: (number | null | undefined)[]): number | null {
  const numeric = values.filter((v): v is number => isNum(v));
  const blanks = values.length - numeric.length;
  if (blanks === values.length) return null;
  if (blanks > 0) return null; // any blank required cell → cannot sum verbatim
  return numeric.reduce((a, b) => a + b, 0);
}

// ── Parameter weights (official) ───────────────────────────────────────────

const PARAM_WEIGHTS: Record<string, number> = { TLR: 0.3, GO: 0.2, OI: 0.1 };

function makeResult(
  key: SubKey,
  officialName: string,
  parameter: "TLR" | "GO" | "OI"
): SubParamResult {
  const maxMarks = SUB_PARAMETER_MARKS[key];
  const parameterWeight = PARAM_WEIGHTS[parameter];
  return {
    key,
    label: key.toUpperCase(),
    officialName,
    parameter,
    parameterWeight,
    maxMarks,
    maxContribution: maxMarks * parameterWeight,
    score: null,
    contribution: null,
    status: "unable",
    sourceTables: [],
    missingTables: [],
    steps: [],
    flags: [],
    officiality: "official_formula",
  };
}

function closeOut(
  r: SubParamResult,
  score: number | null,
  status: "computed" | "partial" | "unable",
  note?: string
): SubParamResult {
  r.score = score === null ? null : round2(score);
  r.status = status;
  if (r.score !== null) {
    r.contribution = round2((r.score / r.maxMarks) * r.maxContribution);
  } else {
    r.contribution = null;
    r.flags.push(flag("error", "Unable to compute — source table absent."));
  }
  r.note = note;
  return r;
}

// ──────────────────────────────────────────────────────────────────────────
// 1. FSR — Faculty-Student Ratio (30 marks, TLR weight 30%)
//    FSR = 30 × min(15 × (F/N), 1)   [full 30 once F/N ≥ 1/15]
//      override: N/F > 50 (F/N < 1/50) ⇒ FSR = 0
//    F  = count of roster rows that are currently working AND
//         Appointment Type = "Regular" AND Experience ≥ 12 months
//    NT = Σ "Total" of the UG [4 Years], UG [5 Years] and PG [2 Years]
//         rows only (Total Actual Student Strength)
//    Np = Full-Time + Part-Time PhD (Ph.D Student Details)
//    N  = NT + Np
// ──────────────────────────────────────────────────────────────────────────

const REGULAR_APPOINTMENT_RE = /^regular$/i;

function isRegularAppointment(a: string | null | undefined): boolean {
  return typeof a === "string" && REGULAR_APPOINTMENT_RE.test(a.trim());
}

/** The student-strength program rows that enter the FSR denominator.
 *  The match is anchored to the program header but tolerates trailing content
 *  (extracted labels must never carry the numeric cells, but manually-supplied
 *  labels may); the header token alone decides the program. */
const FSR_STUDENT_PROGRAMS: { key: string; re: RegExp }[] = [
  { key: "UG [4 Years Program(s)]", re: /^UG\s*\[\s*4\s*Years?\s*Program\(s\)\s*\](?:[\s\S]*)$/i },
  { key: "UG [5 Years Program(s)]", re: /^UG\s*\[\s*5\s*Years?\s*Program\(s\)\s*\](?:[\s\S]*)$/i },
  { key: "PG [2 Years Program(s)]", re: /^PG\s*\[\s*2\s*Years?\s*Program\(s\)\s*\](?:[\s\S]*)$/i },
];

function computeFsr(i: AbsoluteInput): SubParamResult {
  const r = makeResult("fsr", "Faculty-Student Ratio", "TLR");
  r.sourceTables = ["Faculty Details (roster)", "Total Actual Student Strength", "Ph.D Student Details"];

  const rosterRows = i.facultyRoster ?? [];
  if (rosterRows.length === 0) {
    if (isNum(i.facultySummary)) {
      r.flags.push(
        flag(
          "warning",
          "Faculty Details roster table is ABSENT — only the 'Number of faculty members entered' summary count exists. The Currently Working / Appointment Type / Experience filters cannot be applied, so F cannot be derived verbatim from the source table."
        )
      );
    }
    r.missingTables.push("Faculty Details (row-wise roster)");
    return closeOut(r, null, "unable");
  }

  // ── STEP 1 — F = permanent faculty (currently working ∩ Regular ∩ ≥12 months).
  r.steps.push(
    step("F — STEP 1.1 Total faculty rows", `${rosterRows.length} row(s) in the Faculty Details table`, rosterRows.length)
  );

  const workingRows = rosterRows.filter((row) => row.working);
  r.steps.push(step("F — STEP 1.2 Currently Working = Yes", `${workingRows.length} of ${rosterRows.length} row(s)`, workingRows.length));
  const notWorking = rosterRows.length - workingRows.length;
  if (notWorking > 0) {
    r.flags.push(
      flag(
        "info",
        `Excluded ${notWorking} roster row(s) whose "Currently working with the Institution" is "No"; not counted in F.`
      )
    );
  }

  const regularRows = workingRows.filter((row) => isRegularAppointment(row.appointmentType));
  r.steps.push(step("F — STEP 1.3 Appointment Type = Regular", `${regularRows.length} of ${workingRows.length} working row(s)`, regularRows.length));
  const nonRegularCount = workingRows.length - regularRows.length;
  if (nonRegularCount > 0) {
    const kinds = workingRows
      .filter((row) => !isRegularAppointment(row.appointmentType))
      .map((row) => (row.appointmentType ?? "").trim() || "(blank)")
      .filter((v, idx, arr) => arr.indexOf(v) === idx);
    r.flags.push(
      flag(
        "info",
        `Excluded ${nonRegularCount} working roster row(s) whose Appointment Type is not "Regular" (${kinds.join(", ")}); not counted in F.`
      )
    );
  }

  const F = regularRows.filter((row) => isNum(row.experienceMonths) && row.experienceMonths >= 12).length;
  const under12 = regularRows.filter((row) => isNum(row.experienceMonths) && row.experienceMonths < 12).length;
  const blankExp = regularRows.filter((row) => !isNum(row.experienceMonths)).length;
  const expDetail = regularRows.length
    ? ` with Experience (In Months): ≥12 ⇒ ${F}, <12 ⇒ ${under12}, blank ⇒ ${blankExp}`
    : " (no regular working rows)";
  r.steps.push(step("F — STEP 1.4 Experience ≥ 12 months", `${regularRows.length} regular working row(s)${expDetail}`, F));
  const juniorOrBlank = regularRows.length - F;
  if (juniorOrBlank > 0) {
    r.flags.push(
      flag(
        "info",
        `Excluded ${juniorOrBlank} regular working roster row(s) whose Experience (In Months) is below 12 or blank (joined less than a year ago / unknown); not counted in F.`
      )
    );
  }
  r.steps.push(step("F — permanent faculty count", `working ${workingRows.length} ∩ Regular ${regularRows.length} ∩ ≥12 months = ${F}`, F));

  // ── STEP 2 — N = NT + Np.
  // NT sums ONLY the Total column of the FSR program rows (UG [4 Years], UG [5 Years], PG [2 Years]).
  const ntParts: { key: string; value: number | null }[] = [];
  const excludedLabels: string[] = [];
  for (const row of i.studentStrength ?? []) {
    const key = FSR_STUDENT_PROGRAMS.find((p) => p.re.test((row.label ?? "").trim()))?.key;
    if (key) ntParts.push({ key: key, value: row.total });
    else excludedLabels.push(row.label);
  }
  if (excludedLabels.length > 0) {
    r.flags.push(
      flag(
        "info",
        `FSR's denominator N includes ONLY the UG [4 Years], UG [5 Years] and PG [2 Years] student-strength rows plus Ph.D; the other student-strength row(s) are excluded: ${excludedLabels.join("; ")}.`
      )
    );
  }

  const NT = ntParts.length > 0 ? sumOrNull(ntParts.map((p) => p.value)) : null;
  if (ntParts.length === 0) {
    r.missingTables.push("Total Actual Student Strength (UG [4 Years] / UG [5 Years] / PG [2 Years] rows)");
    r.flags.push(
      flag(
        "error",
        "NT cannot be summed — none of the FSR student rows (UG [4 Years Program(s)], UG [5 Years Program(s)], PG [2 Year Program(s)]) is present in the Total Actual Student Strength table."
      )
    );
  } else if (NT === null) {
    r.missingTables.push("Total Actual Student Strength (Total column)");
    r.flags.push(
      flag(
        "error",
        "NT cannot be summed — a required 'Total' cell is blank in one of the FSR student rows (UG [4 Years] / UG [5 Years] / PG [2 Years]); blanks are never treated as zero."
      )
    );
  } else {
    const detail = ntParts.map((p) => `${p.key}: ${p.value}`).join(" + ");
    r.steps.push(step("NT — UG/PG students in FSR denominator", detail + ` = ${NT}`, NT));
  }

  // Np from PhD details
  const ft = i.phdDetails?.fullTime ?? null;
  const pt = i.phdDetails?.partTime ?? null;
  let Np: number | null = null;
  if (isNum(ft) && isNum(pt)) {
    Np = ft + pt;
    r.steps.push(step("Np — Ph.D students", `Full-Time ${ft} + Part-Time ${pt} = ${Np}`, Np));
  } else {
    if (!isNum(ft) && !isNum(pt)) {
      r.missingTables.push("Ph.D Student Details (enrolment totals)");
      r.flags.push(flag("error", "Np cannot be computed — Ph.D Student Details 'Total Students Full Time / Part Time' row absent."));
    } else {
      const known = isNum(ft) ? ft : pt;
      const label = isNum(ft) ? "Full-Time" : "Part-Time";
      r.flags.push(
        flag("warning", `Only the ${label} PhD count (${known}) was supplied; the other component is blank and cannot be treated as zero. Np is therefore unknown.`)
      );
    }
  }

  if (NT === null || Np === null) {
    return closeOut(r, null, "unable");
  }

  const N = NT + Np;
  r.steps.push(step("N — total students (FSR denominator)", `NT ${NT} + Np ${Np} = ${N}`, N));

  // ── STEP 3 — FSR = 30 × min(15 × (F/N), 1); override to 0 when N/F > 50.
  if (F > 0 && N / F > 50) {
    r.flags.push(
      flag(
        "warning",
        `N/F = ${r4(N / F)} > 50 (i.e. F/N = ${r4(F / N)} < 1/50) — the methodology sets FSR = 0 when the faculty:student ratio is this low.`
      )
    );
    r.steps.push(step("override N/F > 50 → FSR = 0", `N/F = ${N}/${F} = ${r4(N / F)} > 50 → FSR = 0`, 0));
    return closeOut(r, 0, "computed");
  }

  if (F === 0) {
    r.flags.push(
      flag(
        "warning",
        "F = 0 (no currently-working Regular-appointment faculty with ≥ 12 months experience in the roster). FSR = 0 from genuine data, not a missing table."
      )
    );
    r.steps.push(step("15 × (F/N)", `15 × (0/${N}) = 0`, 0));
    r.steps.push(step("FSR", `30 × 0 = 0`, 0));
    return closeOut(r, 0, "computed");
  }

  const fOverN = F / N;
  const ratioUncapped = 15 * fOverN;
  r.steps.push(step("15 × (F/N)", `15 × (${F}/${N}) = 15 × ${r4(fOverN)} = ${r4(ratioUncapped)}`, ratioUncapped));
  const ratioCapped = Math.min(ratioUncapped, 1);
  if (ratioUncapped > 1) {
    r.steps.push(step("min(15 × F/N, 1)", `min(${r4(ratioUncapped)}, 1) = ${r4(ratioCapped)} (cap applied)`, ratioCapped));
  } else {
    r.steps.push(step("min(15 × F/N, 1)", `min(${r4(ratioUncapped)}, 1) = ${r4(ratioCapped)} (no cap applied)`, ratioCapped));
  }
  const fsrUncapped = 30 * ratioCapped;
  r.steps.push(step("FSR", `30 × ${r4(ratioCapped)} = ${r4(fsrUncapped)}`, fsrUncapped));
  r.steps.push(step("Final score (rounded to 2 dp)", `${r4(fsrUncapped)} → ${round2(fsrUncapped)}`, round2(fsrUncapped)));

  return closeOut(
    r,
    fsrUncapped,
    "computed",
    `FSR = 30 × min(15 × (F/N), 1) with F=${F} (currently working ∩ Regular appointment ∩ ≥12 months experience) and N=${N} (UG 4yr ${ntParts.find((p) => p.key === "UG [4 Years Program(s)]")?.value ?? "—"} + UG 5yr ${ntParts.find((p) => p.key === "UG [5 Years Program(s)]")?.value ?? "—"} + PG 2yr ${ntParts.find((p) => p.key === "PG [2 Years Program(s)]")?.value ?? "—"} + Ph.D ${Np}).`
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 2. GUE — Graduation in Stipulated Time (15 marks, GO weight 20%)
//    One Placement & Higher Studies cohort table per program duration, for the
//    3 most recent reported admit-year cohorts.
//    Ng (per cohort)  = graduatedInTime + graduatedInTimeLateral
//    Denominator (per cohort) = firstYearAdmitted + lateralAdmitted
//    Pooled Ng% = Σ Ng / Σ admitted
//    GUE = 15 × min(Pooled Ng% / 80%, 1)
// ──────────────────────────────────────────────────────────────────────────

interface PoolRow {
  program: string;
  admitYear: string;
  admitted: number;
  ng: number;
}

function computeGue(i: AbsoluteInput): SubParamResult {
  const r = makeResult("gue", "Graduation in Stipulated Time (GUE)", "GO");
  r.sourceTables = ["Placement & Higher Studies (per program duration, 3 most recent cohorts)"];

  const cohorts = i.placementCohorts ?? [];
  if (cohorts.length === 0) {
    r.missingTables.push("Placement & Higher Studies cohort table");
    return closeOut(r, null, "unable");
  }

  // Keep the 3 most recent cohorts per program duration (dedupe by admitYear).
  const perProgram = new Map<string, PlacementCohort[]>();
  for (const c of cohorts) {
    const list = perProgram.get(c.program) ?? [];
    list.push(c);
    perProgram.set(c.program, list);
  }
  const selected: PlacementCohort[] = [];
  for (const [program, list] of perProgram) {
    const sorted = [...list].sort((a, b) => b.admitYear.localeCompare(a.admitYear));
    const top3 = sorted.slice(0, 3);
    selected.push(...top3);
    r.steps.push(
      step(
        `cohorts selected — ${program}`,
        `3 most recent admit-years: ${top3.map((c) => c.admitYear).join(", ")}`,
        top3.length
      )
    );
  }

  const pool: PoolRow[] = [];
  const blankRows: string[] = [];
  const zeroDenominatorRows: string[] = [];
  for (const c of selected) {
    const admittedParts: number[] = [];
    if (isNum(c.firstYearAdmitted)) admittedParts.push(c.firstYearAdmitted);
    if (isNum(c.lateralAdmitted)) admittedParts.push(c.lateralAdmitted);
    const admitted = admittedParts.reduce((a, b) => a + b, 0);
    let ng: number | null = null;
    if (isNum(c.graduatedInTime) && isNum(c.graduatedInTimeLateral)) {
      ng = c.graduatedInTime + c.graduatedInTimeLateral;
    } else if (isNum(c.graduatedInTime)) {
      ng = c.graduatedInTime;
      r.flags.push(
        flag(
          "info",
          `Cohort ${c.program} admitted ${c.admitYear}: the table reports a single 'No. of students graduating in minimum stipulated time' (${c.graduatedInTime}) with no separate lateral-entrant in-time column — the single count is used as Ng.`
        )
      );
    }
    if (admitted > 0 && ng !== null) {
      pool.push({ program: c.program, admitYear: c.admitYear, admitted, ng });
    } else if (admitted <= 0) {
      zeroDenominatorRows.push(`${c.program} (admit ${c.admitYear})`);
    } else {
      blankRows.push(`${c.program} (admit ${c.admitYear})`);
    }
  }
  if (blankRows.length > 0) {
    r.flags.push(
      flag(
        "warning",
        `Row(s) excluded — required cells blank (not treated as zero): ${blankRows.join("; ")}.`
      )
    );
  }
  if (zeroDenominatorRows.length > 0) {
    r.flags.push(
      flag(
        "info",
        `Row(s) excluded — admitted count is 0 so the row contributes nothing to the pool: ${zeroDenominatorRows.join("; ")}.`
      )
    );
  }

  if (pool.length === 0) {
    r.flags.push(flag("error", "No usable cohort row — every row has a blank admitted or in-time cell."));
    return closeOut(r, null, "unable");
  }

  const ngDetail = pool.map((p) => `Ng(${p.admitYear})=${p.ng}`).join(" + ");
  const admDetail = pool.map((p) => `Adm(${p.admitYear})=${p.admitted}`).join(" + ");
  const num = pool.reduce((a, p) => a + p.ng, 0);
  const den = pool.reduce((a, p) => a + p.admitted, 0);
  r.steps.push(step("Σ Ng (pooled numerator)", ngDetail + ` = ${num}`, num));
  r.steps.push(step("Σ admitted (pooled denominator)", admDetail + ` = ${den}`, den));
  const pctRaw = num / den;
  r.steps.push(
    step("Pooled Ng%", `${num} ÷ ${den} = ${r4(pctRaw)} (= ${r4(pctRaw * 100)}%)`, pctRaw)
  );

  const target = 0.8;
  // 80% target inverting = ×(5/4). Done as integer-scaled rational arithmetic
  // (num×5)/(den×4) so clean ratios like 0.7/0.8 = 0.875 stay exact instead of
  // drifting on a floating-point boundary (0.7 has no exact binary form).
  const ratio = (num * 5) / (den * 4);
  r.steps.push(step("ratio vs 80% target", `${r4(pctRaw)} ÷ ${target} = ${r4(ratio)}`, ratio));
  const uncapped = 15 * ratio;
  r.steps.push(step("GUE (uncapped)", `15 × ${r4(ratio)} = ${r4(uncapped)}`, uncapped));
  const capped = Math.min(uncapped, 15);
  if (uncapped > 15) {
    r.steps.push(step("cap min(·, 15)", `min(${r4(uncapped)}, 15) = ${r4(capped)}`, capped));
  } else {
    r.steps.push(step("cap min(·, 15)", `min(${r4(uncapped)}, 15) = ${r4(uncapped)} (no cap applied)`, capped));
  }
  r.steps.push(step("Final score (rounded to 2 dp)", `${r4(capped)} → ${round2(capped)}`, round2(capped)));

  return closeOut(
    r,
    capped,
    "computed",
    `GUE = 15 × min(Pooled Ng% / 80%, 1) pooling ${pool.length} cohort rows across ${perProgram.size} program duration(s).`
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 2b. GPH — Placement & Higher Studies (40 marks, GO weight 20%)
//    One "Placement & higher studies" cohort table per program duration
//    (UG [4 Years], UG [5 Years], PG [2 Years], PG [3 Years]), for the
//    3 most recent reported admit-year cohorts.
//    Per cohort:
//      N     = firstYearAdmitted + lateralAdmitted  (lateral absent → 0,
//              the PG [2 Years] table has no lateral columns)
//      ratio = (placed + higherStudies) / N
//    Per program:   program_avg = mean of the cohort ratios
//    Overall:       GPH_fraction = mean(UG4, UG5, PG2, PG3 program averages)
//    GPH = 40 × min(GPH_fraction, 1)
//    Column 7 (graduating in minimum stipulated time) feeds GUE only;
//    the median-salary column is reference-only and never enters GPH.
// ──────────────────────────────────────────────────────────────────────────

const GPH_CANONICAL_PROGRAMS: { key: string; level: "UG" | "PG"; duration: number }[] = [
  { key: "UG [4 Years Program(s)]", level: "UG", duration: 4 },
  { key: "UG [5 Years Program(s)]", level: "UG", duration: 5 },
  { key: "PG [2 Years Program(s)]", level: "PG", duration: 2 },
  { key: "PG [3 Years Program(s)]", level: "PG", duration: 3 },
];

const GPH_PROGRAM_LABEL_RE = /^(UG|PG)\s*\[\s*(\d+)\s*Years?/i;

/** Resolve a cohort's program label to a GPH program family, or null when it
 *  is not one of the four GPH tables. */
function gphProgramKey(label: string): { level: "UG" | "PG"; duration: number } | null {
  const m = GPH_PROGRAM_LABEL_RE.exec(label.trim());
  if (!m) return null;
  const level = m[1].toUpperCase() === "UG" ? "UG" : "PG";
  const duration = Number(m[2]);
  return GPH_CANONICAL_PROGRAMS.some((p) => p.level === level && p.duration === duration)
    ? { level, duration }
    : null;
}

interface GphProgramGroup {
  key: string;
  level: "UG" | "PG";
  duration: number;
  cohorts: PlacementCohort[];
}

function computeGph(i: AbsoluteInput): SubParamResult {
  const r = makeResult("gph", "Placement & Higher Studies (GPH)", "GO");
  r.sourceTables = ["Placement & Higher Studies (per program duration, 3 most recent cohorts)"];

  const cohorts = i.placementCohorts ?? [];
  if (cohorts.length === 0) {
    r.missingTables.push("Placement & Higher Studies cohort table");
    return closeOut(r, null, "unable");
  }
  r.flags.push(
    flag(
      "info",
      "GPH uses ONLY the admitted/lateral, placed and higher-studies columns. The 'No. of students graduating in minimum stipulated time' column feeds GUE, not GPH; the median-salary column is reference-only."
    )
  );

  const groups = new Map<string, GphProgramGroup>();
  let unclassified = 0;
  for (const c of cohorts) {
    const pk = gphProgramKey(c.program);
    if (!pk) {
      unclassified++;
      continue;
    }
    const key = `${pk.level} [${pk.duration} Years Program(s)]`;
    const g = groups.get(key) ?? { key, level: pk.level, duration: pk.duration, cohorts: [] };
    g.cohorts.push(c);
    groups.set(key, g);
  }
  if (unclassified > 0) {
    r.flags.push(
      flag(
        "info",
        `Ignored ${unclassified} cohort row(s) whose program is not one of the 4 GPH tables (UG [4 Years], UG [5 Years], PG [2 Years], PG [3 Years]).`
      )
    );
  }
  const known = [...groups.values()].sort((a, b) => {
    const ra = GPH_CANONICAL_PROGRAMS.findIndex((p) => p.key === a.key);
    const rb = GPH_CANONICAL_PROGRAMS.findIndex((p) => p.key === b.key);
    return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
  });
  if (known.length === 0) {
    r.missingTables.push("Placement & Higher Studies cohort table (9-column outcome rows, 4 GPH program tables)");
    r.flags.push(
      flag(
        "error",
        "No cohort row belongs to the 4 GPH program tables (UG [4 Years], UG [5 Years], PG [2 Years], PG [3 Years]). Placement & higher-studies data cannot be attributed to a program."
      )
    );
    return closeOut(r, null, "unable");
  }

  const programAvgs: { key: string; avg: number }[] = [];
  const contributedKeys: string[] = [];
  const excludedRows: string[] = [];

  for (const g of known) {
    const sorted = [...g.cohorts].sort((a, b) => b.admitYear.localeCompare(a.admitYear));
    const top3 = sorted.slice(0, 3);
    if (top3.length < 3) {
      r.flags.push(
        flag("warning", `${g.key}: only ${top3.length} cohort row(s) found for the 3 most recent admit-years (expected 3).`)
      );
    }
    if (g.cohorts.length > 3) {
      r.flags.push(
        flag(
          "info",
          `${g.key}: kept the 3 most recent admit-years (${top3.map((c) => c.admitYear).join(", ")}) and excluded ${g.cohorts.length - top3.length} older cohort row(s).`
        )
      );
    }
    r.steps.push(
      step(
        `cohorts selected — ${g.key}`,
        `3 most recent admit-years: ${top3.map((c) => c.admitYear).join(", ")}`,
        top3.length
      )
    );

    const ratios: number[] = [];
    for (const c of top3) {
      if (!isNum(c.firstYearAdmitted)) {
        excludedRows.push(`${g.key} (admit ${c.admitYear}) — 'admitted' cell blank`);
        continue;
      }
      if (!isNum(c.placed)) {
        excludedRows.push(`${g.key} (admit ${c.admitYear}) — 'placed' cell blank`);
        continue;
      }
      if (!isNum(c.higherStudies)) {
        excludedRows.push(`${g.key} (admit ${c.admitYear}) — 'higher studies' cell blank`);
        continue;
      }
      // Lateral-entry columns are structurally absent from the PG [2 Years]
      // table (and blank elsewhere) → absent lateral counts as 0.
      const lateral = isNum(c.lateralAdmitted) ? c.lateralAdmitted : 0;
      const N = c.firstYearAdmitted + lateral;
      r.steps.push(step(`N — ${g.key} (admit ${c.admitYear})`, `admitted ${c.firstYearAdmitted} + lateral ${lateral} = ${N}`, N));
      if (N <= 0) {
        excludedRows.push(`${g.key} (admit ${c.admitYear}) — admitted total 0`);
        continue;
      }
      const outcome = c.placed + c.higherStudies;
      r.steps.push(step(`outcome count — ${g.key} (admit ${c.admitYear})`, `placed ${c.placed} + higher studies ${c.higherStudies} = ${outcome}`, outcome));
      const ratio = outcome / N;
      ratios.push(ratio);
      r.steps.push(step(`cohort ratio — ${g.key} (admit ${c.admitYear})`, `${outcome} ÷ ${N} = ${r4(ratio)}`, ratio));
    }
    if (ratios.length === 0) {
      r.flags.push(
        flag("warning", `${g.key}: no usable cohort row among the 3 most recent admit-years — program average unavailable.`)
      );
      continue;
    }
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    programAvgs.push({ key: g.key, avg });
    contributedKeys.push(g.key);
    r.steps.push(step(`program average — ${g.key}`, `mean(${ratios.map((x) => r4(x)).join(", ")}) = ${r4(avg)}`, avg));
  }
  if (excludedRows.length > 0) {
    r.flags.push(
      flag(
        "warning",
        `Cohort row(s) excluded from GPH — required cells blank or admitted total 0 (never treated as zero): ${excludedRows.join("; ")}.`
      )
    );
  }

  if (programAvgs.length === 0) {
    r.flags.push(flag("error", "No program produced a usable placement/higher-studies average."));
    return closeOut(r, null, "unable");
  }

  const missingPrograms = GPH_CANONICAL_PROGRAMS.filter((p) => !groups.has(p.key)).map((p) => p.key);
  if (missingPrograms.length > 0) {
    r.flags.push(
      flag(
        "warning",
        `GPH averages over the available program table(s) only — program table(s) absent or without cohorts: ${missingPrograms.join("; ")}.`
      )
    );
  }

  const frac = programAvgs.reduce((a, p) => a + p.avg, 0) / programAvgs.length;
  r.steps.push(
    step("GPH fraction (mean of program averages)", `(${programAvgs.map((p) => r4(p.avg)).join(" + ")}) / ${programAvgs.length} = ${r4(frac)}`, frac)
  );
  const fracCapped = f(frac);
  if (frac > 1) {
    r.steps.push(step("cap min(fraction, 1)", `min(${r4(frac)}, 1) = ${r4(fracCapped)}`, fracCapped));
  } else {
    r.steps.push(step("cap min(fraction, 1)", `min(${r4(frac)}, 1) = ${r4(frac)} (no cap applied)`, fracCapped));
  }
  const uncapped = 40 * fracCapped;
  r.steps.push(step("GPH", `40 × ${r4(fracCapped)} = ${r4(uncapped)}`, uncapped));
  r.steps.push(step("Final score (rounded to 2 dp)", `${r4(uncapped)} → ${round2(uncapped)}`, round2(uncapped)));

  const partial = contributedKeys.length < GPH_CANONICAL_PROGRAMS.length;
  return closeOut(
    r,
    uncapped,
    partial ? "partial" : "computed",
    partial
      ? `GPH computed from ${programAvgs.length}/${GPH_CANONICAL_PROGRAMS.length} program table(s) (${contributedKeys.join(", ")}); missing program table(s) are not part of the mean.`
      : `GPH = 40 × min(GPH_fraction, 1) across ${GPH_CANONICAL_PROGRAMS.length} program tables × 3 cohort ratios each.`
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 3. PCS — Physically Challenged Facilities (20 marks, OI weight 10%)
//    Three questions:
//      1. Lifts/Ramps
//      2. Walking aids / wheelchairs / transport between buildings
//      3. Specially designed toilets
//    Each question is scored on its tier:
//      "Yes, more than 80% of the buildings" / "Yes"  → full marks for that item
//      "Yes, between 50% and 80% of the buildings"    → 50% credit
//      "Yes, less than 50% of the buildings"          → 25% credit
//      "No"                                            → 0 marks
//    PCS = Σ per-question marks, capped at 20.
// ──────────────────────────────────────────────────────────────────────────

const PCS_QUESTIONS: { key: "liftsRamps" | "wheelchairTransport" | "speciallyDesignedToilets"; label: string }[] = [
  { key: "liftsRamps", label: "Do your institution buildings have Lifts/Ramps?" },
  { key: "wheelchairTransport", label: "Provision of walking aids, including wheelchairs and transportation from one building to another for handicapped students?" },
  { key: "speciallyDesignedToilets", label: "Do your institution buildings have specially designed toilets for handicapped students?" },
];

function pcsTierCredit(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  if (/no\b/.test(t) && !/not|none/i.test(t)) {
    return /no, but|not yet|no, yet|no,\s*in progress/.test(t) ? null : 0;
  }
  if (/yes/.test(t)) {
    if (/more than 80%|>80%|majority|almost all/i.test(t)) return 1;
    if (/100%/i.test(t)) return 1;
    if (/between 50% and 80%|50% to 80%|50-80%|50%-80%|up to 80%/i.test(t)) return 0.5;
    if (/less than 50%|<50%|up to 50%|below 50%/i.test(t)) return 0.25;
    if (/fully functional|for all buildings|every building/i.test(t)) return 1;
    return 1; // plain "Yes" → full credit for that item
  }
  return null;
}

function computePcs(i: AbsoluteInput): SubParamResult {
  const r = makeResult("pcs", "Physically Challenged Facilities (PCS)", "OI");
  r.sourceTables = ["Facilities of Physically Challenged Students (Yes/No block)"];

  const answered = i.pcsQuestions ?? [];
  if (answered.length === 0) {
    r.missingTables.push("Facilities of Physically Challenged Students (Yes/No block)");
    return closeOut(r, null, "unable");
  }

  // Per-parameter scale: the 20 PCS marks are split equally across the three
  // questions (6.6667 each). The official methodology does not publish a finer
  // per-question split for the Engineering framework.
  const perQuestion = 20 / 3;
  r.flags.push(
    flag(
      "info",
      "Per-question marks assumed = 20 ÷ 3 = 6.6667 each (the official methodology does not publish a per-item split for Engineering PCS); total capped at 20."
    )
  );

  let total = 0;
  let answeredCount = 0;
  const perQuestionMarks: number[] = [];
  for (const q of PCS_QUESTIONS) {
    const answer = answered.find((a) => a.key === q.key);
    if (!answer) {
      r.flags.push(flag("warning", `Question "${q.label}" has no recorded answer in the dataset — treated as unavailable (0 marks), not assumed present.`));
      continue;
    }
    const credit = pcsTierCredit(answer.rawAnswer);
    if (credit === null) {
      r.flags.push(flag("warning", `Question "${q.label}" — answer "${answer.rawAnswer}" did not match a recognisable tier ("Yes/Yes >80%/50-80%/<50%/No"); no credit given.`));
      continue;
    }
    answeredCount++;
    const marks = perQuestion * credit;
    perQuestionMarks.push(marks);
    const tierLabel = credit === 1 ? "full (Yes / >80% of buildings)" : credit === 0.5 ? "half (50–80% of buildings)" : credit === 0.25 ? "quarter (<50% of buildings)" : "none (No)";
    r.steps.push(
      step(
        q.key,
        `"${answer.rawAnswer}" → tier "${tierLabel}" → ${r4(perQuestion)} × ${r4(credit)} = ${r4(marks)}`,
        marks
      )
    );
    total += marks;
  }
  r.steps.push(step("Σ per-question marks", perQuestionMarks.length ? perQuestionMarks.map((m) => r4(m)).join(" + ") + ` = ${r4(total)}` : "no credited answer = 0", total));
  const capped = Math.min(total, 20);
  if (total > 20) {
    r.steps.push(step("cap min(·, 20)", `min(${r4(total)}, 20) = ${r4(capped)}`, capped));
  }
  r.steps.push(step("Final score (rounded to 2 dp)", `${r4(capped)} → ${round2(capped)}`, round2(capped)));

  return closeOut(
    r,
    capped,
    answeredCount === PCS_QUESTIONS.length ? "computed" : "partial",
    `PCS = Σ per-question marks (${answeredCount}/3 questions credited), capped at 20.`
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 4. FQE — Faculty Quality & Experience (20 marks, TLR weight 30%)
//    FQ (10): % of teaching faculty with Qualification = "Ph.D".
//             FQ = 10 if %PhD ≥ 95%, else proportional 10 × (%PhD / 95%).
//    FE (10): buckets (months)  F1 ≤ 96 · F2 97–180 · F3 > 180
//             FE = 3×min(3×f1,1) + 3×min(3×f2,1) + 4×min(3×f3,1)
//    FQE = FQ + FE
// ──────────────────────────────────────────────────────────────────────────

function computeFqe(i: AbsoluteInput): SubParamResult {
  const r = makeResult("fqe", "Faculty Quality & Experience (FQE)", "TLR");
  r.sourceTables = ["Faculty Details (roster) — Qualification & Experience (In Months) columns"];

  const teaching = (i.facultyRoster ?? []).filter((row) => isTeaching(row.designation));
  if (teaching.length === 0) {
    r.missingTables.push("Faculty Details (row-wise roster)");
    r.flags.push(flag("error", "Teaching-faculty roster absent — Qualification and Experience columns cannot be read."));
    return closeOut(r, null, "unable");
  }

  // FQ
  const phdCount = teaching.filter((row) => isPhD(row.qualification)).length;
  const fPhd = phdCount / teaching.length;
  r.steps.push(
    step("FQ — % faculty with Ph.D", `${phdCount} ÷ ${teaching.length} = ${r4(fPhd)} (= ${r4(fPhd * 100)}%)`, fPhd)
  );
  let fq: number;
  if (fPhd >= 0.95) {
    r.steps.push(step("FQ", `%PhD ${r4(fPhd * 100)}% ≥ 95% → FQ = 10`, 10));
    fq = 10;
  } else {
    const fqRaw = 10 * (fPhd / 0.95);
    r.steps.push(step("FQ (proportional)", `10 × (${r4(fPhd)} / 0.95) = 10 × ${r4(fPhd / 0.95)} = ${r4(fqRaw)}`, fqRaw));
    fq = fqRaw;
  }
  r.flags.push(flag("info", "FQ uses the proportional slab 10 × (%PhD / 95%) below the 95% threshold (no finer official slab is specified in the dataset)."));

  // FE
  let f1 = 0, f2 = 0, f3 = 0;
  for (const row of teaching) {
    const m = row.experienceMonths;
    if (m <= 96) f1++;
    else if (m <= 180) f2++;
    else f3++;
  }
  const blankExp = teaching.filter((row) => !isNum(row.experienceMonths)).length;
  if (blankExp > 0) {
    r.flags.push(flag("warning", `${blankExp} teaching-faculty row(s) have a blank Experience (In Months) cell — excluded from the FE buckets.`));
  }
  r.steps.push(step("FE — bucket counts", `F1(≤96m)=${f1}, F2(97–180m)=${f2}, F3(>180m)=${f3}`, { f1, f2, f3 } as any));

  const numerator = f1 + f2 + f3;
  if (numerator === 0) {
    r.flags.push(flag("error", "No teaching-faculty row has a numeric Experience (In Months) value — FE cannot be computed."));
    return closeOut(r, null, "unable");
  }
  const ef1 = f1 / teaching.length;
  const ef2 = f2 / teaching.length;
  const ef3 = f3 / teaching.length;
  r.steps.push(step("fractions", `f1=${f1}/${teaching.length}=${r4(ef1)}, f2=${f2}/${teaching.length}=${r4(ef2)}, f3=${f3}/${teaching.length}=${r4(ef3)}`, { ef1, ef2, ef3 } as any));

  const t1 = 3 * ef1;
  const t2 = 3 * ef2;
  const t3 = 3 * ef3;
  r.steps.push(step("uncapped per-bucket factors", `3×f1=${r4(t1)}, 3×f2=${r4(t2)}, 3×f3=${r4(t3)}`, { t1, t2, t3 } as any));
  const c1 = Math.min(t1, 1);
  const c2 = Math.min(t2, 1);
  const c3 = Math.min(t3, 1);
  r.steps.push(step("capped min(3×f, 1)", `min(${r4(t1)},1)=${r4(c1)}, min(${r4(t2)},1)=${r4(c2)}, min(${r4(t3)},1)=${r4(c3)}`, { c1, c2, c3 } as any));
  const fe = 3 * c1 + 3 * c2 + 4 * c3;
  r.steps.push(step("FE", `3×${r4(c1)} + 3×${r4(c2)} + 4×${r4(c3)} = ${r4(fe)}`, fe));

  const fqeRaw = fq + fe;
  r.steps.push(step("FQE", `FQ ${r4(fq)} + FE ${r4(fe)} = ${r4(fqeRaw)} (max 20)`, fqeRaw));
  const capped = Math.min(fqeRaw, 20);
  r.steps.push(step("Final score (rounded to 2 dp)", `${r4(capped)} → ${round2(capped)}`, round2(capped)));

  return closeOut(
    r,
    capped,
    "computed",
    `FQE = FQ(${r4(fq)}) + FE(${r4(fe)}) over ${teaching.length} teaching-faculty rows.`
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 5. WD — Women Diversity (30 marks, OI weight 10%)
//    NWS = female students / total students (ALL programs incl. PhD where given)
//    NWF = female teaching faculty / total teaching faculty
//    WD = 15×min(NWS/50%,1) + 15×min(NWF/20%,1)
// ──────────────────────────────────────────────────────────────────────────

function computeWd(i: AbsoluteInput): SubParamResult {
  const r = makeResult("wd", "Women Diversity (WD)", "OI");
  r.sourceTables = ["Total Actual Student Strength (Female/Total columns)", "Faculty Details (Gender column, teaching subset)"];

  // Student part
  const totalRows = (i.studentStrength ?? []).map((row) => row.total);
  const femaleRows = (i.studentStrength ?? []).map((row) => row.female);
  const total = totalRows.length ? sumOrNull(totalRows) : null;
  const female = femaleRows.length ? sumOrNull(femaleRows) : null;

  let nwsPart: number | null = null;
  if (total === null || female === null) {
    r.missingTables.push("Total Actual Student Strength (Female/Total columns)");
    r.flags.push(flag("error", "NWS cannot be computed — the Female/Total columns are absent or blank."));
  } else {
    const nws = female / total;
    r.steps.push(step("NWS — female students share", `${female} ÷ ${total} = ${r4(nws)} (= ${r4(nws * 100)}%)`, nws));
    const u1 = nws / 0.5;
    const c1 = Math.min(u1, 1);
    r.steps.push(step("min(NWS/50%, 1)", `min(${r4(nws)} / 0.50, 1) = min(${r4(u1)}, 1) = ${r4(c1)}`, c1));
    nwsPart = 15 * c1;
    r.steps.push(step("student component (15)", `15 × ${r4(c1)} = ${r4(nwsPart)}`, nwsPart));
  }

  // Faculty part (teaching subset)
  const teaching = (i.facultyRoster ?? []).filter((row) => isTeaching(row.designation));
  let nwfPart: number | null = null;
  if (teaching.length === 0) {
    r.missingTables.push("Faculty Details (roster, Gender column)");
    r.flags.push(flag("error", "NWF cannot be computed — Faculty Details roster is absent (a summary faculty count cannot supply the gender split)."));
  } else {
    const femaleFaculty = teaching.filter((row) => row.gender?.trim().toLowerCase() === "female").length;
    const nwf = femaleFaculty / teaching.length;
    r.steps.push(step("NWF — female teaching faculty share", `${femaleFaculty} ÷ ${teaching.length} = ${r4(nwf)} (= ${r4(nwf * 100)}%)`, nwf));
    const u2 = nwf / 0.2;
    const c2 = Math.min(u2, 1);
    r.steps.push(step("min(NWF/20%, 1)", `min(${r4(nwf)} / 0.20, 1) = min(${r4(u2)}, 1) = ${r4(c2)}`, c2));
    nwfPart = 15 * c2;
    r.steps.push(step("faculty component (15)", `15 × ${r4(c2)} = ${r4(nwfPart)}`, nwfPart));
  }

  if (nwsPart === null && nwfPart === null) {
    return closeOut(r, null, "unable");
  }
  const wd = (nwsPart ?? 0) + (nwfPart ?? 0);
  r.steps.push(step("WD", `15×min(NWS/50%,1) ${nwsPart === null ? "(unavailable)" : r4(nwsPart)} + 15×min(NWF/20%,1) ${nwfPart === null ? "(unavailable)" : r4(nwfPart)} = ${r4(wd)}`, wd));
  const capped = Math.min(wd, 30);
  r.steps.push(step("Final score (rounded to 2 dp)", `${r4(capped)} → ${round2(capped)}`, round2(capped)));

  const partial = nwsPart === null || nwfPart === null;
  return closeOut(
    r,
    capped,
    partial ? "partial" : "computed",
    partial
      ? `WD computed from the ${nwsPart !== null ? "student" : "faculty"} component only — the ${nwsPart === null ? "student" : "faculty"} part is unavailable, shown rather than silently zero-filled.`
      : `WD = 15×min(NWS/50%,1) + 15×min(NWF/20%,1).`
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 6. RD — Region Diversity (30 marks, OI weight 10%)
//    f_oos = Σ Outside State / total students
//    f_ooc = Σ Outside Country / total students
//    RD = 25 × f_oos + 5 × f_ooc   (auto-capped at 30 since f ≤ 1)
// ──────────────────────────────────────────────────────────────────────────

function computeRd(i: AbsoluteInput): SubParamResult {
  const r = makeResult("rd", "Region Diversity (RD)", "OI");
  r.sourceTables = ["Total Actual Student Strength (Outside State / Outside Country / Total columns)", "Ph.D Student Details (state/country breakup, if present)"];

  const rows = i.studentStrength ?? [];
  const total = rows.length ? sumOrNull(rows.map((x) => x.total)) : null;
  const oos = rows.length ? sumOrNull(rows.map((x) => x.outsideState)) : null;
  const ooc = rows.length ? sumOrNull(rows.map((x) => x.outsideCountry)) : null;

  if (total === null || oos === null || ooc === null) {
    const missing = [];
    if (total === null) missing.push("Total column");
    if (oos === null) missing.push("Outside State column");
    if (ooc === null) missing.push("Outside Country column");
    r.missingTables.push(`Total Actual Student Strength (${missing.join(", ")})`);
    return closeOut(r, null, "unable");
  }

  const fOos = oos / total;
  const fOoc = ooc / total;
  r.steps.push(step("f_outsideState", `${oos} ÷ ${total} = ${r4(fOos)} (= ${r4(fOos * 100)}%)`, fOos));
  r.steps.push(step("f_outsideCountry", `${ooc} ÷ ${total} = ${r4(fOoc)} (= ${r4(fOoc * 100)}%)`, fOoc));
  const phdEnrolled =
    (i.phdDetails?.fullTime ?? 0) + (i.phdDetails?.partTime ?? 0);
  if (phdEnrolled > 0) {
    r.flags.push(
      flag(
        "warning",
        `${phdEnrolled} enrolled PhD students are not broken down by state/country in the dataset, so the RD numerator/denominator cover UG/PG students only — the value may differ from any official score that includes PhD students.`
      )
    );
  }
  const raw = 25 * fOos + 5 * fOoc;
  r.steps.push(step("RD", `25 × ${r4(fOos)} + 5 × ${r4(fOoc)} = ${r4(raw)}`, raw));
  // Note: since both fractions are ≤ 1 the formula is bounded above by 30;
  // no explicit cap in the official formula — confirm the bound applies.
  const capped = Math.min(raw, 30);
  if (raw > 30) {
    r.steps.push(step("safety cap min(·, 30)", `min(${r4(raw)}, 30) = ${r4(capped)} (only reachable if a fraction exceeded 1)`, capped));
  } else {
    r.steps.push(step("cap", `min(${r4(raw)}, 30) = ${r4(raw)} (no cap applied — fractions ≤ 1 bound RD at 30)`, raw));
  }
  r.steps.push(step("Final score (rounded to 2 dp)", `${r4(capped)} → ${round2(capped)}`, round2(capped)));

  return closeOut(
    r,
    raw,
    "computed",
    `RD = 25 × f_outsideState + 5 × f_outsideCountry.`
  );
}

// ──────────────────────────────────────────────────────────────────────────
// (Additional) FRU — Financial Resources Utilisation (30 marks, TLR 30%)
//   FRU = 30 × min( f(BC/(N·capC)) × 15 + f(BO/(N·capO)) × 15, 30 ) / 30 → scored
//   This is an additional ABSOLUTE parameter with a known official formula
//   family, but the per-student benchmark values (capC, capO) are NOT published
//   in the dataset. Marked needs_verification; computed only if benchmarks are
//   supplied, otherwise reported for the FEED as unavailable.
// ──────────────────────────────────────────────────────────────────────────

function computeFru(i: AbsoluteInput, benchmarks?: { capCapital: number; capOperational: number }): SubParamResult {
  const r = makeResult("fru", "Financial Resources and Utilisation (FRU)", "TLR");
  r.sourceTables = ["Annual Capital Expenditure", "Annual Operational Expenditure", "Total Actual Student Strength", "Ph.D Student Details"];

  if (!benchmarks) {
    r.officiality = "needs_verification";
    r.flags.push(
      flag(
        "error",
        "FRU is an additional absolute (current-year) sub-parameter whose per-student benchmark caps (capital & operational) are not published in the dataset. Its official formula is known but the benchmark constants are not — do NOT guess. Supply capCapital & capOperational to compute."
      )
    );
    return closeOut(r, null, "unable");
  }
  return r; // benchmarks supplied → computed by caller wiring (placeholder: not part of the six)
}

// ──────────────────────────────────────────────────────────────────────────
// Report assembly
// ──────────────────────────────────────────────────────────────────────────

export interface AbsoluteOptions {
  category?: string;
  year?: number;
  institution?: { name?: string; id?: string } | null;
}

export function computeAbsolute(input: AbsoluteInput, opts: AbsoluteOptions = {}): AbsoluteReport {
  const subs: SubParamResult[] = [
    computeFsr(input),
    computeGue(input),
    computeGph(input),
    computePcs(input),
    computeFqe(input),
    computeWd(input),
    computeRd(input),
  ];

  let totalComputed = 0;
  let availableMax = 0;
  const unableKeys: SubKey[] = [];
  for (const s of subs) {
    if (s.contribution !== null) totalComputed += s.contribution;
    else unableKeys.push(s.key);
    if (s.maxContribution) {
      if (s.contribution !== null) availableMax += s.maxContribution;
      else if (s.status !== "unable") availableMax += s.maxContribution;
    }
  }

  const totalMax = subs.reduce((a, s) => a + s.maxContribution, 0);

  const inputs: Record<string, number | string | null> = {
    teachingFaculty: input.facultyRoster?.filter((x) => isTeaching(x.designation)).length ?? null,
    rosterRows: input.facultyRoster?.length ?? null,
    facultySummary: input.facultySummary ?? null,
    studentRows: input.studentStrength?.length ?? null,
    phdFullTime: input.phdDetails?.fullTime ?? null,
    phdPartTime: input.phdDetails?.partTime ?? null,
    cohortRows: input.placementCohorts?.length ?? null,
    pcsQuestions: input.pcsQuestions?.length ?? null,
  };

  return {
    category: opts.category ?? "engineering",
    year: opts.year ?? 2025,
    institution: opts.institution ?? null,
    inputs,
    subs,
    summary: {
      totalComputed: round2(totalComputed),
      totalMax,
      availableMax: round2(availableMax),
      hasUnable: unableKeys.length > 0,
      unableKeys,
    },
    methodologyNote:
      "Absolute parameters only (current-year data, no percentiles, no prior-year history). " +
      "Contribution to the 100-point overall = (subScore / subMaxMarks) × subMaxMarks × parameterWeight, " +
      "with TLR=0.30, GO=0.20, OI=0.10 → the seven listed here top out at 34.0 points.",
  };
}

// Individual sub-parameter solvers (exported for targeted tests & server use).
export { computeFsr, computeGue, computeGph, computePcs, computeFqe, computeWd, computeRd };