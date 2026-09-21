-- ================================================================
-- v6 Migration: score a KPI by the week or by the quarter (Sep 2026)
--
-- Scoring was fixed to calendar months. Some measures are worth a look
-- every week, others only make sense over a quarter, so a score now
-- carries the period it belongs to:
--
--   period = 'week'    period_start = that Monday
--   period = 'month'   period_start = the 1st
--   period = 'quarter' period_start = 1 Jan / 1 Apr / 1 Jul / 1 Oct
--
-- month and year stay on the table so nothing that reads them breaks.
--
-- Safe to re-run. Nothing is deleted.
-- ================================================================

ALTER TABLE public.kpi_scores
    ADD COLUMN IF NOT EXISTS period       text,
    ADD COLUMN IF NOT EXISTS period_start date;

-- Existing rows are monthly scores; give them the shape the new UI reads.
UPDATE public.kpi_scores
   SET period = 'month',
       period_start = make_date(year, month, 1)
 WHERE period IS NULL;

ALTER TABLE public.kpi_scores ALTER COLUMN period SET DEFAULT 'month';

ALTER TABLE public.kpi_scores DROP CONSTRAINT IF EXISTS kpi_scores_period_check;
ALTER TABLE public.kpi_scores
    ADD CONSTRAINT kpi_scores_period_check
    CHECK (period IS NULL OR period IN ('week', 'month', 'quarter'));

-- month and year were NOT NULL, which a weekly score cannot satisfy.
ALTER TABLE public.kpi_scores ALTER COLUMN month DROP NOT NULL;
ALTER TABLE public.kpi_scores ALTER COLUMN year  DROP NOT NULL;

-- Keep month and year filled from period_start, so older reports still work.
CREATE OR REPLACE FUNCTION public.kpi_scores_fill()
RETURNS trigger AS $$
BEGIN
    IF NEW.period_start IS NOT NULL THEN
        NEW.month := EXTRACT(MONTH FROM NEW.period_start)::int;
        NEW.year  := EXTRACT(YEAR  FROM NEW.period_start)::int;
    END IF;
    NEW.period := COALESCE(NEW.period, 'month');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kpi_scores_fill ON public.kpi_scores;
CREATE TRIGGER trg_kpi_scores_fill
BEFORE INSERT OR UPDATE ON public.kpi_scores
FOR EACH ROW EXECUTE FUNCTION public.kpi_scores_fill();

-- One score per KPI per period. The old (kpi_id, month, year) rule would
-- have let a weekly score collide with the month's.
ALTER TABLE public.kpi_scores DROP CONSTRAINT IF EXISTS kpi_scores_kpi_id_month_year_key;

DO $$
BEGIN
    ALTER TABLE public.kpi_scores ADD CONSTRAINT kpi_scores_period_key UNIQUE (kpi_id, period, period_start);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_kpi_scores_period ON public.kpi_scores (period, period_start);


-- ================================================================
-- Verify
-- ================================================================
DO $$
BEGIN
    RAISE NOTICE 'v6 migration complete. Nothing deleted.';
    RAISE NOTICE '  kpi_scores.period / period_start : week, month or quarter';
    RAISE NOTICE '  month and year                   : kept, filled by trigger';
END $$;
