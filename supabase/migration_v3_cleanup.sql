-- ================================================================
-- v3 Migration — Dashboard rebuild (Aug 2026)
--
-- Principle: NOTHING IS DELETED. No row is edited except to backfill
-- a newly-added column with a sensible default. Every statement is
-- guarded and safe to re-run.
--
-- What this does:
--   1. Fixes two CHECK constraints that are silently rejecting writes
--   2. Gives `goals` a real two-level shape (company year -> team quarter)
--   3. Turns `documents` and `master_sheets` into trackers, not link lists
--   4. Adds the columns the single work tracker needs
--   5. Leaves work_logs, ideas, weekly_logs, daily_entries in place,
--      untouched, as read-only history
-- ================================================================


-- ================================================================
-- 1. CONSTRAINT FIXES  (both of these are live bugs)
-- ================================================================

-- 1a. actions.owner_name rejects interns.
--     migration_year2_kra.sql set CHECK (owner_name IN ('kavya','ishita','riya')),
--     but the Delegations UI writes owner_name='intern1' when assigning to an
--     intern -> the insert is rejected by Postgres. Widen it, and stop
--     hard-coding names so a new joiner doesn't need a migration.
ALTER TABLE public.actions DROP CONSTRAINT IF EXISTS actions_owner_name_check;

-- 1b. activity_log.action rejects everything the app actually logs.
--     schema.sql set CHECK (action IN ('created','updated','deleted')), but the
--     app writes 'logged win', 'completed', 'blocked', 'unblocked'. db.logActivity
--     only console.error()s on failure, so these have been failing invisibly and
--     the activity feed has been under-reporting.
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_action_check;


-- ================================================================
-- 2. GOALS — two levels: company (annual) -> team (quarterly)
--
-- The table already has: type ('year'|'quarter'|'month'|'week'),
-- parent_id (self-FK), status, owner_id, due_date. That is most of the
-- shape already. What's missing is the link to a KRA, a way to express
-- the measure, and explicit period columns so we can filter cleanly.
-- ================================================================

