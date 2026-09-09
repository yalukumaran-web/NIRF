import { computeScore } from "../services/nirf/engine";
import type { RawMetrics } from "../types/metrics";

const iit: RawMetrics = {
  year: 2025,
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
  totalPublications: 12436,
  totalCitations: 33808,
  top25Citations: 7414,
  patentsFiled: 479,
  patentsGranted: 142,
  sponsoredResearchAmount: 9563110074,
  consultancyRevenue: 3949276519,
  retractedPapers: 2,
  retractedCitations: 8,
  graduatesPlaced: 2556,
  graduatesHigherStudies: 551,
  graduatesInTime: 3252,
  medianSalary: 1940000,
  phdGraduates: 823,
  womenStudents: 1250,
  womenFaculty: 137,
  studentsOtherStates: 5140,
  studentsOtherCountries: 35,
  escsStudents: 975,
  pcsFacilities: true,
  perceptionScore: 100,
};

// Official NIRF 2025 IIT Madras Engineering scores
const official = { TLR: 95.7, RPC: 90.74, GO: 82.29, OI: 63.25, PR: 100 };

const r = computeScore(iit, { category: "engineering", year: 2025 });
console.log("STRUCTURE:", JSON.stringify(r, null, 1).slice(0, 1500));
console.log("OFFICIAL vs ENGINE (parameter unweighted score):");
for (const p of r.parameters) {
  const off = official[p.parameter as keyof typeof official];
  const mine = p.unweightedScore ?? 0;
  const ok = off === undefined ? "??" : off.toFixed(2);
  console.log(`${p.parameter}: official=${ok}  engine=${mine.toFixed(2)}`);
}

console.log("\nCURRENT SUB-SCORES (marks):");
for (const p of r.parameters) {
  console.log(`\n${p.parameter}:`);
  for (const s of p.subs) {
    console.log(`  ${s.key}: ${(s.score ?? 0).toFixed(2)}/${s.label}`);
  }
}
