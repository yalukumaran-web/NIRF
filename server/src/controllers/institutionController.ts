import { Request, Response } from "express";
import { query } from "../db/db";

export async function listInstitutions(_req: Request, res: Response) {
  const rows = await query(
    `SELECT i.id, i.name, i.category,
            s.year, s.final_score, s.has_insufficient
     FROM institutions i
     LEFT JOIN scores s ON s.id = (
       SELECT id FROM scores s2
       WHERE s2.institution_id = i.id
       ORDER BY s2.year DESC LIMIT 1
     )
     ORDER BY i.name`
  );
  return res.json({ institutions: rows });
}

export async function institutionDetail(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid institution id" });

  const instRows = await query(
    `SELECT id, name, category FROM institutions WHERE id = $1`,
    [id]
  );
  if (instRows.length === 0) return res.status(404).json({ error: "Institution not found" });

  const scores = await query(
    `SELECT s.*, count(sb.id) AS breakdown_count
     FROM scores s
     LEFT JOIN score_breakdown sb ON sb.score_id = s.id
     WHERE s.institution_id = $1
     GROUP BY s.id
     ORDER BY s.year DESC`,
    [id]
  );

  return res.json({ institution: instRows[0], scores });
}

/** Public Top-ranking listing fed by the official ground truth table. */
export async function officialRanking(req: Request, res: Response) {
  const category = String(req.query.category || "engineering");
  const year = Number(req.query.year || 2025);
  const rows = await query(
    `SELECT rank, institute_id, institute_name, score, tlr, rpc, go, oi, pr
     FROM official_scores
     WHERE category = $1 AND year = $2
     ORDER BY rank`,
    [category, year]
  );
  return res.json({
    category,
    year,
    total: rows.length,
    scores: rows,
  });
}