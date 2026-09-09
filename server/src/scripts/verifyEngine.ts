/**
 * Phase 7 — verify the scoring engine against official NIRF 2025 Engineering
 * scores for every institution whose partial submitted snapshot exists in
 * server/nirf_dataset.json.
 *
 * IMPORTANT — read the caveats printed by this script:
 *  1. The submitted snapshots are PARTIAL (they lack ~10 inputs such as
 *     sanctioned intake, enrolled students, publications/citations). This
 *     script applies a clearly-labelled "recovery fill" of national-median
 *     constants ONLY to enable the comparison; the resulting engine score is
 *     an ESTIMATE, not a claim of exact reproduction.
 *  2. f() normalization functions of NIRF are not publicly disclosed; the
 *     engine uses documented calibrated linear approximations. Differences
 *     therefore stem from BOTH the approximations and the recovery fill.
 *  3. Perception (PR) is scored by NIRF from an external survey, NOT from the
 *     submitted data PDFs. We therefore do NOT feed the official PR into the
 *     engine (that would leak the answer). PR is reported as non-reproducible
 *     and the final-score reproduction is labelled as conditional on the
 *     documented default perception value used (15 / 100).
 *
 * Run: npm run verify-engine
 */

import { computeScore } from "../services/nirf/engine";
import { OFFICIAL_ENGINEERING_2025 } from "../data/officialEngineering2025";
import type { OfficialEngineeringScore } from "../data/officialEngineering2025";
import type { RawMetrics } from "../types/metrics";
import { mae, rmse } from "../ml/stats";
import snapshotRows from "../../nirf_dataset.json";

interface SnapshotRow {
  file: string;
  instituteName: string;
  instituteId: string;
  permanentFaculty?: number;
  phdStudents?: number;
  capitalExpenditure?: number;
  operationalExpenditure?: number;
  sponsoredResearchAmount?: number;
  consultancyRevenue?: number;
  graduatesPlaced?: number;
  graduatesHigherStudies?: number;
  medianSalary?: number;
  phdGraduates?: number;
  womenStudents?: number;
  studentsOtherStates?: number;
  studentsOtherCountries?: number;
  escsStudents?: number;
  pcsFacilities?: number | boolean;
}

/**
 * Recovery-fill constants (national engineering medians) applied only for the
 * missing inputs in the verification study. Documented so reviewers can see
 * exactly what was imputed.
 */
const RECOVERY_FILL = {
  studentsPerFaculty: 3.6, // NE ≈ 3.6 × F
  intakeOverEnrolled: 1.03, // NT ≈ 1.03 × NE
  inTimeRate: 0.94, // Ng ≈ 0.94 × NE
  phdShareOfFaculty: 0.70, // % faculty with PhD
  exp0to8: 0.32,
  exp8to15: 0.42,
  exp15plus: 0.26,
  pubsPerFaculty: 2.1, // P ≈ 2.1 × F
  citesPerPub: 20, // CC ≈ 20 × P
  top25CitesShare: 0.4, // TOP25 ≈ 0.4 × CC
  patentsFiledPerFaculty: 0.10,
  patentsGrantedPerFaculty: 0.04,
  womenFacultyShare: 0.28,
};

function round(x: number, d = 2): number {
  const k = Math.pow(10, d);
  return Math.round(x * k) / k;
}

function normalizedName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildOfficialLookup(): Map<string, OfficialEngineeringScore> {
  const m = new Map<string, OfficialEngineeringScore>();
  for (const r of OFFICIAL_ENGINEERING_2025) m.set(normalizedName(r.instituteName), r);
  return m;
}

/**
 * Default perception value used when the submitted data cannot provide one.
 * Perception (PR) comes from an external NIRF survey — it is NOT extractable
 * from the institution's submitted PDFs. A neutral floor value is used so the
 * engine can still run; PR reproduction is intentionally not claimed.
 */
const DEFAULT_PERCEPTION = 15;

