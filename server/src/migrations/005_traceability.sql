-- 005_traceability.sql : Traceability tables for the NIRF product spec
-- (uploaded documents, calculation runs, dataset versions, training runs,
--  official ground-truth scores, audit log) + model lineage columns.

-- Uploaded NIRF documents (format detection + extraction per Phase 5)
CREATE TABLE IF NOT EXISTS uploaded_docs (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  institution_id    INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
  original_name     TEXT NOT NULL,
  storage_key       TEXT NOT NULL,          -- path/object key of stored file
  mime_type         TEXT,
  size_bytes        INTEGER,
  format            TEXT NOT NULL,          -- nirf_credentials | nirf_pdf_other | unsupported
  format_confidence NUMERIC,
  quality           TEXT NOT NULL,          -- recognized_full | recognized_partial | nirf_other | invalid
  page_count        INTEGER,
  section_report    JSONB,                  -- per-section page/marker info
  extracted_json    JSONB,                  -- ExtractedNirf (with fieldSources + fieldPages)
  field_sources     JSONB,
  missing_fields    JSONB,
  validation_report JSONB,                  -- validationService report
  status            TEXT NOT NULL DEFAULT 'uploaded',  -- uploaded|extracted|validated|confirmed
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Calculation runs — every engine / ML computation is recorded for traceability
CREATE TABLE IF NOT EXISTS calc_runs (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  institution_id    INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
  uploaded_doc_id   INTEGER REFERENCES uploaded_docs(id) ON DELETE SET NULL,
  category          TEXT NOT NULL,
  year              INTEGER NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'engine',   -- engine | ml_prediction
  metrics_source    TEXT NOT NULL DEFAULT 'extracted',-- extracted|manual|official
  methodology_version TEXT,
  model_version     TEXT,
  algorithm         TEXT,                            -- for ml_prediction runs
  metrics_json      JSONB,                           -- submitted RawMetrics snapshot
  validation_json   JSONB,                           -- validation report snapshot
  final_score       NUMERIC,
  weighted_score    NUMERIC,
  parameters_json   JSONB,                           -- ParameterScore[] snapshot
  breakdown_json    JSONB,
  insufficient      JSONB,
  confidence        NUMERIC,                         -- ML confidence, engine = NULL
  predicted_rank    INTEGER,                         -- ML rank estimate
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dataset versions — immutable snapshots used to train ML models
CREATE TABLE IF NOT EXISTS dataset_versions (
  id                SERIAL PRIMARY KEY,
  version_tag       TEXT NOT NULL UNIQUE,    -- e.g. "official-eng-2025-v1"
  category          TEXT NOT NULL,
  year              INTEGER NOT NULL,
  description       TEXT,
  source            TEXT NOT NULL,           -- 'official_nirf' | 'submitted' | 'export'
  row_count         INTEGER NOT NULL,
  feature_keys      JSONB NOT NULL,          -- ordered feature schema
  dataset_json      JSONB NOT NULL,          -- { id, features[], target }[]
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Training runs — one row per model fit, with full lineage + metrics
CREATE TABLE IF NOT EXISTS training_runs (
  id                SERIAL PRIMARY KEY,
  dataset_version_id INTEGER REFERENCES dataset_versions(id) ON DELETE SET NULL,
  dataset_version   TEXT NOT NULL,
  model_version     TEXT NOT NULL,           -- semantic version of the artifact
  algorithm         TEXT NOT NULL,           -- linear | cart | forest | gbm
  feature_keys      JSONB NOT NULL,
  params            JSONB NOT NULL,
  train_size        INTEGER,
  test_size         INTEGER,
  seed              INTEGER,
  metrics           JSONB NOT NULL,          -- { mae, rmse, r2, n }
  feature_importance JSONB NOT NULL,         -- [{key, importance}]
  artifact_json     JSONB NOT NULL,          -- ModelArtifact (schemaVersion etc.)
  status            TEXT NOT NULL DEFAULT 'completed',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Official ground truth (NIRF published scores) — used for engine verification
-- and as ML labels. Seeded in Phase 7 from officialEngineering2025.ts.
CREATE TABLE IF NOT EXISTS official_scores (
  id                SERIAL PRIMARY KEY,
  category          TEXT NOT NULL,
  year              INTEGER NOT NULL,
  rank              INTEGER NOT NULL,
  institute_id      TEXT,
  institute_name    TEXT,
  score             NUMERIC NOT NULL,
  tlr               NUMERIC,
  rpc               NUMERIC,
  go                NUMERIC,
  oi                NUMERIC,
  pr                NUMERIC,
  source            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, year, rank, institute_id)
);

-- Audit log — every meaningful write action for transparency
CREATE TABLE IF NOT EXISTS audit_log (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER,
  email             TEXT,
  role              TEXT,
  action            TEXT NOT NULL,          -- e.g. 'document.upload', 'calc.run', 'ml.train'
  entity_type       TEXT,
  entity_id         TEXT,
  details           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Model lineage columns on the active-model table
ALTER TABLE rank_model ADD COLUMN IF NOT EXISTS algorithm          TEXT;
ALTER TABLE rank_model ADD COLUMN IF NOT EXISTS model_version      TEXT;
ALTER TABLE rank_model ADD COLUMN IF NOT EXISTS dataset_version    TEXT;
ALTER TABLE rank_model ADD COLUMN IF NOT EXISTS feature_keys       JSONB;
ALTER TABLE rank_model ADD COLUMN IF NOT EXISTS feature_importance JSONB;

CREATE INDEX IF NOT EXISTS idx_docs_user ON uploaded_docs(user_id);
CREATE INDEX IF NOT EXISTS idx_calcruns_institution ON calc_runs(institution_id);
CREATE INDEX IF NOT EXISTS idx_training_dataset ON training_runs(dataset_version);
CREATE INDEX IF NOT EXISTS idx_official ON official_scores(category, year);
CREATE INDEX IF NOT EXISTS idx_audit_action_time ON audit_log(action, created_at);