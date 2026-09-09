import { pool } from "../db/db";
import type { RawMetricsInput } from "./validation";
import type { ScoreResult } from "./nirf/types";
import { computeScore } from "./nirf/engine";
import type { NIRFCategory } from "../types/metrics";

const COLUMN_MAP: Record<string, string> = {
  sanctionedIntake: "sanctioned_intake",
  enrolledStudents: "enrolled_students",
  phdStudents: "phd_students",
  permanentFaculty: "permanent_faculty",
  facultyWithPhD: "faculty_with_phd",
  facultyExp0to8: "faculty_exp_0to8",
  facultyExp8to15: "faculty_exp_8to15",
  facultyExp15plus: "faculty_exp_15plus",
  capitalExpenditure: "capital_expenditure",
  operationalExpenditure: "operational_expenditure",
  totalPublications: "total_publications",
  totalCitations: "total_citations",
  top25Citations: "top25_citations",
  patentsFiled: "patents_filed",
  patentsGranted: "patents_granted",
  sponsoredResearchAmount: "sponsored_research_amount",
  consultancyRevenue: "consultancy_revenue",
  retractedPapers: "retracted_papers",
  retractedCitations: "retracted_citations",
  graduatesPlaced: "graduates_placed",
  graduatesHigherStudies: "graduates_higher_studies",
  graduatesInTime: "graduates_in_time",
  medianSalary: "median_salary",
  phdGraduates: "phd_graduates",
  womenStudents: "women_students",
  womenFaculty: "women_faculty",
  studentsOtherStates: "students_other_states",
  studentsOtherCountries: "students_other_countries",
  escsStudents: "escs_students",
  pcsFacilities: "pcs_facilities",
};

export async function upsertRawMetrics(
  institutionId: number,
  input: RawMetricsInput
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const keys = Object.keys(COLUMN_MAP);
    const sets: string[] = [];
    const params: any[] = [institutionId, input.year];
    let i = 3;
    for (const key of keys) {
      const col = COLUMN_MAP[key];
      const val = (input as any)[key] ?? null;
      sets.push(`${col} = COALESCE($${i}, raw_metrics.${col})`);
      params.push(val == null ? null : (typeof val === "boolean" ? val : Number(val)));
      i++;
    }

    const sql = `
      INSERT INTO raw_metrics (institution_id, year, confirmed, ${keys
        .map((k) => COLUMN_MAP[k])
        .join(", ")})
      VALUES ($1, $2, TRUE, ${keys.map((_, idx) => `$${idx + 3}`).join(", ")})
      ON CONFLICT (institution_id, year) DO UPDATE SET
        ${sets.join(", ")}, confirmed = TRUE
    `;
    await client.query(sql, params);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function computeAndSave(
  institutionId: number,
  input: RawMetricsInput,
  category: NIRFCategory
): Promise<ScoreResult> {
  const metrics: RawMetricsInput = { ...input };
  const score = computeScore(metrics as any, { category, year: input.year });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const p = (key: string) => {
      const found = score.parameters.find((x) => x.parameter === key);
      return found ? found.weightedScore : null;
    };

    const body = await client.query(
      `INSERT INTO scores (institution_id, year, category, tlr, rp, go, oi, pr, rp_penalty, final_score, has_insufficient)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (institution_id, year) DO UPDATE SET
         category=EXCLUDED.category, tlr=EXCLUDED.tlr, rp=EXCLUDED.rp,
         go=EXCLUDED.go, oi=EXCLUDED.oi, pr=EXCLUDED.pr,
         rp_penalty=EXCLUDED.rp_penalty, final_score=EXCLUDED.final_score,
         has_insufficient=EXCLUDED.has_insufficient
       RETURNING id`,
      [
        institutionId,
        input.year,
        category,
        p("TLR"),
        p("RP"),
        p("GO"),
        p("OI"),
        p("PR"),
        score.parameters.find((x) => x.parameter === "RP")?.penalty || 0,
        score.finalScore,
        score.hasInsufficientData,
      ]
    );
    const scoreId = body.rows[0].id;

    await client.query(`DELETE FROM score_breakdown WHERE score_id = $1`, [scoreId]);
    for (const par of score.parameters) {
      for (const sub of par.subs) {
        await client.query(
          `INSERT INTO score_breakdown (score_id, parameter, sub_key, label, raw_value, normalized, status, missing_fields)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            scoreId,
            par.parameter,
            sub.key,
            sub.label,
            sub.rawValue ?? null,
            sub.score,
            sub.status,
            sub.missingFields,
          ]
        );
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return score;
}

export async function getScores(
  institutionId: number
): Promise<any[]> {
  const rows = await pool.query(
    `SELECT s.*, count(sb.id) AS breakdown_count
     FROM scores s
     LEFT JOIN score_breakdown sb ON sb.score_id = s.id
     WHERE s.institution_id = $1
     GROUP BY s.id
     ORDER BY s.year DESC`,
    [institutionId]
  );
  return rows.rows;
}

export async function getBreakdown(scoreId: number): Promise<any[]> {
  const rows = await pool.query(
    `SELECT parameter, sub_key, label, raw_value, normalized, status, missing_fields
     FROM score_breakdown WHERE score_id = $1 ORDER BY parameter, id`,
    [scoreId]
  );
  return rows.rows;
}