function toMetrics(row: SnapshotRow): RawMetrics {
  const F = row.permanentFaculty ?? 300;
  const enrolled = row.permanentFaculty ? Math.round(F * RECOVERY_FILL.studentsPerFaculty) : 1100;
  const intake = Math.round(enrolled * RECOVERY_FILL.intakeOverEnrolled);
  const pubs = Math.round(F * RECOVERY_FILL.pubsPerFaculty);
  const cites = Math.round(pubs * RECOVERY_FILL.citesPerPub);

  return {
    year: 2025,
    sanctionedIntake: intake,
    enrolledStudents: enrolled,
    phdStudents: row.phdStudents ?? Math.round(F * 0.5),
    permanentFaculty: F,
    facultyWithPhD: Math.round(F * RECOVERY_FILL.phdShareOfFaculty),
    facultyExp0to8: Math.round(F * RECOVERY_FILL.exp0to8),
    facultyExp8to15: Math.round(F * RECOVERY_FILL.exp8to15),
    facultyExp15plus: Math.round(F * RECOVERY_FILL.exp15plus),
    capitalExpenditure: row.capitalExpenditure ?? 25_000_000,
    operationalExpenditure: row.operationalExpenditure ?? 60_000_000,
    totalPublications: pubs,
    totalCitations: cites,
    top25Citations: Math.round(cites * RECOVERY_FILL.top25CitesShare),
    patentsFiled: Math.round(F * RECOVERY_FILL.patentsFiledPerFaculty),
    patentsGranted: Math.round(F * RECOVERY_FILL.patentsGrantedPerFaculty),
    sponsoredResearchAmount: row.sponsoredResearchAmount ?? 25_000_000,
    consultancyRevenue: row.consultancyRevenue ?? 8_000_000,
    retractedPapers: 0,
    retractedCitations: 0,
    graduatesPlaced: row.graduatesPlaced ?? Math.round(enrolled * 0.62),
    graduatesHigherStudies: row.graduatesHigherStudies ?? Math.round(enrolled * 0.12),
    graduatesInTime: Math.round(enrolled * RECOVERY_FILL.inTimeRate),
    medianSalary: row.medianSalary ?? 600_000,
    phdGraduates: row.phdGraduates ?? Math.round(F * 0.22),
    womenStudents: row.womenStudents ?? Math.round(enrolled * 0.3),
    womenFaculty: Math.round(F * RECOVERY_FILL.womenFacultyShare),
    studentsOtherStates: row.studentsOtherStates ?? Math.round(enrolled * 0.25),
    studentsOtherCountries: row.studentsOtherCountries ?? Math.round(enrolled * 0.03),
    escsStudents: row.escsStudents ?? Math.round(enrolled * 0.45),
    pcsFacilities: Boolean(row.pcsFacilities ?? 1),
    perceptionScore: DEFAULT_PERCEPTION,
  };
}

