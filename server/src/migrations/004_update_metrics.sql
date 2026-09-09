-- 004_update_metrics.sql : Add new columns for NIRF 2025 Engineering formulas

-- Drop old columns that are replaced
ALTER TABLE raw_metrics DROP COLUMN IF EXISTS ug_students;
ALTER TABLE raw_metrics DROP COLUMN IF EXISTS pg_students;
ALTER TABLE raw_metrics DROP COLUMN IF EXISTS full_time_students;
ALTER TABLE raw_metrics DROP COLUMN IF EXISTS top25_publications;
ALTER TABLE raw_metrics DROP COLUMN IF EXISTS patents_licensed;
ALTER TABLE raw_metrics DROP COLUMN IF EXISTS graduates_total;

-- Add new columns
ALTER TABLE raw_metrics ADD COLUMN IF NOT EXISTS sanctioned_intake NUMERIC;
ALTER TABLE raw_metrics ADD COLUMN IF NOT EXISTS enrolled_students NUMERIC;
ALTER TABLE raw_metrics ADD COLUMN IF NOT EXISTS faculty_exp_0to8 NUMERIC;
ALTER TABLE raw_metrics ADD COLUMN IF NOT EXISTS faculty_exp_8to15 NUMERIC;
ALTER TABLE raw_metrics ADD COLUMN IF NOT EXISTS faculty_exp_15plus NUMERIC;
ALTER TABLE raw_metrics ADD COLUMN IF NOT EXISTS top25_citations NUMERIC;
ALTER TABLE raw_metrics ADD COLUMN IF NOT EXISTS retracted_citations NUMERIC;
