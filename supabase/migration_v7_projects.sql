-- ================================================================
-- v7 Migration: projects, and the plan a task belongs to (Sep 2026)
--
-- The dashboard had 147 loose work items and no way to see the streams
-- of work they belong to. A project is one of those streams: the
-- LeadSquared rebuild, the new website, PR for sir, the Scholarship
-- Exam. Every work item can now point at one.
--
-- A work item can also carry the plan it came from:
--   plan_tag = '2026-04'  the plan made in April 2026 (29 actions)
--   plan_tag = '2026-Q4'  the October to December plan, built from the KPIs
--
-- Two new statuses close out old plan items honestly:
--   dropped   not doing it, and the note says why
--   carried   continues as a fresh task in the current plan
--
-- Safe to re-run. Nothing is deleted.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.projects (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         text UNIQUE NOT NULL,
    name         text NOT NULL,
    summary      text,
    kra_id       uuid REFERENCES public.kras(id) ON DELETE SET NULL,
    status       text NOT NULL DEFAULT 'in_progress'
                 CHECK (status IN ('live', 'in_progress', 'done', 'parked')),
    owner_name   text,
    started_on   date,
    finished_on  date,
    link         text,
    next_step    text,
    sort_order   int DEFAULT 0,
    created_at   timestamptz DEFAULT timezone('utc', now()),
    updated_at   timestamptz DEFAULT timezone('utc', now()),
    archived_at  timestamptz
);

ALTER TABLE public.actions
    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS plan_tag   text;

CREATE INDEX IF NOT EXISTS idx_actions_project ON public.actions (project_id);
CREATE INDEX IF NOT EXISTS idx_actions_plan    ON public.actions (plan_tag);

ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_status_check;
ALTER TABLE public.actions
    ADD CONSTRAINT actions_status_check
    CHECK (status IN ('not_started', 'in_progress', 'blocked', 'done', 'dropped', 'carried'));

-- A dropped or carried item is closed: it never sits at a percentage.
CREATE OR REPLACE FUNCTION public.actions_close_out()
RETURNS trigger AS $$
BEGIN
    IF NEW.status IN ('dropped', 'carried') THEN
        NEW.completed_at := NULL;
        NEW.percent_done := 0;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actions_close_out ON public.actions;
CREATE TRIGGER trg_actions_close_out
BEFORE INSERT OR UPDATE ON public.actions
FOR EACH ROW EXECUTE FUNCTION public.actions_close_out();

-- ---------------------------------------------------------------
-- Access: everyone signed in can read the projects; the admin runs them.
-- ---------------------------------------------------------------
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "projects_admin_insert" ON public.projects;
CREATE POLICY "projects_admin_insert" ON public.projects
    FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "projects_admin_update" ON public.projects;
CREATE POLICY "projects_admin_update" ON public.projects
    FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "projects_admin_delete" ON public.projects;
CREATE POLICY "projects_admin_delete" ON public.projects
    FOR DELETE USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;

-- ================================================================
-- Verify
-- ================================================================
DO $$
BEGIN
    RAISE NOTICE 'v7 migration complete. Nothing deleted.';
    RAISE NOTICE '  projects                : the streams of work';
    RAISE NOTICE '  actions.project_id      : which stream a task belongs to';
    RAISE NOTICE '  actions.plan_tag        : 2026-04 or 2026-Q4';
    RAISE NOTICE '  actions.status          : + dropped, carried';
END $$;
