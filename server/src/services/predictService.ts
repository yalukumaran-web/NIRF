import { query } from "../db/db";
import { computeScore } from "./nirf/engine";
import type { ModelConfig, SubScoreFeatures } from "./rankModel";
import type { RawMetrics } from "../types/metrics";

interface StoredModelRow {
  config_json: string | object;
  metrics: string | object | null;
  n_instances: number | null;
}

/**
 * Load a score→rank calibrated model for a category.
 *
 * The newest stored model may be a score-regression artifact (e.g. random
 * forest trained on raw metrics) which has no rank calibration. For the rank
 * prediction feature we prefer the newest model that exposes
 * `rankIntercept`/`rankSlope`, falling back to that model's own metrics.
 */
export async function loadModel(category = "engineering"): Promise<ModelConfig | null> {
  const rows = await query<StoredModelRow>(
    `SELECT config_json, metrics, n_instances FROM rank_model
     WHERE category = $1 ORDER BY id DESC LIMIT 10`,
    [category]
  );
  if (!rows.length) return null;
  const parse = (v: string | object | null): any => (typeof v === "string" ? JSON.parse(v) : v);
  const calibrated = rows.find((r) => {
    const cfg = parse(r.config_json);
    return cfg && typeof cfg.rankIntercept === "number" && typeof cfg.rankSlope === "number";
  });
  const row = calibrated ?? rows[0];
  const cfg = parse(row.config_json) ?? {};
  const metrics = parse(row.metrics) ?? {};
  const cv = metrics.crossValidation ?? {};
  const pooled = cv.pooled ?? {};
  return {
    category,
    featureOrder: cfg.featureOrder ?? [],
    percentileBands: cfg.percentileBands ?? {},
    featureWeights: cfg.featureWeights ?? {},
    rankIntercept:
      typeof cfg.rankIntercept === "number" ? cfg.rankIntercept : NaN,
    rankSlope: typeof cfg.rankSlope === "number" ? cfg.rankSlope : NaN,
    n: typeof cfg.n === "number" ? cfg.n : row.n_instances ?? pooled.n ?? 0,
    spearmanR:
      typeof cfg.spearmanR === "number"
        ? cfg.spearmanR
        : typeof metrics.cvSpearman === "number"
          ? metrics.cvSpearman
          : typeof pooled.r2 === "number"
            ? pooled.r2
            : 0,
  };
}

/**
 * Map an engine final NIRF score to a rank.
 * Uses the calibrated linear model when available; otherwise ranks the score
 * against the official reference distribution (official_scores).
 */
export async function scoreToRank(
  category: string,
  nirfScore: number,
  cfg: ModelConfig
): Promise<number> {
  if (Number.isFinite(cfg.rankIntercept) && Number.isFinite(cfg.rankSlope)) {
    return Math.max(1, Math.round(cfg.rankIntercept + cfg.rankSlope * nirfScore));
  }
  const year = new Date().getFullYear();
  const refs = await query<{ score: number }>(
    `SELECT score FROM official_scores WHERE category = $1 AND year = $2 ORDER BY score DESC`,
    [category, year]
  );
  const distribution = refs.map((r) => Number(r.score));
  if (!distribution.length) {
    const newest = await query<{ max_year: number }>(
      `SELECT MAX(year) AS max_year FROM official_scores WHERE category = $1`,
      [category]
    );
    const y = newest[0]?.max_year ?? 2025;
    const refs2 = await query<{ score: number }>(
      `SELECT score FROM official_scores WHERE category = $1 AND year = $2 ORDER BY score DESC`,
      [category, y]
    );
    distribution.push(...refs2.map((r) => Number(r.score)));
  }
  if (!distribution.length) return 0;
  const ahead = distribution.filter((s) => s > nirfScore).length;
  return ahead + 1;
}

export interface PredictionResult {
  predictedRank: number;
  composite: number;
  features: Record<string, number>;
  percentileScores: Record<string, number>;
  confidence: number;
  model: { n: number; spearmanR: number };
  insufficient: string[];
}

/**
 * Predict rank for given NIRF metrics using the trained model.
 * Computes the NIRF score via the engine, then maps score → rank via
 * the linear model (rank = intercept + slope * nirfScore).
 */
export async function predictFromMetrics(
  metrics: RawMetrics,
  category = "engineering"
): Promise<PredictionResult> {
  const cfg = await loadModel(category);
  if (!cfg) {
    throw new Error(
      "No trained model available. Train the model first against ranking data."
    );
  }

  const effectiveMetrics: RawMetrics = {
    ...metrics,
    year: metrics.year || new Date().getFullYear(),
    perceptionScore: metrics.perceptionScore !== undefined && metrics.perceptionScore !== null
      ? metrics.perceptionScore
      : 15.0,
  };

  const scoreResult = computeScore(effectiveMetrics as any, {
    category: category as any,
    year: effectiveMetrics.year,
  });

  const finalScore = scoreResult.finalScore ?? scoreResult.finalWeighted;
  if (finalScore === null || finalScore <= 0) {
    return {
      predictedRank: 0,
      composite: 0,
      features: {},
      percentileScores: {},
      confidence: 0,
      model: { n: cfg.n, spearmanR: cfg.spearmanR },
      insufficient: scoreResult.insufficientParams,
    };
  }

  const nirfScore = finalScore;
  const rank = await scoreToRank(category, nirfScore, cfg);
  if (rank <= 0) {
    return {
      predictedRank: 0,
      composite: 0,
      features: {},
      percentileScores: {},
      confidence: 0,
      model: { n: cfg.n, spearmanR: cfg.spearmanR },
      insufficient: scoreResult.insufficientParams,
    };
  }

  const percentileScores: Record<string, number> = {
    nirf: Number((nirfScore / 100).toFixed(3)),
  };
  for (const p of scoreResult.parameters) {
    percentileScores[p.parameter] = Number((p.weightedScore / (p.weight * 100)).toFixed(3));
  }

  const spearman = cfg.spearmanR || 0;
  const confidence = Math.max(0.70, Math.min(0.98, spearman));

  return {
    predictedRank: rank,
    composite: Number((nirfScore / 100).toFixed(4)),
    features: { nirf: nirfScore },
    percentileScores,
    confidence: Number(confidence.toFixed(3)),
    model: { n: cfg.n, spearmanR: spearman },
    insufficient: scoreResult.insufficientParams,
  };
}

export async function savePrediction(
  institutionId: number,
  input: {
    year?: number;
    sourceFile?: string;
    extracted: any;
    predictedRank: number;
    composite: number;
    confidence: number;
    modelCategory: string;
    parameterBreakdown?: any;
  }
) {
  const res = await query(
    `INSERT INTO predictions(
       institution_id, year, source_file, extracted_json, predicted_rank,
       composite, confidence, model_category, parameter_breakdown
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      institutionId,
      input.year || null,
      input.sourceFile || null,
      JSON.stringify(input.extracted),
      input.predictedRank,
      input.composite,
      input.confidence,
      input.modelCategory,
      JSON.stringify(input.parameterBreakdown || {}),
    ]
  );
  return res;
}
