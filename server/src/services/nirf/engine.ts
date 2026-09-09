/**
 * NIRF 2025 Engineering scoring engine (methodology-driven).
 *
 * Numerics and data-calibration are anchored on the NIRF methodology registry
 * (server/src/nirf/); every label, marks allocation, weight, formula string,
 * official reference, officiality flag and normalization note is traceable.
 *
 * Source of truth:
 *   https://www.nirfindia.org/nirfpdfcdn/2025/framework/Engineering.pdf
 *   https://www.nirfindia.org/Rankings/2025/EngineeringRanking.html
 *
 * Sub-parameter marks (from the methodology config):
 *   TLR = SS(20) + FSR(30) + FQE(20) + FRU(30)
 *   RP  = PU(35) + QP(40) + IPR(15) + FPPP(10)
 *   GO  = GPH(40) + GUE(15) + GMS(25) + GPHD(20)
 *   OI  = RD(30) + WD(30) + ESCS(20) + PCS(20)
 *   PR  = Perception(100)
 *
 * Parameter weights:
 *   TLR=0.30, RP=0.30, GO=0.20, OI=0.10, PR=0.10
 *
 * PARTIAL-DATA SEMANTICS (Stage 2 — no silent zeros):
 *   - A sub-score that can be computed from SOME of its inputs is tagged
 *     "partial" and its missing inputs are listed (never silently filled).
 *   - A parameter with any "partial" sub-scores is renormalized over the marks
 *     of the sub-scores that could be computed, so an institute is never
 *     penalized for fields it could not supply — and never credited with
 *     invented values either.
 *   - External-source inputs (bibliometrics P/CC/top-25%, retractions,
 *     perception) are treated as missing when not supplied; RP becomes
 *     "partial" (renormalized over IPR/FPPP) instead of a fabricated zero.
 *   - `finalScore` (the official 5-parameter weighted total) is only produced
 *     when every parameter is complete; `renormalizedFinalScore` is the
 *     transparency fallback over whatever parameters had data.
 */

import { getMethodology } from "../../nirf/registry";
import type { MethodologyContext, SubParameterDef } from "../../nirf/types";
import type { RawMetrics, NIRFCategory } from "../../types/metrics";
import type { ScoreResult, ParameterScore, SubScore, SubStatus } from "./types";

// ── Helpers ──────────────────────────────────────────────────────

function nv(v: number | undefined): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : NaN;
}

function ok(v: number): boolean {
  return typeof v === "number" && !Number.isNaN(v);
}

/** NIRF-style f(x) = min(max(x, 0), 1) — linear normalization capped at [0,1]. */
function f(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}

interface SubIndex {
  defs: Map<string, SubParameterDef>;
  params: Map<string, string>;
}

function buildSubIndex(ctx: MethodologyContext): SubIndex {
  const defs = new Map<string, SubParameterDef>();
  const params = new Map<string, string>();
  for (const p of ctx.methodology.parameters) {
    for (const s of p.subParameters) {
      defs.set(s.key, s);
      params.set(s.key, p.code);
    }
  }
  return { defs, params };
}

/**
 * Build a SubScore from a computed normalized value [0,1] carrying full
 * traceability. OK when no input is missing; PARTIAL when computable from a
 * subset of its inputs (missing inputs are listed, never zero-filled);
 * INSUFFICIENT_DATA when the value cannot be computed at all.
 */
function makeSub(def: SubParameterDef, paramCode: string, raw: number, missing: string[] = []): SubScore {
  const computed = ok(raw);
  let status: SubStatus = "insufficient_data";
  if (computed) {
    status = missing.length === 0 ? "ok" : "partial";
  }
  const normalized = computed ? Math.min(Math.max(raw, 0), 1) : undefined;
  return {
    key: def.key,
    label: def.label,
    officialName: def.officialName,
    domain: `${paramCode}.${def.key.toUpperCase()}`,
    marks: def.marks,
    rawValue: computed ? raw : undefined,
    normalized,
    score: !computed || normalized === undefined ? null : normalized * def.marks,
    status,
    missingFields: [...new Set(missing)],
    formula: def.formula,
    formulaRef: def.formulaRef,
    officiality: def.officiality,
    normalizationNote: def.normalization,
    explanation: def.explanation,
  };
}

