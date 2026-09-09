/**
 * Phase 1 — build the RAW-DATA ML dataset from the 90-college laboratory set.
 *
 * Inputs:
 *   - server/nirf_dataset.json          : raw submitted/extracted metric snapshot
 *                                         per institution (from NIRF PDFs)
 *   - src/data/officialEngineering2025.ts : official published results (targets)
 *
 * Outputs:
 *   - dataset_versions row "raw-eng-2025-v1" (UPSERT):
 *         features  = engineered raw features (NO official parameter scores)
 *         target    = official published final NIRF score
 *   - a printed Training Data Audit (Phase 1 §19).
 *
 * LEAKAGE CONTROL: this dataset never contains official TLR/RPC/GO/OI/PR or the
 * official rank/score as a feature. Official values are used ONLY as targets.
 *
 * Feature engineering (§10/§11) — every derived feature is grounded in engine
 * sub-metrics the raw field feeds (see services/nirf/engine.ts):
 *   permanentFaculty              → TLR FSR/FQE
 *   phdStudents                   → TLR SS/FSR
 *   phdGraduates                  → GO GPHD
 *   facultyPhdShare  (NP/F)       → derived, PhD-intensity proxy (SS/FQE/RP)
 *   phdGraduatesPerFaculty        → derived, GPHD per faculty
 *   researchIncomePerFaculty      → derived, (RF+CF)/F → RP FPPP budget
 *   totalExpenditure (BC+BO)      → derived, TLR FRU
 *   spendPerFaculty               → derived, FRU intensity
 *   graduatesTotal    (Np+Nhs)    → derived, GO GPH numerator
 *   placementRatio    (Np/(Np+Nhs)) → derived, GPH outcome quality
 *   medianSalary                  → GO GMS
 *   womenStudents                 → OI WD
 *   otherStateCountryStudents     → derived, OI RD numerator
 *   escsStudents                  → OI ESCS
 *   pcsFacilities                 → OI PCS (0/1)
 *
 * Run:  npm run seed-raw-dataset
 */

import { pool } from "../db/db";
import { OFFICIAL_ENGINEERING_2025 } from "../data/officialEngineering2025";
import type { OfficialEngineeringScore } from "../data/officialEngineering2025";
import snapshotRows from "../../nirf_dataset.json";

const CATEGORY = "engineering";
const YEAR = 2025;
const VERSION_TAG = "raw-eng-2025-v1";
const TARGET = "score";
const SOURCE = "official_nirf_2025_engineering_ranking";

const FEATURE_KEYS = [
  "permanentFaculty",
  "phdStudents",
  "phdGraduates",
  "facultyPhdShare",
  "phdGraduatesPerFaculty",
  "researchIncomePerFaculty",
  "totalExpenditure",
  "spendPerFaculty",
  "graduatesTotal",
  "placementRatio",
  "medianSalary",
  "womenStudents",
  "otherStateCountryStudents",
  "escsStudents",
  "pcsFacilities",
] as const;

type SnapshotRow = {
  file: string;
  instituteName: string;
  instituteId: string;
  permanentFaculty: number;
  phdStudents: number;
  phdGraduates: number;
  capitalExpenditure: number;
  operationalExpenditure: number;
  sponsoredResearchAmount: number;
  consultancyRevenue: number;
  graduatesPlaced?: number;
  graduatesHigherStudies?: number;
  medianSalary?: number;
  womenStudents: number;
  studentsOtherStates: number;
  studentsOtherCountries: number;
  escsStudents: number;
  pcsFacilities: number | boolean;
};

/** Raw inputs that must be present; rows missing any are EXCLUDED, not imputed. */
const REQUIRED_RAW_FIELDS: (keyof SnapshotRow)[] = [
  "permanentFaculty",
  "phdStudents",
  "phdGraduates",
  "capitalExpenditure",
  "operationalExpenditure",
  "sponsoredResearchAmount",
  "consultancyRevenue",
  "graduatesPlaced",
  "graduatesHigherStudies",
  "medianSalary",
  "womenStudents",
  "studentsOtherStates",
  "studentsOtherCountries",
  "escsStudents",
  "pcsFacilities",
];

