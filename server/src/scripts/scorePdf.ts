import { parsePdf } from "../services/pdfParser";
import { computeScore } from "../services/nirf/engine";
import { predictFromMetrics } from "../services/predictService";
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
    perceptionScore: 100,
  };
}

async function main() {
  const file = "nirf_pdfs/IR-E-C-36995.pdf";
  const { extracted, missing } = await parsePdf(file);

  console.log("=== EXTRACTED METRICS ===");
  for (const [k, v] of Object.entries(extracted)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log("\nMISSING:", missing.length ? missing.join(", ") : "none");

  const raw = toRaw(extracted);
  const result = computeScore(raw, { category: "engineering", year: 2025 });

  console.log("\n=== PARAMETER BREAKDOWN ===");
  for (const param of result.parameters) {
    console.log(`\n  ${param.parameter} (Weight: ${(param.weight * 100).toFixed(0)}%)`);
    for (const sub of param.subs) {
      const src = sub.status === "ok" ? "ok" : `INSUFFICIENT: ${sub.missingFields.join(", ")}`;
      const rawv = sub.rawValue !== null && sub.rawValue !== undefined ? (typeof sub.rawValue === "number" ? sub.rawValue.toFixed(3) : sub.rawValue) : "N/A";
      const score = sub.score !== null ? sub.score.toFixed(2) : "N/A";
      console.log(`    ${sub.key.padEnd(6)} ${sub.label.padEnd(38)} raw=${rawv.padStart(9)}  -> ${score.padStart(6)}  [${src}]`);
    }
    const uw = param.unweightedScore !== null ? param.unweightedScore.toFixed(2) : "N/A";
    console.log(`    → Unweighted: ${uw}   Weighted: ${param.weightedScore.toFixed(2)}`);
  }

  console.log(`\n  FINAL NIRF SCORE: ${result.finalScore?.toFixed(2) ?? "N/A"}`);
  console.log("  Insufficient params:", result.insufficientParams.length ? result.insufficientParams.join(", ") : "none");

  try {
    const pred = await predictFromMetrics(raw, "engineering");
    console.log(`\n  ML PREDICTED RANK: ${pred.predictedRank}`);
    console.log(`  NIRF Score:        ${(pred.composite * 100).toFixed(2)}`);
    console.log(`  Confidence:        ${pred.confidence}`);
    console.log(`  Model:             ${pred.model.n} instances, Spearman R=${pred.model.spearmanR.toFixed(3)}`);
  } catch (e: any) {
    console.log("\n  Prediction skipped:", e.message);
  }
}

main().catch(console.error);