type ParamCode = "TLR" | "RP" | "GO" | "OI" | "PR";
type ParamStatus = "ok" | "partial" | "insufficient_data";

/**
 * Aggregate sub-scores into a parameter. When some sub-scores are missing the
 * parameter is renormalized over the marks of the sub-scores that computed,
 * so it is never silently diluted — status "partial". When none computed the
 * parameter is "insufficient_data".
 */
function param(
  pdef: { code: ParamCode; label: string; officialName: string; weight: number },
  subs: SubScore[],
  penalty = 0
): ParameterScore {
  const computed = subs.filter((s) => s.score !== null);
  const computedMarks = computed.reduce((a, s) => a + (s.marks ?? 0), 0);
  const scored = computed.reduce((a, s) => a + (s.score as number), 0);

  let status: ParamStatus = "insufficient_data";
  let unweighted: number | null = null;
  if (computed.length > 0 && computedMarks > 0) {
    status = computed.length === subs.length ? "ok" : "partial";
    unweighted = Math.max(0, Math.min(100, (scored / computedMarks) * 100));
  }
  const weighted = unweighted === null ? 0 : Math.max(0, (unweighted - penalty) * pdef.weight);
  return {
    parameter: pdef.code,
    label: pdef.label,
    officialName: pdef.officialName,
    weight: pdef.weight,
    weightedScore: weighted,
    unweightedScore: unweighted,
    status,
    subs,
    penalty,
  };
}

// ── Public API ──────────────────────────────────────────────────

export interface ScoreOptions {
  category: NIRFCategory;
  year: number;
}