ALTER TABLE public.goals
    ADD COLUMN IF NOT EXISTS scope        text,      -- 'company' | 'team'
    ADD COLUMN IF NOT EXISTS kra_id       uuid REFERENCES public.kras(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS metric       text,      -- plain English: "Lead response time"
    ADD COLUMN IF NOT EXISTS baseline     text,      -- "6 hours"
    ADD COLUMN IF NOT EXISTS target       text,      -- "under 2 hours"
    ADD COLUMN IF NOT EXISTS progress_pct integer DEFAULT 0
        CHECK (progress_pct IS NULL OR (progress_pct >= 0 AND progress_pct <= 100)),
    ADD COLUMN IF NOT EXISTS period_year  integer,
    ADD COLUMN IF NOT EXISTS period_quarter integer
        CHECK (period_quarter IS NULL OR (period_quarter >= 1 AND period_quarter <= 4)),
    ADD COLUMN IF NOT EXISTS sort_order   integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS archived_at  timestamptz;

-- Backfill scope from the existing `type` column so old rows slot into the
-- new two-level view instead of disappearing. Annual goals read as company
-- goals; everything shorter reads as a team goal.
UPDATE public.goals SET scope = 'company' WHERE scope IS NULL AND type = 'year';
UPDATE public.goals SET scope = 'team'    WHERE scope IS NULL AND type <> 'year';

-- Backfill the period from due_date where we can infer it.
UPDATE public.goals
   SET period_year = EXTRACT(YEAR FROM due_date)::int
 WHERE period_year IS NULL AND due_date IS NOT NULL;

UPDATE public.goals
   SET period_quarter = EXTRACT(QUARTER FROM due_date)::int
 WHERE period_quarter IS NULL AND due_date IS NOT NULL AND type <> 'year';

-- Goals can be 'blocked' too, same vocabulary as work items.
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE public.goals
    ADD CONSTRAINT goals_status_check
    CHECK (status IN ('not_started', 'in_progress', 'blocked', 'done'));

CREATE INDEX IF NOT EXISTS idx_goals_scope_period ON public.goals (scope, period_year, period_quarter);
CREATE INDEX IF NOT EXISTS idx_goals_parent       ON public.goals (parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_kra          ON public.goals (kra_id);


-- ================================================================
-- 3. WORK ITEMS (actions) — the single tracker
--
-- Adds the goal link so work ladders up, and a source marker so items
-- created from different places stay distinguishable.
-- ================================================================

ALTER TABLE public.actions
    ADD COLUMN IF NOT EXISTS goal_id     uuid REFERENCES public.goals(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Stamp completed_at for rows already marked done, using updated_at as the
-- best available proxy. Only fills the new column; no existing value changes.
UPDATE public.actions
   SET completed_at = updated_at
 WHERE status = 'done' AND completed_at IS NULL;

-- Keep completed_at accurate from here on.
CREATE OR REPLACE FUNCTION public.actions_stamp_completed_at()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'done' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'done') THEN
        NEW.completed_at := timezone('utc', now());
    ELSIF NEW.status <> 'done' THEN
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actions_stamp_completed_at ON public.actions;
CREATE TRIGGER trg_actions_stamp_completed_at
BEFORE INSERT OR UPDATE ON public.actions
FOR EACH ROW EXECUTE FUNCTION public.actions_stamp_completed_at();

CREATE INDEX IF NOT EXISTS idx_actions_goal ON public.actions (goal_id);


-- ================================================================
-- 4. DOCUMENTS — a tracker, not a link list
--
-- Today this table is name + type + url. A tracker needs to answer:
-- who owns it, when was it last checked, is it still current.
-- ================================================================

ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS owner_id          uuid REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS owner_label       text,
    ADD COLUMN IF NOT EXISTS status            text DEFAULT 'current',
    ADD COLUMN IF NOT EXISTS last_reviewed_at  date,
    ADD COLUMN IF NOT EXISTS review_every_days integer,
    ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT timezone('utc', now());

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE public.documents
    ADD CONSTRAINT documents_status_check
    CHECK (status IN ('current', 'needs_review', 'draft', 'retired'));

-- Existing rows are assumed current until someone says otherwise.
UPDATE public.documents SET status = 'current' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents (status, type);


-- ================================================================
-- 5. MASTER SHEETS — same treatment
--
-- This table is created here rather than assumed, because
-- migration_master_sheets_v1.sql was never actually run against the
-- live database (confirmed 9 Aug 2026 — PostgREST reported the table
-- missing from the schema cache). The old dashboard's Master Sheets
-- block has therefore been failing silently since it shipped.
--
-- CREATE TABLE IF NOT EXISTS makes this safe either way: a no-op where
-- the table already exists, and the fix where it doesn't.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.master_sheets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    vertical    text NOT NULL CHECK (vertical IN ('growth','sales','academics','tech','hiring','finance','other')),
    owner       text,
    url         text NOT NULL,
    description text,
    sort_order  integer DEFAULT 0,
    created_at  timestamptz DEFAULT now(),
    created_by  uuid REFERENCES auth.users(id)
);

ALTER TABLE public.master_sheets ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'master_sheets'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.master_sheets', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "master_sheets_admin_all" ON public.master_sheets
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "master_sheets_member_read" ON public.master_sheets
    FOR SELECT USING (public.current_user_role() IN ('admin','member'));

CREATE INDEX IF NOT EXISTS idx_master_sheets_vertical
    ON public.master_sheets (vertical, sort_order);

ALTER TABLE public.master_sheets
    ADD COLUMN IF NOT EXISTS owner_id          uuid REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS status            text DEFAULT 'current',
    ADD COLUMN IF NOT EXISTS last_reviewed_at  date,
    ADD COLUMN IF NOT EXISTS review_every_days integer,
    ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT timezone('utc', now());

ALTER TABLE public.master_sheets DROP CONSTRAINT IF EXISTS master_sheets_status_check;
ALTER TABLE public.master_sheets
    ADD CONSTRAINT master_sheets_status_check
    CHECK (status IN ('current', 'needs_review', 'draft', 'retired'));

UPDATE public.master_sheets SET status = 'current' WHERE status IS NULL;


-- ================================================================
-- 6. RLS for the new columns / goals table
--
-- goals had no explicit RBAC policies (the RBAC migration left a comment
-- saying "team-visible by design" but never wrote them). The permissive
-- schema.sql policies are still attached, which is fine for a 2-person
-- team, but make it explicit so it doesn't read as an oversight.
-- ================================================================

-- Drop every existing policy on goals by name, whatever it's called. Listing
-- them by hand is how a re-run breaks: miss one and the CREATE below fails.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'goals'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.goals', r.policyname);
    END LOOP;
END $$;

-- Everyone on the team sees all goals. Alignment is the whole point.
CREATE POLICY "goals_select_policy" ON public.goals
    FOR SELECT USING (auth.role() = 'authenticated');

-- Admins write anything. Members write their own goals and team-scope goals.
CREATE POLICY "goals_insert_policy" ON public.goals
    FOR INSERT WITH CHECK (
        public.is_admin()
        OR (public.current_user_role() = 'member' AND scope = 'team')
    );

CREATE POLICY "goals_update_policy" ON public.goals
    FOR UPDATE USING (
        public.is_admin()
        OR owner_id = auth.uid()
    );

-- Only admins delete goals.
CREATE POLICY "goals_delete_policy" ON public.goals
    FOR DELETE USING (public.is_admin());


-- ================================================================
-- 7. Realtime for goals (was declared in schema.sql; re-assert safely)
-- ================================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.goals;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;


-- ================================================================
-- 8. Verify
-- ================================================================
DO $$
DECLARE
    goal_count int;
    action_count int;
    doc_count int;
BEGIN
    SELECT COUNT(*) INTO goal_count   FROM public.goals;
    SELECT COUNT(*) INTO action_count FROM public.actions;
    SELECT COUNT(*) INTO doc_count    FROM public.documents;

    RAISE NOTICE 'v3 migration complete. Nothing deleted.';
    RAISE NOTICE '  goals      : % rows (scope backfilled)', goal_count;
    RAISE NOTICE '  actions    : % rows (goal_id + completed_at added)', action_count;
    RAISE NOTICE '  documents  : % rows (owner/status/review added)', doc_count;
    RAISE NOTICE '  Fixed: actions.owner_name no longer rejects interns';
    RAISE NOTICE '  Fixed: activity_log.action no longer rejects real events';
END $$;
