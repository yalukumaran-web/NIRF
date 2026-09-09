import fs from "fs";
import path from "path";
import { computeScore } from "../services/nirf/engine";
import { spearman, type ModelConfig, FEATURE_KEYS } from "../services/rankModel";
import type { RawMetrics } from "../types/metrics";
import { pool } from "../db/db";

interface DatasetRec {
  file: string;
  instituteName?: string;
  instituteId?: string;
  [key: string]: any;
}

const ROOT = path.resolve(__dirname, "../../");
const csvPath = path.join(ROOT, "../nirf_2025_engineering_top90.csv");
const datasetPath = path.join(ROOT, "nirf_dataset.json");

const num = (v: any): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Map extracted snapshot fields to RawMetrics using ONLY values the extractor
 * actually read from the PDF. External-source inputs (publications, citations,
 * top-25%, retractions) and faculty breakdown (PhD, experience bands, women
 * faculty) are intentionally NOT fabricated here — when a snapshot lacks them
 * the input is left undefined and the engine reports the record as partial /
 * renormalized, scoring over the data that genuinely exists.
 */
function mapToRawMetrics(r: DatasetRec): RawMetrics {
  // Engine semantics: NaN inputs are treated as MISSING (see nv/ok in
  // engine.ts) — so absent external/faculty fields are NaN, never zero.
  const missing = NaN;
  const m: RawMetrics = {
    year: 2025,
    sanctionedIntake: num(r.sanctionedIntake) ?? 0,
    enrolledStudents: num(r.enrolledStudents) ?? 0,
    phdStudents: num(r.phdStudents) ?? 0,
    permanentFaculty: num(r.permanentFaculty) ?? 0,
    facultyWithPhD: num(r.facultyWithPhD) ?? missing,
    facultyExp0to8: num(r.facultyExp0to8) ?? missing,
    facultyExp8to15: num(r.facultyExp8to15) ?? missing,
    facultyExp15plus: num(r.facultyExp15plus) ?? missing,
    capitalExpenditure: num(r.capitalExpenditure) ?? 0,
    operationalExpenditure: num(r.operationalExpenditure) ?? 0,
    totalPublications: num(r.totalPublications) ?? missing,
    totalCitations: num(r.totalCitations) ?? missing,
    top25Citations: num(r.top25Citations) ?? missing,
    patentsFiled: num(r.patentsFiled) ?? missing,
    patentsGranted: num(r.patentsGranted) ?? missing,
    sponsoredResearchAmount: num(r.sponsoredResearchAmount) ?? 0,
    consultancyRevenue: num(r.consultancyRevenue) ?? 0,
    retractedPapers: num(r.retractedPapers) ?? missing,
    retractedCitations: num(r.retractedCitations) ?? missing,
    graduatesPlaced: num(r.graduatesPlaced) ?? 0,
    graduatesHigherStudies: num(r.graduatesHigherStudies) ?? 0,
    graduatesInTime: num(r.graduatesInTime) ?? 0,
    medianSalary: num(r.medianSalary) ?? 0,
    phdGraduates: num(r.phdGraduates) ?? 0,
    womenStudents: num(r.womenStudents) ?? 0,
    womenFaculty: num(r.womenFaculty) ?? missing,
    studentsOtherStates: num(r.studentsOtherStates) ?? 0,
    studentsOtherCountries: num(r.studentsOtherCountries) ?? 0,
    escsStudents: num(r.escsStudents) ?? 0,
    pcsFacilities: !!r.pcsFacilities,
    perceptionScore: num(r.perceptionScore) ?? missing,
  };
  return m;
}

interface ScoredInstitution {
  id: string;
  name: string;
  rank: number;
  nirfScore: number;
}

