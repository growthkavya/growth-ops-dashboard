-- ================================================================
-- v4 Migration: team logins, attendance, KPI updates (Sep 2026)
--
-- Schema only. No staff data lives in this file: the repo is public,
-- so KRAs, KPIs and the work log are loaded by a private script from
-- outside the repo.
--
-- What this does:
--   1. Lets any team member own KPIs (the old CHECK allowed three names)
--   2. Keeps a completed_at that the caller sets, so past work can be
--      logged with the date it was actually finished
--   3. Attendance: one row per person per day, check-in and check-out
--      stamped by the server clock, never the browser's
--   4. KPI updates: a weekly and a monthly note under each KPI
--
-- Safe to re-run. Nothing is deleted.
-- ================================================================


-- ================================================================
-- 1. kpis.member: any team member, not a fixed list of three
-- ================================================================
ALTER TABLE public.kpis DROP CONSTRAINT IF EXISTS kpis_member_check;

ALTER TABLE public.kpis
    ADD COLUMN IF NOT EXISTS supports_kpi_id uuid REFERENCES public.kpis(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.kpis.supports_kpi_id IS
    'The manager KPI this one feeds. An associate KPI measures the execution; the manager KPI it supports measures the outcome.';


-- ================================================================
-- 2. completed_at: stamp it only when the caller did not set it
--
-- The v3 trigger overwrote completed_at with now() on every insert of a
-- done item, so work finished in May and logged in September showed up
-- as September work in the Calendar.
-- ================================================================
CREATE OR REPLACE FUNCTION public.actions_stamp_completed_at()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'done' THEN
        IF TG_OP = 'INSERT' THEN
            NEW.completed_at := COALESCE(NEW.completed_at, timezone('utc', now()));
        ELSIF OLD.status IS DISTINCT FROM 'done'
              AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at THEN
            NEW.completed_at := timezone('utc', now());
        END IF;
    ELSE
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ================================================================
-- 3. ATTENDANCE
-- ================================================================

-- The office runs on Kolkata time. Every "today" is computed here, on
-- the server, so a wrong laptop clock can't move a check-in.
CREATE OR REPLACE FUNCTION public.ist_today()
RETURNS date AS $$
    SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$ LANGUAGE sql STABLE;

CREATE TABLE IF NOT EXISTS public.attendance (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    member_key   text NOT NULL,
    work_date    date NOT NULL,
    check_in_at  timestamptz,
    check_out_at timestamptz,
    status       text NOT NULL DEFAULT 'present',
    note         text,
    edited_by    uuid REFERENCES public.profiles(id),
    edited_at    timestamptz,
    created_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (user_id, work_date)
);

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance
    ADD CONSTRAINT attendance_status_check
    CHECK (status IN ('present', 'wfh', 'half_day', 'casual_leave', 'sick_leave', 'absent', 'holiday'));

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_out_after_in;
ALTER TABLE public.attendance
    ADD CONSTRAINT attendance_out_after_in
    CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at);

