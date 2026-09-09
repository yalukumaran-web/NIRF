-- 001_init.sql : NIRF ranking schema

CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  institution_name  TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'institution',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS institutions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'overall',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Raw metrics per institution per year (all fields nullable until confirmed)
CREATE TABLE IF NOT EXISTS raw_metrics (
  id                          SERIAL PRIMARY KEY,
  institution_id              INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  year                        INTEGER NOT NULL,

  ug_students                 NUMERIC,
  pg_students                 NUMERIC,
  phd_students                NUMERIC,
  full_time_students          NUMERIC,
  permanent_faculty           NUMERIC,
  faculty_with_phd            NUMERIC,
  capital_expenditure         NUMERIC,
  operational_expenditure     NUMERIC,

  total_publications          NUMERIC,
  top25_publications          NUMERIC,
  total_citations             NUMERIC,
  patents_filed               NUMERIC,
  patents_granted             NUMERIC,
  patents_licensed            NUMERIC,
  sponsored_research_amount   NUMERIC,
  consultancy_revenue         NUMERIC,
  retracted_papers            NUMERIC,

  graduates_placed            NUMERIC,
  graduates_higher_studies    NUMERIC,
  graduates_total             NUMERIC,
  graduates_in_time           NUMERIC,
  median_salary               NUMERIC,
  phd_graduates               NUMERIC,

  women_students              NUMERIC,
  women_faculty               NUMERIC,
  students_other_states       NUMERIC,
  students_other_countries    NUMERIC,
  escs_students               NUMERIC,
  pcs_facilities              BOOLEAN,

  confirmed                   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (institution_id, year)
);

CREATE TABLE IF NOT EXISTS scores (
  id                SERIAL PRIMARY KEY,
  institution_id    INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  year              INTEGER NOT NULL,
  category          TEXT NOT NULL,
  tlr               NUMERIC,
  rp                NUMERIC,
  go                NUMERIC,
  oi                NUMERIC,
  pr                NUMERIC,
  rp_penalty        NUMERIC DEFAULT 0,
  final_score       NUMERIC,
  has_insufficient  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, year)
);

CREATE TABLE IF NOT EXISTS score_breakdown (
  id              SERIAL PRIMARY KEY,
  score_id        INTEGER NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
  parameter       TEXT NOT NULL,
  sub_key         TEXT NOT NULL,
  label           TEXT NOT NULL,
  raw_value       NUMERIC,
  normalized      NUMERIC,
  status          TEXT NOT NULL DEFAULT 'ok', -- ok | insufficient_data
  missing_fields  TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_metrics_institution ON raw_metrics(institution_id);
CREATE INDEX IF NOT EXISTS idx_scores_institution ON scores(institution_id);
CREATE INDEX IF NOT EXISTS idx_breakdown_score ON score_breakdown(score_id);
