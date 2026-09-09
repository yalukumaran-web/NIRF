/**
 * seedInstitutions.ts
 *
 * Seeds the 90 official NIRF 2025 engineering top-90 institutions into the
 * live `institutions` / `scores` tables so the Dashboard, Compare and
 * institution listings show real institutions instead of only the demo row.
 *
 * - Uses the published parameter scores (TLR/RPC/GO/OI/PR) and the published
 *   final score; `has_insufficient = FALSE` so the engine treats these as
 *   complete ground-truth rows (Phase 1 §2 ground truth, NOT engine outputs).
 * - Idempotent: matches existing institutions by name and upserts the 2025
 *   score via the UNIQUE (institution_id, year) constraint.
 */
import "dotenv/config";
import { Pool } from "pg";
import { OFFICIAL_ENGINEERING_2025 } from "../data/officialEngineering2025";

const pool = new Pool();

async function seedInstitutions() {
  // Use a dedicated system user so that the admin's getInstitution() (which does
  // WHERE user_id = $1 LIMIT 1) doesn't accidentally return official institutions.
  const sysUser = await pool.query(
    `SELECT id FROM users WHERE email = 'system-official@nirf.idrnd.dev'`
  );
  const userId: number =
    sysUser.rows.length > 0
      ? sysUser.rows[0].id
      : (
          await pool.query(
            `INSERT INTO users (email, password_hash, institution_name, role)
             VALUES ('system-official@nirf.idrnd.dev', '!disabled', 'NIRF System (Official Reference)', 'institution')
             RETURNING id`
          )
        ).rows[0].id;

  let inserted = 0;
  let matched = 0;
  let scoreRows = 0;

  for (const r of OFFICIAL_ENGINEERING_2025) {
    const existingInst = await pool.query(`SELECT id FROM institutions WHERE name = $1`, [r.instituteName]);
    let institutionId: number;
    if (existingInst.rows.length > 0) {
      institutionId = existingInst.rows[0].id;
      matched++;
    } else {
      const created = await pool.query(
        `INSERT INTO institutions (user_id, name, category)
         VALUES ($1, $2, 'engineering') RETURNING id`,
        [userId, r.instituteName]
      );
      institutionId = created.rows[0].id;
      inserted++;
    }

    await pool.query(
      `INSERT INTO scores (institution_id, year, category, tlr, rp, go, oi, pr, rp_penalty, final_score, has_insufficient)
       VALUES ($1, 2025, 'engineering', $2, $3, $4, $5, $6, 0, $7, FALSE)
       ON CONFLICT (institution_id, year) DO UPDATE SET
         category = 'engineering',
         tlr = EXCLUDED.tlr,
         rp = EXCLUDED.rp,
         go = EXCLUDED.go,
         oi = EXCLUDED.oi,
         pr = EXCLUDED.pr,
         rp_penalty = 0,
         final_score = EXCLUDED.final_score,
         has_insufficient = FALSE`,
      [institutionId, r.tlr, r.rpc, r.go, r.oi, r.pr, r.score]
    );
    scoreRows++;
  }

  console.log(`institutions: ${inserted} inserted, ${matched} already present (total ${OFFICIAL_ENGINEERING_2025.length})`);
  console.log(`scores upserted (2025 engineering): ${scoreRows}`);
  await pool.end();
}

seedInstitutions().catch((e) => {
  console.error("seed-institutions failed", e);
  process.exit(1);
});