function missingRawFields(row: SnapshotRow): string[] {
  return REQUIRED_RAW_FIELDS.filter((k) => row[k] === undefined || row[k] === null);
}

function safeDiv(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

/** §10/§11 feature engineering — derived values are methodology-grounded ratios. */
function engineerFeatures(row: SnapshotRow): number[] {
  const F = Math.max(1, row.permanentFaculty || 0);
  const pg = row.graduatesPlaced ?? 0;
  const hs = row.graduatesHigherStudies ?? 0;
  const grads = pg + hs;
  const researchIncome = (row.sponsoredResearchAmount || 0) + (row.consultancyRevenue || 0);
  const totalExpenditure = (row.capitalExpenditure || 0) + (row.operationalExpenditure || 0);
  const otherStateCountry = (row.studentsOtherStates || 0) + (row.studentsOtherCountries || 0);

  return [
    row.permanentFaculty || 0,
    row.phdStudents || 0,
    row.phdGraduates || 0,
    safeDiv(row.phdStudents || 0, F),                                  // facultyPhdShare
    safeDiv(row.phdGraduates || 0, F),                                 // phdGraduatesPerFaculty
    safeDiv(researchIncome, F),                                        // researchIncomePerFaculty
    totalExpenditure,                                                  // totalExpenditure
    safeDiv(totalExpenditure, F),                                      // spendPerFaculty
    grads,                                                             // graduatesTotal
    safeDiv(pg, grads),                                                // placementRatio
    row.medianSalary ?? 0,                                             // medianSalary
    row.womenStudents || 0,                                            // womenStudents
    otherStateCountry,                                                 // otherStateCountryStudents
    row.escsStudents || 0,                                             // escsStudents
    row.pcsFacilities ? 1 : 0,                                         // pcsFacilities
  ];
}

function round(x: number, d = 2): number {
  const k = Math.pow(10, d);
  return Math.round(x * k) / k;
}

/**
 * §19 — Training data audit. Prints counts for institutions, features, missing
 * values per feature, complete records, target availability, duplicates and
 * invalid records, and records rows excluded because of missing raw inputs.
 * Returns the cleaned rows ready for training.
 */
function auditAndClean(
  rows: { id: string; features: number[]; target: number }[],
  excluded: { id: string; name: string; reason: string }[]
): { id: string; features: number[]; target: number }[] {
  console.log("=".repeat(64));
  console.log("TRAINING DATA AUDIT  (Phase 1 §19)");
  console.log("=".repeat(64));
  console.log(`Historical Institutions:             ${OFFICIAL_ENGINEERING_2025.length}`);
  console.log(`Raw snapshots available:             ${snapshotRows.length}`);
  console.log(`Features:                            ${FEATURE_KEYS.length}`);
  console.log("");

  const featureMissing = FEATURE_KEYS.map((k, i) => {
    const count = rows.filter((r) => !Number.isFinite(r.features[i])).length;
    return { key: k, count };
  });
  console.log("Missing feature values (engineered rows):");
  for (const f of featureMissing) {
    if (f.count > 0) console.log(`  - ${f.key}: ${f.count}`);
  }
  if (featureMissing.every((f) => f.count === 0)) console.log("  - none");

  const complete = rows.filter((r) => r.features.every((v) => Number.isFinite(v)));
  const ids = rows.map((r) => r.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  const noTarget = rows.filter((r) => !Number.isFinite(r.target));
  const invalid = rows.filter((r) => !r.features.every(Number.isFinite));

  console.log("");
  console.log(`Complete records:                     ${complete.length}`);
  console.log(`Target available:                     ${rows.length - noTarget.length}`);
  console.log(`Duplicates (by institute id):         ${dupIds.length}`);
  console.log(`Invalid records (non-finite):         ${invalid.length}`);
  console.log(`Excluded (missing raw inputs):        ${excluded.length}`);
  for (const e of excluded) {
    console.log(`  - ${e.id} (${e.name}): ${e.reason}`);
  }
  console.log("");

  if (dupIds.length > 0) {
    console.warn(`Dropping duplicate rows: ${[...new Set(dupIds)].join(", ")}`);
    return complete.filter((r) => !dupIds.includes(r.id));
  }
  return complete;
}

async function seedRawDataset() {
  const officialById = new Map<string, OfficialEngineeringScore>(
    OFFICIAL_ENGINEERING_2025.map((r) => [r.instituteId, r])
  );

  const matched: { id: string; features: number[]; target: number }[] = [];
  const excluded: { id: string; name: string; reason: string }[] = [];

  for (const row of snapshotRows as unknown as SnapshotRow[]) {
    const official = officialById.get(row.instituteId);
    if (!official) {
      continue; // not part of the official top-90 → no target
    }
    const missing = missingRawFields(row);
    if (missing.length > 0) {
      excluded.push({
        id: row.instituteId,
        name: row.instituteName,
        reason: `missing raw inputs: ${missing.join(", ")}`,
      });
      continue;
    }
    const features = engineerFeatures(row);
    if (features.length !== FEATURE_KEYS.length) {
      throw new Error(`Feature misalignment for ${row.instituteId}: got ${features.length}, expected ${FEATURE_KEYS.length}`);
    }
    matched.push({ id: row.instituteId, features, target: official.score });
  }

  const clean = auditAndClean(matched, excluded);

  const description =
    "Raw submitted/extracted inputs (server/nirf_dataset.json) engineered into " +
    "methodology-grounded features (Phase 1 §10/§11) joined with official 2025 " +
    "engineering final scores as the target. NO official parameter scores or rank " +
    "are used as features (Phase 1 §14). Derived features: facultyPhdShare, " +
    "phdGraduatesPerFaculty, researchIncomePerFaculty, totalExpenditure, " +
    "spendPerFaculty, graduatesTotal, placementRatio, otherStateCountryStudents. " +
    "Rows with missing raw fields are excluded (see audit).";

  await pool.query(
    `INSERT INTO dataset_versions (version_tag, category, year, description, source, row_count, feature_keys, dataset_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (version_tag)
     DO UPDATE SET
       category = EXCLUDED.category,
       year = EXCLUDED.year,
       description = EXCLUDED.description,
       source = EXCLUDED.source,
       row_count = EXCLUDED.row_count,
       feature_keys = EXCLUDED.feature_keys,
       dataset_json = EXCLUDED.dataset_json`,
    [
      VERSION_TAG,
      CATEGORY,
      YEAR,
      description,
      SOURCE,
      clean.length,
      JSON.stringify(FEATURE_KEYS),
      JSON.stringify(
        clean.map((r) => ({ id: r.id, features: r.features.map((v) => round(v, 6)), target: r.target }))
      ),
    ]
  );

  const scoreMin = Math.min(...clean.map((r) => r.target));
  const scoreMax = Math.max(...clean.map((r) => r.target));
  console.log("=".repeat(64));
  console.log(`dataset_versions: ${VERSION_TAG} written`);
  console.log(`  rows           : ${clean.length} of ${OFFICIAL_ENGINEERING_2025.length} (${excluded.length} excluded for missing raw inputs)`);
  console.log(`  features       : ${FEATURE_KEYS.length} (${FEATURE_KEYS.join(", ")})`);
  console.log(`  target         : ${TARGET} (official final score) — range ${scoreMin}–${scoreMax}`);
  console.log(`  leakage        : none — no official parameter score/rank used as a feature`);
  console.log("=".repeat(64));
}

async function main() {
  await seedRawDataset();
  await pool.end();
}

main().catch((e) => {
  console.error("seed-raw-dataset failed", e);
  process.exit(1);
});