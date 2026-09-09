import { pool } from "../db/db";
import {
  trainModel,
  selectAlgorithmCV,
  type CrossValidationResult,
} from "../ml/trainer";
import type { DatasetRow, TrainOptions } from "../ml/types";
import type { MetricSummary, FeatureImportance, ModelArtifact } from "../ml/types";

export interface DatasetVersionRow {
  id: number;
  version_tag: string;
  category: string;
  year: number;
  description: string | null;
  source: string;
  row_count: number;
  feature_keys: string[] | string;
  dataset_json: unknown;
  created_at: string;
}

export function parseJson<T>(v: unknown): T {
  return typeof v === "string" ? (JSON.parse(v) as T) : (v as T);
}

export async function listDatasets(): Promise<DatasetVersionRow[]> {
  const rows = await pool.query(
    `SELECT id, version_tag, category, year, description, source, row_count, feature_keys, created_at
     FROM dataset_versions ORDER BY created_at DESC`
  );
  return rows.rows as DatasetVersionRow[];
}

export async function getDataset(versionTag: string): Promise<DatasetVersionRow | null> {
  const rows = await pool.query(
    `SELECT * FROM dataset_versions WHERE version_tag = $1`,
    [versionTag]
  );
  return (rows.rows[0] as DatasetVersionRow) || null;
}

export interface ModelSummary {
  id: number;
  category: string;
  algorithm: string | null;
  model_version: string | null;
  dataset_version: string | null;
  feature_keys: string[] | null;
  feature_importance: FeatureImportance[] | null;
  metrics: MetricSummary | null;
  n_instances: number | null;
  trained_at: string;
}

export async function getActiveModel(): Promise<ModelSummary | null> {
  const rows = await pool.query(
    `SELECT id, category, algorithm, model_version, dataset_version, feature_keys,
            feature_importance, metrics, n_instances, trained_at
     FROM rank_model ORDER BY id DESC LIMIT 1`
  );
  const r = rows.rows[0];
  if (!r) return null;
  return {
    id: r.id as number,
    category: r.category as string,
    algorithm: r.algorithm as string | null,
    model_version: r.model_version as string | null,
    dataset_version: r.dataset_version as string | null,
    feature_keys: parseJson<string[]>(r.feature_keys) ?? null,
    feature_importance: parseJson<FeatureImportance[]>(r.feature_importance) ?? null,
    metrics: parseJson<MetricSummary>(r.metrics) ?? null,
    n_instances: r.n_instances as number | null,
    trained_at: r.trained_at as string,
  };
}

export interface TrainDatasetInput {
  datasetVersion: string;
  algorithm?: TrainOptions["algorithm"] | "auto";
  modelVersion?: string;
  seed?: number;
  testFraction?: number;
  params?: Record<string, unknown>;
  targetName?: string;
}

export async function trainFromDataset(
  input: TrainDatasetInput,
  actingEmail: string,
  actingRole: string
): Promise<{
  trainingRunId: number;
  datasetVersion: string;
  modelVersion: string;
  algorithm: TrainOptions["algorithm"];
  metrics: MetricSummary;
  importance: FeatureImportance[];
  trainSize: number;
  testSize: number;
}> {
  const ds = await getDataset(input.datasetVersion);
  if (!ds) throw new Error(`Dataset version "${input.datasetVersion}" not found`);

  const featureKeys = parseJson<string[]>(ds.feature_keys);
  const rows = parseJson<DatasetRow[]>(ds.dataset_json);

  const modelVersion = input.modelVersion ?? "1.0.0";
  const opts: TrainOptions = {
    algorithm: "linear",
    featureKeys,
    targetName: input.targetName ?? "score",
    modelVersion,
    datasetVersion: ds.version_tag,
    seed: input.seed ?? 42,
    testFraction: input.testFraction ?? 0.2,
    params: input.params ?? {},
  };

  const algo = input.algorithm === "auto" || !input.algorithm ? "auto" : input.algorithm;

  let trained;
  let cv: CrossValidationResult | null = null;
  if (algo === "auto") {
    const sel = selectAlgorithmCV(rows, opts, 5);
    cv = sel.cv;
    trained = trainModel(rows, { ...opts, algorithm: sel.algorithm });
    opts.algorithm = sel.algorithm;
  } else {
    trained = trainModel(rows, { ...opts, algorithm: algo });
  }

  const metricsJson = cv
    ? {
        ...trained.metrics,
        crossValidation: {
          folds: cv.folds,
          mae: cv.mae,
          rmse: cv.rmse,
          r2: cv.r2,
          pooled: cv.pooled,
        },
      }
    : trained.metrics;

  const run = await pool.query(
    `INSERT INTO training_runs
       (dataset_version_id, dataset_version, model_version, algorithm, feature_keys,
        params, train_size, test_size, seed, metrics, feature_importance, artifact_json, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'completed')
     RETURNING id`,
    [
      ds.id,
      trained.datasetVersion,
      modelVersion,
      trained.artifact.algo,
      JSON.stringify(trained.artifact.featureKeys),
      JSON.stringify(trained.artifact.params),
      trained.split.trainIdx.length,
      trained.split.testIdx.length,
      opts.seed ?? null,
      JSON.stringify(metricsJson),
      JSON.stringify(trained.importance),
      JSON.stringify(trained.artifact),
    ]
  );
  const trainingRunId = run.rows[0].id as number;

  await pool.query(
    `INSERT INTO rank_model
       (category, config_json, trained_at, n_instances, metrics, algorithm, model_version,
        dataset_version, feature_keys, feature_importance)
     VALUES ($1,$2, now(), $3, $4, $5, $6, $7, $8, $9)`,
    [
      ds.category,
      JSON.stringify(trained.artifact),
      trained.split.trainIdx.length + trained.split.testIdx.length,
      JSON.stringify(metricsJson),
      trained.artifact.algo,
      modelVersion,
      ds.version_tag,
      JSON.stringify(trained.artifact.featureKeys),
      JSON.stringify(trained.importance),
    ]
  );

  await pool.query(
    `INSERT INTO audit_log (email, role, action, entity_type, entity_id, details)
     VALUES ($1,$2,'ml.train','training_runs',$3,$4)`,
    [
      actingEmail,
      actingRole,
      String(trainingRunId),
      JSON.stringify({
        datasetVersion: ds.version_tag,
        modelVersion,
        algorithm: trained.artifact.algo,
        mae: trained.metrics.mae,
        rmse: trained.metrics.rmse,
        r2: trained.metrics.r2,
      }),
    ]
  );

  return {
    trainingRunId,
    datasetVersion: trained.datasetVersion,
    modelVersion,
    algorithm: trained.artifact.algo,
    metrics: trained.metrics,
    importance: trained.importance,
    trainSize: trained.split.trainIdx.length,
    testSize: trained.split.testIdx.length,
  };
}

export async function listTrainingRuns(): Promise<any[]> {
  const rows = await pool.query(
    `SELECT id, dataset_version, model_version, algorithm, feature_keys, params,
            train_size, test_size, seed, metrics, feature_importance, status, created_at
     FROM training_runs ORDER BY created_at DESC`
  );
  return rows.rows;
}

/** Rehydrate the artifact JSON of the active model for prediction calls. */
export async function getActiveModelArtifact(): Promise<ModelArtifact | null> {
  const rows = await pool.query(
    `SELECT config_json FROM rank_model ORDER BY id DESC LIMIT 1`
  );
  const v = rows.rows[0]?.config_json;
  if (!v) return null;
  return parseJson<ModelArtifact>(v);
}