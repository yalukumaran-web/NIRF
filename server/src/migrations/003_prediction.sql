-- 003_prediction.sql : stores per-upload NIRF predictions

CREATE TABLE IF NOT EXISTS predictions (
  id                SERIAL PRIMARY KEY,
  institution_id    INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  year              INTEGER,
  source_file       TEXT,
  extracted_json    JSONB NOT NULL,
  predicted_rank    NUMERIC NOT NULL,
  composite         NUMERIC NOT NULL,
  confidence        NUMERIC,
  model_category    TEXT NOT NULL DEFAULT 'engineering',
  parameter_breakdown JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictions_institution ON predictions(institution_id);
