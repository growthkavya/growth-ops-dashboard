-- ================================================================
-- Migration: Enrich actions table — output_link, percent_done,
-- rm_remarks, and 'blocked' as a first-class status (24 May 2026)
--
-- Ports learnings from the gl_task (intern) table back into the
-- main actions table so the Today view can show real progress.
--
-- Safe to re-run. All ALTER are guarded with IF NOT EXISTS.
-- No data is dropped.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. New columns on actions
-- ----------------------------------------------------------------
ALTER TABLE public.actions
    ADD COLUMN IF NOT EXISTS output_link text,
    ADD COLUMN IF NOT EXISTS percent_done integer DEFAULT 0 CHECK (percent_done >= 0 AND percent_done <= 100),
    ADD COLUMN IF NOT EXISTS rm_remarks text;

-- ----------------------------------------------------------------
-- 2. Expand the status check to include 'blocked' and 'in_progress'
--    (some existing rows already use them via app code, but the
--    DB constraint blocks 'blocked' explicitly)
-- ----------------------------------------------------------------
DO $$
BEGIN
    -- Drop whichever status-check constraint exists (name varies by deploy)
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'actions_status_check'
    ) THEN
        ALTER TABLE public.actions DROP CONSTRAINT actions_status_check;
    END IF;
END $$;

ALTER TABLE public.actions
    ADD CONSTRAINT actions_status_check
    CHECK (status IN ('not_started', 'in_progress', 'blocked', 'done'));

-- ----------------------------------------------------------------
-- 3. Keep percent_done in sync with status (defensive trigger)
--    status=done -> percent_done snaps to 100
--    status=not_started -> snaps to 0
--    other statuses leave percent_done alone
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.actions_sync_percent_done()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'done' THEN
        NEW.percent_done := 100;
    ELSIF NEW.status = 'not_started' THEN
        NEW.percent_done := 0;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actions_sync_percent_done ON public.actions;
CREATE TRIGGER trg_actions_sync_percent_done
BEFORE INSERT OR UPDATE ON public.actions
FOR EACH ROW EXECUTE FUNCTION public.actions_sync_percent_done();

-- ----------------------------------------------------------------
-- 4. Index for the Today view query (overdue / due-today / blocked)
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_actions_owner_status_due
    ON public.actions (owner_name, status, due_date);

-- ----------------------------------------------------------------
-- 5. Backfill existing rows
--    Any 'done' row gets percent_done=100, 'not_started' gets 0,
--    everything else stays 0 unless explicitly updated later.
-- ----------------------------------------------------------------
UPDATE public.actions SET percent_done = 100 WHERE status = 'done' AND percent_done <> 100;
UPDATE public.actions SET percent_done = 0   WHERE status = 'not_started' AND percent_done IS NULL;
