import { pool } from "../db/db";
import type { ScoreResult } from "./nirf/types";
import type { ValidationReport } from "./validationService";
import type { NIRFCategory } from "../types/metrics";

export interface CalcRunInput {
  userId: number;
  institutionId: number;
  uploadedDocId: number | null;
  category: NIRFCategory;
  year: number;
  kind: "engine" | "ml_prediction";
  metricsSource: "extracted" | "manual" | "official";
  methodologyVersion?: string | null;
  algo?: string | null;
  metrics: Record<string, unknown>;
  validation: ValidationReport | null;
  result: ScoreResult;
}

export async function recordCalcRun(input: CalcRunInput): Promise<number> {
  const paramsWithScores = input.result.parameters.map((p) => ({
    code: p.parameter,
    label: p.label,
    weight: p.weight,
    weightedScore: p.weightedScore,
    unweightedScore: p.unweightedScore,
    penalty: p.penalty,
    subs: p.subs.map((s) => ({
      key: s.key,
      label: s.label,
      raw: s.rawValue,
      normalized: s.normalized ?? s.score,
      score: s.score,
      status: s.status,
      missing: s.missingFields,
      officiality: (s as any).officiality ?? null,
      formulaRef: (s as any).formulaRef ?? null,
      normalizationNote: (s as any).normalizationNote ?? null,
    })),
  }));

  const {
    institutionId,
    uploadedDocId,
    category,
    year,
    kind,
    metricsSource,
    methodologyVersion,
    algo,
  } = input;

  const row = await pool.query(
    `INSERT INTO calc_runs
       (user_id, institution_id, uploaded_doc_id, category, year, kind, metrics_source,
        methodology_version, algorithm, metrics_json, validation_json, final_score,
        parameters_json, breakdown_json, insufficient, confidence, predicted_rank)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      input.userId,
      institutionId,
      uploadedDocId,
      category,
      year,
      kind,
      metricsSource,
      methodologyVersion ?? null,
      algo ?? null,
      JSON.stringify(input.metrics),
      input.validation ? JSON.stringify(input.validation) : null,
      input.result.finalScore,
      JSON.stringify(paramsWithScores),
      JSON.stringify(input.result.parameters.map((p) => ({ parameter: p.parameter, label: p.label, weightedScore: p.weightedScore, unweightedScore: p.unweightedScore, subs: p.subs.map((s) => ({ key: s.key, score: s.score, status: s.status })) }))),
      JSON.stringify(input.result.insufficientParams ?? []),
      null,
      null,
    ]
  );
  return row.rows[0].id as number;
}

export async function listCalcRuns(
  userId: number,
  role: string
): Promise<any[]> {
  const isAdmin = role === "admin";
  const rows = await pool.query(
    `SELECT c.id, c.institution_id, i.name AS institution_name, c.category, c.year,
            c.kind, c.metrics_source, c.methodology_version, c.model_version, c.algorithm,
            c.final_score, c.weighted_score, c.confidence, c.predicted_rank, c.created_at
     FROM calc_runs c
     LEFT JOIN institutions i ON i.id = c.institution_id
     WHERE $1 = 'admin' OR c.institution_id = (SELECT id FROM institutions WHERE user_id = $2)
     ORDER BY c.created_at DESC`,
    [role, userId]
  );
  return rows.rows;
}

export async function getCalcRun(id: number, role: string, userId: number): Promise<any | null> {
  const rows = await pool.query(
    `SELECT c.*, i.name AS institution_name
     FROM calc_runs c
     LEFT JOIN institutions i ON i.id = c.institution_id
     WHERE c.id = $1 AND ($2 = 'admin' OR c.institution_id = (SELECT id FROM institutions WHERE user_id = $3))`,
    [id, role, userId]
  );
  return rows.rows[0] || null;
}