-- 002_model.sql : stores the trained rank-prediction model config

CREATE TABLE IF NOT EXISTS rank_model (
  id               SERIAL PRIMARY KEY,
  category         TEXT NOT NULL DEFAULT 'engineering',
  config_json      JSONB NOT NULL,
  trained_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  n_instances      INTEGER NOT NULL,
  spearman_r       NUMERIC,
  median_abs_err   NUMERIC,
  metrics          JSONB
);

-- Per-institution extracted NIRF data (used to rebuild / sanity check the model)
CREATE TABLE IF NOT EXISTS nirf_instances (
  id                SERIAL PRIMARY KEY,
  institute_id      TEXT UNIQUE NOT NULL,
  institute_name    TEXT,
  rank              INTEGER,
  metrics_json      JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
