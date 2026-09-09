/**
 * Phase 7 — seed official NIRF 2025 Engineering ground truth into
 * official_scores, and (re)build the immutable ML dataset version
 * "official-eng-2025-v1" in dataset_versions.
 *
 * The dataset version records, per institution, the five published parameter
 * scores as features and the published final score as the regression target.
 *
 * Run:  npm run seed-official   (registered in package.json)
 */

import { pool } from "../db/db";
import { OFFICIAL_ENGINEERING_2025 } from "../data/officialEngineering2025";

const CATEGORY = "engineering";
const YEAR = 2025;
const VERSION_TAG = "official-eng-2025-v1";
const FEATURE_KEYS = ["tlr", "rpc", "go", "oi", "pr"];
const TARGET = "score";
const SOURCE = "official_nirf_2025_engineering_ranking";

async function seedOfficialScores(): Promise<number> {
  let count = 0;
  for (const r of OFFICIAL_ENGINEERING_2025) {
    await pool.query(
      `INSERT INTO official_scores (category, year, rank, institute_id, institute_name, score, tlr, rpc, go, oi, pr, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (category, year, rank, institute_id)
       DO UPDATE SET
         institute_name = EXCLUDED.institute_name,
         score = EXCLUDED.score,
         tlr = EXCLUDED.tlr,
         rpc = EXCLUDED.rpc,
         go = EXCLUDED.go,
         oi = EXCLUDED.oi,
         pr = EXCLUDED.pr,
         source = EXCLUDED.source`,
      [
        CATEGORY,
        YEAR,
        r.rank,
        r.instituteId,
        r.instituteName,
        r.score,
        r.tlr,
        r.rpc,
        r.go,
        r.oi,
        r.pr,
        SOURCE,
      ]
    );
    count++;
  }
  return count;
}

async function seedDatasetVersion(): Promise<number> {
  const rows = OFFICIAL_ENGINEERING_2025.map((r) => ({
    id: r.instituteId,
    features: [r.tlr, r.rpc, r.go, r.oi, r.pr],
    target: r.score,
  }));

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
      "Official NIRF 2025 Engineering ranking: published parameter scores (TLR/RPC/GO/OI/PR) as features, published final score as target. Features retain the published values; the f() normalization is already reflected in them.",
      SOURCE,
      rows.length,
      JSON.stringify(FEATURE_KEYS),
      JSON.stringify(rows),
    ]
  );
  return rows.length;
}

async function main() {
  const scores = await seedOfficialScores();
  const rows = await seedDatasetVersion();
  console.log(`official_scores: ${scores} rows upserted (${OFFICIAL_ENGINEERING_2025.length} official records)`);
  console.log(`dataset_versions: ${VERSION_TAG} with ${rows} rows (features=${JSON.stringify(FEATURE_KEYS)}, target=${TARGET})`);
  await pool.end();
}

main().catch((e) => {
  console.error("seeding failed", e);
  process.exit(1);
});