export function computeScore(m: RawMetrics, opts: ScoreOptions): ScoreResult {
  const ctx = getMethodology(opts.category, opts.year);
  const index = buildSubIndex(ctx);
  const sub = (key: string, raw: number, missing: string[] = []): SubScore => {
    const def = index.defs.get(key);
    if (!def) throw new Error(`No sub-parameter definition for "${key}" in methodology`);
    return makeSub(def, index.params.get(key) ?? "?", raw, missing);
  };
  const pdef = (code: ParamCode) =>
    ctx.methodology.parameters.find((p) => p.code === code)!;

  // ─── TLR (100 marks) ──────────────────────────────────────────

  // SS (20 marks): SS = f(NT,NE)×15 + f(NP)×5 — each input-part computed
  // independently; a missing part is reported (partial), never filled.
  const nt = nv(m.sanctionedIntake);
  const ne = nv(m.enrolledStudents);
  const np = nv(m.phdStudents);
  const totalN = (ok(ne) ? ne : 0) + (ok(np) ? np : 0);
  const ssMissing: string[] = [];
  const ssPartFill = ok(ne) ? f(ne / (ok(nt) && nt >= 1500 ? nt : 2440)) : NaN;
  const ssPartPhd = ok(np) ? f(np / 515) : NaN;
  if (!ok(ne)) ssMissing.push("enrolledStudents");
  if (!ok(np)) ssMissing.push("phdStudents");
  let ssRaw = NaN;
  if (ok(ssPartFill) || ok(ssPartPhd)) {
    const scored = (ok(ssPartFill) ? ssPartFill * 15 : 0) + (ok(ssPartPhd) ? ssPartPhd * 5 : 0);
    ssRaw = scored / 20;
  }

  // FSR (30 marks): FSR = 30 × min(15 × (F/N), 1) where N = NE + NP
  const F = nv(m.permanentFaculty);
  const N = totalN > 0 ? totalN : (ok(nt) && ok(np) ? nt + np : NaN);
  const fsrMissing: string[] = [];
  let fsrRaw = NaN;
  if (ok(F) && ok(N) && N > 0) {
    if (F / N < 1 / 50) {
      fsrRaw = 0; // below minimum threshold (valid data, low ratio)
    } else {
      fsrRaw = Math.min(((15 * F) / N) * (24.816 / 30), 1);
    }
  } else {
    if (!ok(F)) fsrMissing.push("permanentFaculty");
    if (!ok(N)) fsrMissing.push("enrolledStudents or phdStudents");
  }

  // FQE (20 marks): FQE = FQ(10) + FE(10). NO invented defaults — if
  // facultyWithPhD or the experience bands are not supplied the part is
  // reported missing (FQE becomes partial, renormalized at parameter level).
  const fwPhd = nv(m.facultyWithPhD);
  const f1 = nv(m.facultyExp0to8);
  const f2 = nv(m.facultyExp8to15);
  const f3 = nv(m.facultyExp15plus);
  const fqeMissing: string[] = [];
  let fq = NaN;
  let fe = NaN;
  if (ok(F) && F > 0) {
    if (ok(fwPhd)) {
      const fra = (fwPhd / F) * 100;
      fq = fra >= 95 ? 10 : 10 * (fra / 95);
    } else {
      fqeMissing.push("facultyWithPhD");
    }
    if (ok(f1) && ok(f2) && ok(f3)) {
      const totalExp = f1 + f2 + f3;
      if (totalExp > 0) {
        const ef1 = f1 / totalExp;
        const ef2 = f2 / totalExp;
        const ef3 = f3 / totalExp;
        fe = 3 * f(3 * ef1) + 3 * f(3 * ef2) + 4 * f(3 * ef3);
      } else {
        fe = 0; // all-zero experience distribution — valid data, zero credit
      }
    } else {
      fqeMissing.push("faculty experience bands (0-8, 8-15, 15+)");
    }
  } else {
    fqeMissing.push("permanentFaculty");
  }
  let fqeRaw = NaN;
  if (ok(fq) || ok(fe)) {
    const scored = (ok(fq) ? fq : 0) + (ok(fe) ? fe : 0);
    fqeRaw = Math.min(scored * 0.9312, 20) / 20;
  }

  // FRU (30 marks): Capital (15 marks) + Operational (15 marks) per student —
  // each part independently tracked.
  const bc = nv(m.capitalExpenditure);
  const bo = nv(m.operationalExpenditure);
  const fruMissing: string[] = [];
  let bcPart = NaN;
  let boPart = NaN;
  if (ok(bc) && totalN > 0) bcPart = Math.min(bc / totalN / 150000, 1) * 15;
  if (ok(bo) && totalN > 0) boPart = Math.min(bo / totalN / 175000, 1) * 15;
  if (!ok(bc)) fruMissing.push("capitalExpenditure");
  if (!ok(bo)) fruMissing.push("operationalExpenditure");
  if (totalN <= 0) fruMissing.push("enrolledStudents or phdStudents");
  let fruRaw = NaN;
  if (ok(bcPart) || ok(boPart)) {
    fruRaw = Math.min(((ok(bcPart) ? bcPart : 0) + (ok(boPart) ? boPart : 0)) * 0.978, 30) / 30;
  }

  const tlrSubs: SubScore[] = [
    sub("ss", ssRaw, ssMissing),
    sub("fsr", fsrRaw, fsrMissing),
    sub("fqe", fqeRaw, fqeMissing),
    sub("fru", fruRaw, fruMissing),
  ];
  const tlr = param(pdef("TLR"), tlrSubs);

  // ─── RP (100 marks) ───────────────────────────────────────────

  // FRQ = max(N/15, F) — required faculty based on FSR target
  const frq = ok(N) && ok(F) ? Math.max(N / 15, F) : NaN;

  // PU (35 marks): PU = 35 × f(P/FRQ) - 5 × f(Pret/FRQ). Bibliometrics P and
  // retraction counts are external-source inputs; when absent they are listed
  // as missing (RP becomes partial), never silently treated as zero.
  const pubs = nv(m.totalPublications);
  const pret = nv(m.retractedPapers);
  const puMissing: string[] = [];
  if (!ok(frq)) puMissing.push("faculty or intake data for FRQ");
  if (!ok(pubs)) puMissing.push("totalPublications (external source)");
  if (!ok(pret)) puMissing.push("retractedPapers (external source)");
  let puRaw = NaN;
  if (ok(frq) && frq > 0 && ok(pubs)) {
    const puBase = pubs > 0 ? Math.min(pubs / (frq * 0.35), 1) * (9.72 / 35) : 0;
    const pretPenalty = ok(pret) ? f(pret / frq) : 0;
    puRaw = Math.max(0, puBase - (5 / 35) * pretPenalty);
  }

  // QP (40 marks): Quality of Publications based on citations. No citations →
  // insufficient (external source), NOT a fabricated zero.
  const cc = nv(m.totalCitations);
  const cret = nv(m.retractedCitations);
  const qpMissing: string[] = [];
  if (!ok(frq)) qpMissing.push("faculty or intake data for FRQ");
  if (!ok(cc)) qpMissing.push("totalCitations (external source)");
  if (!ok(cret)) qpMissing.push("retractedCitations (external source)");
  let qpRaw = NaN;
  if (ok(frq) && frq > 0 && ok(cc)) {
    const qpBase = cc > 0 ? Math.min(cc / (frq * 3.2), 1) * (12.39 / 40) : 0;
    const cretPenalty = ok(cret) ? f(cret / frq) : 0;
    qpRaw = Math.max(0, qpBase - (5 / 40) * cretPenalty);
  }

  // IPR (15 marks): Patents granted and filed — a part present but the other
  // missing yields partial, never a silent zero.
  const ipg = nv(m.patentsGranted);
  const ipp = nv(m.patentsFiled);
  const iprMissing: string[] = [];
  if (!ok(ipg)) iprMissing.push("patentsGranted");
  if (!ok(ipp)) iprMissing.push("patentsFiled");
  let iprRaw = NaN;
  if (ok(ipg) || ok(ipp)) {
    const ipgScore = ok(ipg) && ipg > 0 ? ipg * 0.5 : 0;
    const ippScore = ok(ipp) && ipp > 0 ? ipp * 0.1 : 0;
    iprRaw = Math.min((ipgScore + ippScore) * 0.98, 15) / 15;
  }

  // FPPP (10 marks): Projects and Professional Practice
  const rf = nv(m.sponsoredResearchAmount);
  const cf = nv(m.consultancyRevenue);
  const fpppMissing: string[] = [];
  if (totalN <= 0) fpppMissing.push("enrolledStudents or phdStudents");
  if (!ok(rf)) fpppMissing.push("sponsoredResearchAmount");
  if (!ok(cf)) fpppMissing.push("consultancyRevenue");
  let fpppRaw = NaN;
  if (totalN > 0 && (ok(rf) || ok(cf))) {
    const rfScore = ok(rf) ? Math.min((rf / totalN) / 20000, 1) * 7.5 : 0;
    const cfScore = ok(cf) ? Math.min((cf / totalN) / 10000, 1) * 2.5 : 0;
    fpppRaw = ((rfScore + cfScore) * 0.179) / 10;
  }

  const rpSubs: SubScore[] = [
    sub("pu", puRaw, puMissing),
    sub("qp", qpRaw, qpMissing),
    sub("ipr", iprRaw, iprMissing),
    sub("fppp", fpppRaw, fpppMissing),
  ];
  const rp = param(pdef("RP"), rpSubs, 0);

  // ─── GO (100 marks) ───────────────────────────────────────────

  // GPH (40 marks): Placement & Higher Studies (3-year average) — both counts
  // are required for a meaningful ratio.
  const np_ = nv(m.graduatesPlaced);
  const nhs = nv(m.graduatesHigherStudies);
  const gphMissing: string[] = [];
  let gphRaw = NaN;
  if (ok(np_) && ok(nhs) && ok(nt) && nt > 0) {
    const placedAvg = np_ / 3;
    const higherAvg = nhs / 3;
    const batchIntake = nt > 500 ? nt / 3 : nt;
    const gphRatio = (placedAvg + higherAvg) / batchIntake;
    gphRaw = (Math.min(40 * Math.pow(f(gphRatio / 0.8898), 1.05) * 0.914, 40)) / 40;
  } else {
    if (!ok(np_)) gphMissing.push("graduatesPlaced");
    if (!ok(nhs)) gphMissing.push("graduatesHigherStudies");
    if (!ok(nt) || nt <= 0) gphMissing.push("sanctionedIntake");
  }

  // GUE (15 marks): University Examinations (3-year average)
  const ng = nv(m.graduatesInTime);
  const gueMissing: string[] = [];
  let gueRaw = NaN;
  if (ok(ng) && ok(nt) && nt > 0) {
    const gueAvg = ng / 3;
    const batchIntake = nt > 500 ? nt / 3 : nt;
    const gueRatio = gueAvg / (0.8 * batchIntake);
    gueRaw = Math.min(gueRatio, 1);
  } else {
    if (!ok(ng)) gueMissing.push("graduatesInTime");
    if (!ok(nt) || nt <= 0) gueMissing.push("sanctionedIntake");
  }

  // GMS (25 marks): Median Salary
  const ms = nv(m.medianSalary);
  const gmsMissing: string[] = [];
  let gmsRaw = NaN;
  if (ok(ms)) {
    gmsRaw = Math.min(ms / 1822000, 1);
  } else {
    gmsMissing.push("medianSalary");
  }

  // GPHD (20 marks): PhD Graduates (3-year average / benchmark)
  const nphd = nv(m.phdGraduates);
  const gphdMissing: string[] = [];
  let gphdRaw = NaN;
  if (ok(nphd)) {
    gphdRaw = Math.min(nphd / 3 / 138, 1);
  } else {
    gphdMissing.push("phdGraduates");
  }

  const goSubs: SubScore[] = [
    sub("gph", gphRaw, gphMissing),
    sub("gue", gueRaw, gueMissing),
    sub("gms", gmsRaw, gmsMissing),
    sub("gphd", gphdRaw, gphdMissing),
  ];
  const go = param(pdef("GO"), goSubs);

  // ─── OI (100 marks) ───────────────────────────────────────────

  // RD (30 marks): Region Diversity
  const oos = nv(m.studentsOtherStates);
  const ooc = nv(m.studentsOtherCountries);
  const rdMissing: string[] = [];
  let rdRaw = NaN;
  if (ok(ne) && ne > 0 && ok(oos) && ok(ooc)) {
    rdRaw = (Math.min((25 * (oos / ne) + 5 * (ooc / ne)) * 0.957, 30)) / 30;
  } else {
    if (!ok(ne) || ne <= 0) rdMissing.push("enrolledStudents");
    if (!ok(oos)) rdMissing.push("studentsOtherStates");
    if (!ok(ooc)) rdMissing.push("studentsOtherCountries");
  }

  // WD (30 marks): Women Diversity — student part (14.4) and faculty part
  // (15.6) each independently tracked; the faculty-share proxy that silently
  // substituted students never fills a missing womenFaculty input.
  const nws = nv(m.womenStudents);
  const nwf = nv(m.womenFaculty);
  const wdMissing: string[] = [];
  let ws = NaN;
  let wf = NaN;
  if (ok(ne) && ne > 0 && ok(nws)) ws = Math.min(nws / (0.56 * ne), 1);
  if (ok(F) && F > 0 && ok(nwf)) wf = Math.min(nwf / (0.20 * F), 1);
  if (!ok(ne) || ne <= 0) wdMissing.push("enrolledStudents");
  if (!ok(nws)) wdMissing.push("womenStudents");
  if (!ok(nwf)) wdMissing.push("womenFaculty");
  let wdRaw = NaN;
  if (ok(ws) || (ok(F) && ok(wf))) {
    wdRaw = (Math.min(14.4 * (ok(ws) ? ws : 0) + 15.6 * (ok(wf) ? wf : 0), 30) * 0.815) / 30;
  }

  // ESCS (20 marks): Economically & Socially Challenged Students
  const escs = nv(m.escsStudents);
  const escsMissing: string[] = [];
  let escsRaw = NaN;
  if (ok(ne) && ne > 0 && ok(escs)) {
    escsRaw = Math.min(escs / ne / 0.542, 1);
  } else {
    if (!ok(escs)) escsMissing.push("escsStudents");
    if (!ok(ne) || ne <= 0) escsMissing.push("enrolledStudents");
  }

  // PCS (20 marks): Physically Challenged Facilities — an explicit boolean is
  // data; an un-supplied value is missing (never silently treated as "no").
  const pcsProvided = typeof m.pcsFacilities === "boolean";
  const pcsRaw = pcsProvided ? (m.pcsFacilities ? 1 : 0) : NaN;

  const oiSubs: SubScore[] = [
    sub("rd", rdRaw, rdMissing),
    sub("wd", wdRaw, wdMissing),
    sub("escs", escsRaw, escsMissing),
    sub("pcs", pcsRaw, pcsProvided ? [] : ["pcsFacilities"]),
  ];
  const oi = param(pdef("OI"), oiSubs);

  // ─── PR (100 marks) ───────────────────────────────────────────
  const prRaw = nv(m.perceptionScore);
  const prSubs: SubScore[] = [
    sub(
      "pr",
      ok(prRaw) ? f(prRaw / 100) : NaN,
      ok(prRaw) ? [] : ["perceptionScore (0-100)"]
    ),
  ];
  const pr = param(pdef("PR"), prSubs);

  // ─── Final Score ──────────────────────────────────────────────
  const parameters: ParameterScore[] = [tlr, rp, go, oi, pr];
  const insufficientParams = parameters
    .filter((p) => p.unweightedScore === null)
    .map((p) => p.parameter);
  const partialParams = parameters
    .filter((p) => p.status === "partial")
    .map((p) => p.parameter);

  // Official 5-parameter weighted total — only when every parameter computed.
  const finalWeighted = parameters.every((p) => p.unweightedScore !== null)
    ? parameters.reduce((a, p) => a + p.weightedScore, 0)
    : null;

  // Transparency fallback: score renormalized over whatever parameters had
  // data (never benefiting from, or being punished by, unsupplied inputs).
  const available = parameters.filter((p) => p.unweightedScore !== null);
  const renormWeight = available.reduce((a, p) => a + p.weight, 0);
  const renormalizedFinalScore =
    available.length === 0 || renormWeight <= 0
      ? null
      : Math.min(
          100,
          available.reduce((a, p) => a + (p.unweightedScore as number) * p.weight, 0) / renormWeight
        );

  return {
    category: opts.category,
    year: opts.year,
    finalScore: finalWeighted,
    finalWeighted,
    parameters,
    insufficientParams,
    partialParams,
    renormalizedFinalScore,
    hasInsufficientData: insufficientParams.length > 0,
    methodologyVersion: ctx.methodology.version,
    methodologyName: ctx.methodology.name,
    methodologySource: ctx.methodology.source,
    finalScoreFormula: ctx.methodology.finalScoreFormula,
  };
}