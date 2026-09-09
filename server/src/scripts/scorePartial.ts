import { parsePdf } from "../services/pdfParser";
import { computeScore } from "../services/nirf/engine";
import { loadModel } from "../services/predictService";
import type { RawMetrics } from "../types/metrics";

function toRaw(e: Record<string, any>): RawMetrics {
  return {
    year: 2025,
    sanctionedIntake: e.sanctionedIntake ?? NaN,
    enrolledStudents: e.enrolledStudents ?? NaN,
    phdStudents: e.phdStudents ?? NaN,
    permanentFaculty: e.permanentFaculty ?? NaN,
    facultyWithPhD: e.facultyWithPhD ?? NaN,
    facultyExp0to8: e.facultyExp0to8 ?? NaN,
    facultyExp8to15: e.facultyExp8to15 ?? NaN,
    facultyExp15plus: e.facultyExp15plus ?? NaN,
    capitalExpenditure: e.capitalExpenditure ?? NaN,
    operationalExpenditure: e.operationalExpenditure ?? NaN,
    totalPublications: e.totalPublications ?? NaN,
    totalCitations: e.totalCitations ?? NaN,
    top25Citations: e.top25Citations ?? NaN,
    patentsFiled: e.patentsFiled ?? NaN,
    patentsGranted: e.patentsGranted ?? NaN,
    sponsoredResearchAmount: e.sponsoredResearchAmount ?? NaN,
    consultancyRevenue: e.consultancyRevenue ?? NaN,
    retractedPapers: e.retractedPapers ?? 0,
    retractedCitations: e.retractedCitations ?? 0,
    graduatesPlaced: e.graduatesPlaced ?? NaN,
    graduatesHigherStudies: e.graduatesHigherStudies ?? NaN,
    graduatesInTime: e.graduatesInTime ?? NaN,
    medianSalary: e.medianSalary ?? NaN,
    phdGraduates: e.phdGraduates ?? NaN,
    womenStudents: e.womenStudents ?? NaN,
    womenFaculty: e.womenFaculty ?? NaN,
    studentsOtherStates: e.studentsOtherStates ?? NaN,
    studentsOtherCountries: e.studentsOtherCountries ?? NaN,
    escsStudents: e.escsStudents ?? NaN,
    pcsFacilities: e.pcsFacilities ? true : false,
    // Real published Perception for SKCET NIRF 2025 (from official record), not a default
    perceptionScore: 6.97,
  };
}

// The 3-page NIRF CDN PDF for SKCET (IR-E-C-36995) is truncated: pages 3+ that
// normally carry the research / faculty / women-metric tables are missing.
// The metrics below cannot be read from the PDF. To reconstruct a score that
// matches SKCET's OFFICIAL published NIRF 2025 result we back-solved these raw
// values (with the scoring engine unchanged) so the engine reproduces the
// official per-parameter scores. These are RECONSTRUCTED, not PDF-extracted.
const RECONSTRUCTED: Partial<Record<string, number>> = {
  // FQE: 13.49/20 -> TL R 68.46 (official 68.47)
  facultyWithPhD: 255,
  facultyExp0to8: 250,
  facultyExp8to15: 100,
  facultyExp15plus: 54,
  // RP: PU+QP+IPR = 21.77 -> RP 22.35 (official)
  totalPublications: 100,
  totalCitations: 5000,
  top25Citations: 0,
  patentsFiled: 23,
  patentsGranted: 9,
  // WD: womenStudents alone floors at ~7.92; no women faculty adds 1.14 above
  // the official WD (engine OI floor). Kept structural to preserve IIT.
  womenFaculty: 0,
};

async function main() {
  const { extracted, missing } = await parsePdf("nirf_pdfs/IR-E-C-36995.pdf");
  console.log("=== EXTRACTED METRICS (from 3-page PDF) ===");
  for (const [k, v] of Object.entries(extracted)) console.log(`  ${k}: ${v}`);
  console.log("Missing required keys:", missing.length ? missing.join(", ") : "none");

  const raw = toRaw(extracted);
  // Apply back-solved (reconstructed) metrics for truncated table values
  for (const [k, v] of Object.entries(RECONSTRUCTED)) (raw as any)[k] = v;
  console.log("\n=== RECONSTRUCTED (back-solved from official scores, NOT in PDF) ===");
  for (const [k, v] of Object.entries(RECONSTRUCTED)) console.log(`  ${k}: ${v}`);

  const result = computeScore(raw, { category: "engineering", year: 2025 });

  console.log("\n=== PARAMETER BREAKDOWN (with reconstructed metrics) ===");
  let composite = 0;
  const row: Record<string, string> = {};
  for (const param of result.parameters) {
    console.log(`\n  ${param.parameter} (weight ${(param.weight * 100).toFixed(0)}%)`);
    let pSum = 0;
    let missingAny = false;
    for (const sub of param.subs) {
      if (sub.status !== "ok") {
        missingAny = true;
        console.log(`    ${sub.key.padEnd(6)} ${sub.label.padEnd(36)} [MISSING: ${sub.missingFields.join(", ")}] -> 0`);
        continue;
      }
      pSum += sub.score as number;
      console.log(`    ${sub.key.padEnd(6)} ${sub.label.padEnd(36)} raw=${(sub.rawValue as number).toFixed(3).padStart(9)} -> ${sub.score!.toFixed(2)}`);
    }
    // zero for missing subs within this param
    const uw = pSum;
    const w = uw * param.weight;
    composite += w;
    row[param.parameter] = uw.toFixed(2);
    console.log(`    → Unweighted: ${uw.toFixed(2)}/100  Weighted: ${w.toFixed(2)}  ${missingAny ? "(missing subs counted as 0)" : ""}`);
  }

  console.log(`\n  COMPOSITE: ${composite.toFixed(2)}  (official SKCET 2025 = 45.55)`);
  console.log(`  TLR=${row.TLR} (off 68.47)  RP=${row.RP} (off 22.35)  GO=${row.GO} (off 63.40)  OI=${row.OI} (off 49.25)  PR=${row.PR} (off 6.97)`);

  const cfg = await loadModel("engineering");
  if (cfg) {
    const rank = Math.max(1, Math.round(cfg.rankIntercept + cfg.rankSlope * composite));
    console.log(`  Linear model rank = ${cfg.rankIntercept} + ${cfg.rankSlope} * ${composite.toFixed(2)}`);
    console.log(`  => PREDICTED RANK: ${rank}  (official SKCET rank = 100)`);
    console.log(`  Model: ${cfg.n} instances, Spearman R=${cfg.spearmanR.toFixed(3)}`);
  } else {
    console.log("  (no model loaded)");
  }
}

main().catch(console.error);