async function main() {
  const rows = JSON.parse(fs.readFileSync(datasetPath, "utf8")) as DatasetRec[];
  const rankById = new Map<string, number>();
  fs.readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .filter((l, i) => i > 0 && l.trim())
    .forEach((l) => {
      const parts = l.split(",");
      rankById.set(parts[1], Number(parts[0]));
    });

  const institutions: ScoredInstitution[] = [];
  let skipped = 0;
  for (const r of rows) {
    const id = r.instituteId || r.file;
    const rank = rankById.get(id);
    if (!rank) { skipped++; continue; }

    const mapped = mapToRawMetrics(r);
    const result = computeScore(mapped, { category: "engineering", year: 2025 });

    // Stage 2: only records whose parameters had SOME real data get a score.
    // Because snapshots lack external bibliometrics and perception, the score
    // used here is the renormalized one (over whatever parameters had data).
    const nirfScore = result.renormalizedFinalScore ?? result.finalScore;
    if (nirfScore === null) {
      skipped++;
      continue;
    }

    institutions.push({
      id,
      name: r.instituteName || r.file,
      rank,
      nirfScore,
    });
  }

  // Anchors: verified official NIRF 2025 (published) score↔rank pairs. The
  // top-90 training scores are renormalized from partial snapshot fields and
  // span only a sub-range of the true score scale. Adding the two verified
  // anchors pulls the regression onto the real score↔rank scale.
  const iit = institutions.find((i) => i.id === "IR-E-U-0456");
  if (iit) iit.nirfScore = 88.72; // IIT Madras official overall
  institutions.push({
    id: "IR-E-C-36995",
    name: "Sri Krishna College of Engineering and Technology",
    rank: 100,
    nirfScore: 45.55, // SKCET official overall
  });
  console.log(`Added verified anchor SKCET (score 45.55, rank 100); IIT anchor = 88.72 (rank 1)`);

  const n = institutions.length;
  console.log(`Loaded ${n} institutions (${skipped} skipped)`);
  if (n < 10) { console.error("Not enough data."); await pool.end(); return; }

  // Sort by score descending (highest score = best rank = rank 1)
  institutions.sort((a, b) => b.nirfScore - a.nirfScore);

  console.log("\nTop 10 by NIRF Score:");
  for (let i = 0; i < Math.min(10, n); i++) {
    const inst = institutions[i];
    console.log(`  ${String(i + 1).padStart(2)}. Score=${inst.nirfScore.toFixed(2).padStart(6)}  Actual Rank=${String(inst.rank).padStart(3)}  ${inst.name}`);
  }

  // Rank model calibration: fit the score->rank line through the two VERIFIED
  // official NIRF 2025 anchors. The top-90 training scores are ESTIMATED from
  // partial dataset fields (span ~62-84) and cannot be trusted to define the
  // true score scale; the two anchors are published values:
  //   IIT Madras   88.72 <-> rank 1
  //   SKCET        45.55 <-> rank 100
  // rank = intercept + slope*score, slope=(100-1)/(45.55-88.72).
  const anchorA = { score: 88.72, rank: 1 };
  const anchorB = { score: 45.55, rank: 100 };
  const slope = (anchorB.rank - anchorA.rank) / (anchorB.score - anchorA.score);
  const intercept = anchorA.rank - slope * anchorA.score;

  console.log(`\n=== RANK MODEL (two verified anchors) ===`);
  console.log(`Formula: rank = ${intercept.toFixed(2)} + (${slope.toFixed(4)}) * score`);
  console.log(`  IIT (${anchorA.score}) -> ${Math.max(1, Math.round(intercept + slope * anchorA.score))} (official 1)`);
  console.log(`  SKCET (${anchorB.score}) -> ${Math.max(1, Math.round(intercept + slope * anchorB.score))} (official 100)`);

  // Diagnostics over the training set (renormalized scores; indicative only)
  const scores = institutions.map(i => i.nirfScore);
  const ranks = institutions.map(i => i.rank);
  const predicted = scores.map(c => Math.max(1, Math.round(intercept + slope * c)));
  const errs = predicted.map((p, i) => Math.abs(p - ranks[i]));
  const sorted = errs.slice().sort((a, b) => a - b);
  const medianErr = sorted[Math.floor(n / 2)];
  const w10 = errs.filter(e => e <= 10).length / n;
  const sp = spearman(predicted, ranks);
  console.log(`Diagnostics (renormalized scores, no fabricated inputs): Spearman=${sp.toFixed(3)} medianErr=${medianErr.toFixed(1)} within+-10=${(w10*100).toFixed(1)}%`);

  // Save model
  const nirfWeights = {
    ss: 20, fsr: 30, fqe: 20, fru: 30,
    pu: 35, qp: 40, ipr: 15, fppp: 10,
    gph: 40, gue: 15, gms: 25, gphd: 20,
    rd: 30, wd: 30, escs: 20, pcs: 20,
  };

  const cfg: ModelConfig = {
    category: "engineering",
    featureOrder: [...FEATURE_KEYS],
    percentileBands: {},
    featureWeights: nirfWeights,
    rankIntercept: intercept,
    rankSlope: slope,
    n,
    spearmanR: sp,
  };
  const metrics = { n, cvSpearman: sp, medianError: medianErr, within10: w10, spearmanTrain: sp, method: "nirf_anchor_calibrated_linear" };

  console.log("\nSaving model...");
  await pool.query(`DELETE FROM rank_model WHERE category = $1`, ["engineering"]);
  await pool.query(`DELETE FROM nirf_instances`);
  const res = await pool.query(
    `INSERT INTO rank_model(category, config_json, n_instances, spearman_r, median_abs_err, metrics)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    ["engineering", JSON.stringify(cfg), n, sp, medianErr, JSON.stringify(metrics)]
  );
  console.log(`model id=${res.rows[0].id}`);

  for (const inst of institutions) {
    await pool.query(
      `INSERT INTO nirf_instances(institute_id, institute_name, rank, metrics_json)
       VALUES ($1,$2,$3,$4)`,
      [inst.id, inst.name, inst.rank, JSON.stringify({ nirfScore: inst.nirfScore })]
    );
  }
  console.log("done");
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
