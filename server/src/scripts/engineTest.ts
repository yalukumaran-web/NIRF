import { computeScore } from "../services/nirf/engine";

const m = {
  year: 2025,
  ugStudents: 4000,
  pgStudents: 1000,
  phdStudents: 300,
  fullTimeStudents: 5300,
  permanentFaculty: 300,
  facultyWithPhD: 250,
  capitalExpenditure: 100000000,
  operationalExpenditure: 150000000,
  totalPublications: 700,
  top25Publications: 175,
  totalCitations: 12000,
  patentsFiled: 40,
  patentsGranted: 20,
  patentsLicensed: 5,
  sponsoredResearchAmount: 200000000,
  consultancyRevenue: 80000000,
  retractedPapers: 1,
  graduatesPlaced: 1500,
  graduatesHigherStudies: 1200,
  graduatesTotal: 4000,
  graduatesInTime: 3600,
  medianSalary: 900000,
  phdGraduates: 60,
  womenStudents: 2400,
  womenFaculty: 100,
  studentsOtherStates: 1600,
  studentsOtherCountries: 200,
  escsStudents: 1200,
  pcsFacilities: true,
  perceptionScore: 70,
};

const res = computeScore(m as any, { category: "engineering", year: 2025 });

console.log("FINAL SCORE:", res.finalScore?.toFixed(2));
for (const p of res.parameters) {
  const subs = p.subs
    .map((s) => `${s.key}=${s.score?.toFixed(1) ?? "insufficient"}`)
    .join(", ");
  console.log(
    `${p.parameter}: unweighted=${p.unweightedScore?.toFixed(2) ?? "NA"} weighted=${p.weightedScore.toFixed(2)}${p.penalty ? ` penalty=${p.penalty}` : ""} | ${subs}`
  );
}

const missing = { ...m } as any;
delete missing.permanentFaculty;
const res2 = computeScore(missing, { category: "engineering", year: 2025 });
console.log("\n--- with missing faculty ---");
console.log("FINAL SCORE:", res2.finalScore);
for (const p of res2.parameters) {
  console.log(`${p.parameter}: unweighted=${p.unweightedScore}`);
}
console.log("hasInsufficient:", res2.hasInsufficientData, res2.insufficientParams);
