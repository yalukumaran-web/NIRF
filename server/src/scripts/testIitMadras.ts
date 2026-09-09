import { computeScore } from "../services/nirf/engine";
import { predictFromMetrics } from "../services/predictService";
import type { RawMetrics } from "../types/metrics";

/**
 * IIT Madras - NIRF 2025 Engineering
 * Data from official NIRF submission + published rankings
 * PDF: IR-E-U-0456
 */
const iitMadras: RawMetrics = {
  year: 2025,

  // TLR
  sanctionedIntake: 5203,
  enrolledStudents: 6453,
  phdStudents: 1998,
  permanentFaculty: 686,
  facultyWithPhD: 650,
  facultyExp0to8: 200,
  facultyExp8to15: 250,
  facultyExp15plus: 236,
  capitalExpenditure: 268746540,
  operationalExpenditure: 6606258824,

  // RP
  totalPublications: 12436,
  totalCitations: 33808,
  top25Citations: 7414,
  patentsFiled: 479,
  patentsGranted: 142,
  sponsoredResearchAmount: 9563110074,
  consultancyRevenue: 3949276519,
  retractedPapers: 2,
  retractedCitations: 8,

  // GO
  graduatesPlaced: 2556,
  graduatesHigherStudies: 551,
  graduatesInTime: 3252,
  medianSalary: 1940000,
  phdGraduates: 823,

  // OI
  womenStudents: 1250,
  womenFaculty: 137,
  studentsOtherStates: 5140,
  studentsOtherCountries: 35,
  escsStudents: 975,
  pcsFacilities: true,

  // PR
  perceptionScore: 100,
};

async function main() {
  console.log("========================================================");
  console.log("  IIT MADRAS - NIRF 2025 ENGINEERING RANKING");
  console.log("  Institute ID: IR-E-U-0456");
  console.log("========================================================\n");

  const result = computeScore(iitMadras, { category: "engineering", year: 2025 });

  console.log("PARAMETER BREAKDOWN:");
  console.log("────────────────────\n");

  for (const param of result.parameters) {
    console.log(`  ${param.parameter} (Weight: ${(param.weight * 100).toFixed(0)}%)`);
    for (const sub of param.subs) {
      const raw = sub.rawValue !== null && sub.rawValue !== undefined
        ? (typeof sub.rawValue === "number" ? sub.rawValue.toFixed(2) : sub.rawValue)
        : "N/A";
      const score = sub.score !== null ? sub.score.toFixed(2) : "N/A";
      console.log(`    ${sub.label.padEnd(40)} raw=${raw.padStart(10)}  score=${score.padStart(6)}`);
    }
    const uw = param.unweightedScore !== null ? param.unweightedScore.toFixed(2) : "N/A";
    const w = param.weightedScore.toFixed(2);
    const pen = param.penalty ? ` (penalty: -${param.penalty.toFixed(2)})` : "";
    console.log(`    → Unweighted: ${uw}   Weighted: ${w}${pen}\n`);
  }

  console.log(`  ${"═".repeat(58)}`);
  console.log(`  FINAL NIRF SCORE: ${result.finalScore?.toFixed(2) ?? "N/A"}`);
  console.log(`  ${"═".repeat(58)}\n`);

  console.log("ML MODEL RANK PREDICTION:");
  console.log("────────────────────────\n");
  const prediction = await predictFromMetrics(iitMadras, "engineering");
  console.log(`  Predicted Rank:    ${prediction.predictedRank}`);
  console.log(`  NIRF Score:        ${(prediction.composite * 100).toFixed(2)}`);
  console.log(`  Confidence:        ${prediction.confidence}`);
  console.log(`  Model:             ${prediction.model.n} instances, Spearman R=${prediction.model.spearmanR.toFixed(3)}`);
}

main().catch(console.error);