CREATE INDEX IF NOT EXISTS idx_attendance_date   ON public.attendance (work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_member ON public.attendance (member_key, work_date);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'attendance'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.attendance', r.policyname);
    END LOOP;
END $$;

-- Everyone sees their own days; the admin sees the whole team.
CREATE POLICY "attendance_select" ON public.attendance
    FOR SELECT USING (public.is_admin() OR user_id = auth.uid());

-- Only the admin writes rows directly (corrections, leave, holidays).
-- Everyone else checks in and out through the two functions below,
-- which take the time from the server.
CREATE POLICY "attendance_admin_insert" ON public.attendance
    FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "attendance_admin_update" ON public.attendance
    FOR UPDATE USING (public.is_admin());
CREATE POLICY "attendance_admin_delete" ON public.attendance
    FOR DELETE USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.attendance_check_in()
RETURNS public.attendance
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    r public.attendance;
    k text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in first.';
    END IF;

    SELECT member_key INTO k FROM public.profiles WHERE id = auth.uid();

    INSERT INTO public.attendance (user_id, member_key, work_date, check_in_at, status)
    VALUES (auth.uid(), COALESCE(k, ''), public.ist_today(), now(), 'present')
    ON CONFLICT (user_id, work_date) DO UPDATE
        -- A second tap never moves the first check-in later.
        SET check_in_at = COALESCE(public.attendance.check_in_at, EXCLUDED.check_in_at),
            status      = CASE WHEN public.attendance.check_in_at IS NULL
                               THEN 'present' ELSE public.attendance.status END,
            updated_at  = now()
    RETURNING * INTO r;

    RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.attendance_check_out()
RETURNS public.attendance
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    r public.attendance;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in first.';
    END IF;

    UPDATE public.attendance
       SET check_out_at = now(), updated_at = now()
     WHERE user_id = auth.uid()
       AND work_date = public.ist_today()
       AND check_in_at IS NOT NULL
    RETURNING * INTO r;

    IF r.id IS NULL THEN
        RAISE EXCEPTION 'You have not checked in today.';
    END IF;

    RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_check_in()  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_check_out() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_check_in()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_check_out() TO authenticated;


-- ================================================================
-- 4. KPI UPDATES: a weekly and a monthly note under each KPI
--
-- The work itself is logged as work items linked to the KPI. These
-- notes are the narrative on top: what moved this week, what's stuck,
-- and at month end, the summary the score is based on.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.kpi_updates (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kpi_id       uuid NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
    member       text NOT NULL,
    period       text NOT NULL CHECK (period IN ('week', 'month')),
    period_start date NOT NULL,
    summary      text NOT NULL,
    links        text,
    health       text CHECK (health IS NULL OR health IN ('on_track', 'at_risk', 'off_track')),
    created_by   uuid REFERENCES public.profiles(id),
    created_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (kpi_id, period, period_start)
);

CREATE INDEX IF NOT EXISTS idx_kpi_updates_member ON public.kpi_updates (member, period, period_start);

-- The member is always the KPI's owner. Taken from the KPI rather than
-- trusted from the browser, so row-level security has a true value to check.
CREATE OR REPLACE FUNCTION public.kpi_updates_fill()
RETURNS trigger AS $$
BEGIN
    NEW.member := (SELECT member FROM public.kpis WHERE id = NEW.kpi_id);
    IF TG_OP = 'INSERT' THEN
        NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    END IF;
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kpi_updates_fill ON public.kpi_updates;
CREATE TRIGGER trg_kpi_updates_fill
BEFORE INSERT OR UPDATE ON public.kpi_updates
FOR EACH ROW EXECUTE FUNCTION public.kpi_updates_fill();

ALTER TABLE public.kpi_updates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'kpi_updates'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.kpi_updates', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "kpi_updates_select" ON public.kpi_updates
    FOR SELECT USING (public.is_admin() OR member = public.current_member_key());

CREATE POLICY "kpi_updates_insert" ON public.kpi_updates
    FOR INSERT WITH CHECK (public.is_admin() OR member = public.current_member_key());

CREATE POLICY "kpi_updates_update" ON public.kpi_updates
    FOR UPDATE USING (public.is_admin() OR member = public.current_member_key())
    WITH CHECK (public.is_admin() OR member = public.current_member_key());

CREATE POLICY "kpi_updates_delete" ON public.kpi_updates
    FOR DELETE USING (public.is_admin() OR created_by = auth.uid());


-- ================================================================
-- 5. Verify
-- ================================================================
DO $$
BEGIN
    RAISE NOTICE 'v4 migration complete. Nothing deleted.';
    RAISE NOTICE '  kpis.member        : any team member';
    RAISE NOTICE '  completed_at       : keeps a caller-set date';
    RAISE NOTICE '  attendance         : table + check-in/out functions';
    RAISE NOTICE '  kpi_updates        : weekly and monthly notes per KPI';
END $$;
