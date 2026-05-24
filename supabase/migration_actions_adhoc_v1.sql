-- ================================================================
-- Migration: ad-hoc work tracking (24 May 2026)
--
-- Reality check: a lot of Kavya's time goes to ad-hoc work that
-- doesn't ladder to a specific KPI (e.g. the Samadhan website
-- rebuild). Until now these either didn't get tracked, or had to
-- be force-fitted under a KPI bucket.
--
-- This migration adds two optional columns:
--   project_tag   — free-text tag (e.g. 'samadhan-website',
--                   'sir-ig-launch', 'general-admin'). Used for
--                   grouping non-KPI work in the Today view.
--   hours_spent   — numeric hours actually spent. Lets Kavya
--                   see where time goes by KPI / tag at week's end.
--
-- Both fields are optional. Existing rows untouched. The kpi_id
-- column was already nullable in schema.sql, so KPI-less actions
-- were always permitted at the DB level — only the create form
-- enforced it.
-- ================================================================

ALTER TABLE public.actions
    ADD COLUMN IF NOT EXISTS project_tag  text,
    ADD COLUMN IF NOT EXISTS hours_spent  numeric(5,2) CHECK (hours_spent IS NULL OR hours_spent >= 0);

CREATE INDEX IF NOT EXISTS idx_actions_project_tag ON public.actions (project_tag)
  WHERE project_tag IS NOT NULL;