export async function main() {
  const officialBy = buildOfficialLookup();
  const rows = snapshotRows as unknown as SnapshotRow[];

  interface DiffRec {
    institute: string;
    official: number;
    ours: number;
    diff: number;
  }

  // One accumulator per reproducible parameter + final score.
  const params = {
    tlr: { diffs: [] as DiffRec[], officialKey: "tlr" as const, engineParam: "TLR" as const },
    rpc: { diffs: [] as DiffRec[], officialKey: "rpc" as const, engineParam: "RP" as const },
    go: { diffs: [] as DiffRec[], officialKey: "go" as const, engineParam: "GO" as const },
    oi: { diffs: [] as DiffRec[], officialKey: "oi" as const, engineParam: "OI" as const },
    pr: { diffs: [] as DiffRec[], officialKey: "pr" as const, engineParam: "PR" as const },
  };
  const finalDiffs: DiffRec[] = [];

  let matched = 0;
  let unmatched = 0;
  let insufficient = 0;

  for (const row of rows) {
    const official = officialBy.get(normalizedName(row.instituteName));
    if (!official) {
      unmatched++;
      continue;
    }
    const metrics = toMetrics(row);
    const res = computeScore(metrics, { category: "engineering", year: 2025 });
    if (res.finalScore === null) {
      insufficient++;
      continue;
    }
    matched++;

    const pmap = new Map(
      res.parameters.map((p) => [
        p.parameter as "TLR" | "RP" | "GO" | "OI" | "PR",
        p.unweightedScore === null ? NaN : p.unweightedScore,
      ])
    );
    for (const key of ["tlr", "rpc", "go", "oi", "pr"] as const) {
      const ours = pMap(pmap, params[key].engineParam);
      const officialVal = official[params[key].officialKey];
      params[key].diffs.push({
        institute: official.instituteName,
        official: officialVal,
        ours: round(ours),
        diff: round(ours - officialVal),
      });
    }
    finalDiffs.push({
      institute: official.instituteName,
      official: official.score,
      ours: round(res.finalScore as number),
      diff: round((res.finalScore as number) - official.score),
    });
  }

  console.log("=".repeat(72));
  console.log("NIRF 2025 ENGINEERING REPRODUCTION REPORT  (Phase 1 §12)");
  console.log("=".repeat(72));
  console.log(`Institutions analysed:              ${matched}`);
  console.log(`Unmatched (no top-90 record):       ${unmatched}`);
  console.log(`Insufficient after recovery fill:   ${insufficient}`);
  console.log(`Perception assumption:              ${DEFAULT_PERCEPTION}/100 (NOT from submitted data; NIRF scores PR via external survey)`);
  console.log("");
  console.log("Parameter reproduction accuracy (official minus calculated):");
  console.log("  param        MAE      RMSE    maxAbs   n");
  for (const key of ["tlr", "rpc", "go", "oi", "pr"] as const) {
    const d = params[key].diffs;
    const o = d.map((x) => x.official);
    const u = d.map((x) => x.ours);
    console.log(
      `  ${key.padEnd(6)}  ${String(round(mae(o, u))).padStart(7)}  ${String(round(rmse(o, u))).padStart(7)}  ${String(round(Math.max(...d.map((x) => Math.abs(x.diff))))).padStart(6)}  ${d.length}`
    );
  }
  console.log("");

  const fo = finalDiffs.map((x) => x.official);
  const fu = finalDiffs.map((x) => x.ours);
  console.log("Final score reproduction (conditional on the perception assumption):");
  console.log(`  MAE  = ${round(mae(fo, fu))}`);
  console.log(`  RMSE = ${round(rmse(fo, fu))}`);
  console.log(`  maxAbsDiff = ${round(Math.max(...finalDiffs.map((x) => Math.abs(x.diff))))}`);
  console.log(`  mean signed diff = ${round(finalDiffs.reduce((a, b) => a + b.diff, 0) / finalDiffs.length)} (positive => engine above official)`);
  console.log("");
  console.log("Largest absolute differences for the FINAL score (top 12):");
  console.log("  rank  official  engine   diff   institution");
  const officialLookup = officialBy;
  const byAbs = [...finalDiffs].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  for (const d of byAbs.slice(0, 12)) {
    const official = officialLookup.get(normalizedName(d.institute))!;
    console.log(
      `  ${String(official.rank).padStart(4)}  ${String(d.official).padStart(6)}  ${String(d.ours).padStart(6)}  ${String(d.diff > 0 ? "+" : "").padStart(5)}${d.diff.toFixed(2)}  ${d.institute}`
    );
  }
  console.log("");
  console.log("DOCUMENTED REASONS FOR DIFFERENCES (Phase 1 §7):");
  console.log(" - NIRF does not disclose the f() normalization used for each sub-metric.");
  console.log("   The engine implements the published formula STRUCTURE with calibrated");
  console.log("   linear/soft-cap approximations (marked calibrated_approximation in traces).");
  console.log(" - The submitted snapshots are partial; inputs listed in RECOVERY_FILL were");
  console.log("   imputed with national-median constants purely for this comparison.");
  console.log(" - Perception (PR) is NOT in the submitted PDFs; it is excluded from the");
  console.log("   per-parameter reproduction claim and the final-score MAE/RMSE above is");
  console.log("   conditional on the neutral perception default. This is NOT a leakage of");
  console.log("   official values into the engine (the previous behaviour injected official");
  console.log("   PR — that has been removed).");
  console.log(" - The official data is the only ground truth; where the two diverge the");
  console.log("   official value is authoritative and is the ML training target.");
}

function pMap(
  m: Map<"TLR" | "RP" | "GO" | "OI" | "PR", number>,
  p: "TLR" | "RP" | "GO" | "OI" | "PR"
): number {
  return m.get(p) ?? NaN;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});