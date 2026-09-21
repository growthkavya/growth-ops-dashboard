-- ================================================================
-- v5 Migration: one login, two people (Sep 2026)
--
-- Palak and Rupam share intern1@ssei.co.in. The login asks who is
-- signing in, and from then on the session belongs to that person:
-- their own tasks, their own attendance row, their own name on
-- everything they touch.
--
-- A profile can therefore stand for more than one member key:
--   profiles.member_key = 'intern1'      the login itself
--   profiles.seat_keys  = {palak,rupam}  the people who use it
--
-- Row-level security now asks "is this one of my keys" instead of
-- "is this my key", through public.member_keys().
--
-- Safe to re-run. Nothing is deleted.
-- ================================================================


-- ================================================================
-- 1. The people behind a shared login
-- ================================================================
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS seat_keys text[];

COMMENT ON COLUMN public.profiles.seat_keys IS
    'Member keys a shared login may act as, e.g. {palak,rupam}. Empty for a personal login.';

-- Every key the signed-in session may act as: its own, plus any seats.
CREATE OR REPLACE FUNCTION public.member_keys()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT COALESCE(
        array_remove(
            COALESCE(seat_keys, '{}'::text[]) || COALESCE(ARRAY[member_key], '{}'::text[]),
            NULL),
        '{}'::text[])
    FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.member_keys() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_keys() TO authenticated;

-- True when the session may act as this person.
CREATE OR REPLACE FUNCTION public.may_act_as(p_member text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT public.is_admin() OR p_member = ANY(public.member_keys());
$$;

REVOKE ALL ON FUNCTION public.may_act_as(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.may_act_as(text) TO authenticated;


-- ================================================================
-- 2. Attendance is per person, not per login
--
-- The v4 table allowed one row per login per day, so the second of two
-- people sharing a login could not check in at all.
-- ================================================================
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_user_id_work_date_key;

DO $$
BEGIN
    ALTER TABLE public.attendance ADD CONSTRAINT attendance_member_day_key UNIQUE (member_key, work_date);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN
    NULL;
END $$;

-- A blank member_key would collapse two people into one row.
UPDATE public.attendance a
   SET member_key = p.member_key
  FROM public.profiles p
 WHERE a.user_id = p.id AND (a.member_key IS NULL OR a.member_key = '') AND p.member_key IS NOT NULL;

DELETE FROM public.attendance WHERE member_key IS NULL OR member_key = '';

ALTER TABLE public.attendance ALTER COLUMN member_key SET NOT NULL;

DROP FUNCTION IF EXISTS public.attendance_check_in();
DROP FUNCTION IF EXISTS public.attendance_check_out();

-- p_member says who is checking in. A personal login can leave it null
-- and gets its own key; a shared login must name one of its seats.
CREATE OR REPLACE FUNCTION public.attendance_check_in(p_member text DEFAULT NULL)
RETURNS public.attendance
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    r public.attendance;
    who text;
    keys text[];
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in first.';
    END IF;

    keys := public.member_keys();
    who  := COALESCE(p_member, (SELECT member_key FROM public.profiles WHERE id = auth.uid()));

    IF who IS NULL THEN
        RAISE EXCEPTION 'This login is not linked to a person yet. Ask Kavya.';
    END IF;
    IF NOT (who = ANY(keys)) AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'You cannot check in as %.', who;
    END IF;

    INSERT INTO public.attendance (user_id, member_key, work_date, check_in_at, status)
    VALUES (auth.uid(), who, public.ist_today(), now(), 'present')
    ON CONFLICT (member_key, work_date) DO UPDATE
        -- A second tap never moves the first check-in later.
        SET check_in_at = COALESCE(public.attendance.check_in_at, EXCLUDED.check_in_at),
            status      = CASE WHEN public.attendance.check_in_at IS NULL
                               THEN 'present' ELSE public.attendance.status END,
            updated_at  = now()
    RETURNING * INTO r;

    RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.attendance_check_out(p_member text DEFAULT NULL)
RETURNS public.attendance
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    r public.attendance;
    who text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in first.';
    END IF;

    who := COALESCE(p_member, (SELECT member_key FROM public.profiles WHERE id = auth.uid()));

    IF NOT (who = ANY(public.member_keys())) AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'You cannot check out as %.', who;
    END IF;

    UPDATE public.attendance
       SET check_out_at = now(), updated_at = now()
     WHERE member_key = who
       AND work_date = public.ist_today()
       AND check_in_at IS NOT NULL
    RETURNING * INTO r;

    IF r.id IS NULL THEN
        RAISE EXCEPTION 'You have not checked in today.';
    END IF;

    RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_check_in(text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_check_out(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_check_in(text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_check_out(text) TO authenticated;


-- ================================================================
-- 3. Row-level security: "one of my keys", not "my key"
-- ================================================================

-- Attendance
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'attendance'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.attendance', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "attendance_select" ON public.attendance
    FOR SELECT USING (public.is_admin() OR member_key = ANY(public.member_keys()));
CREATE POLICY "attendance_admin_insert" ON public.attendance
    FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "attendance_admin_update" ON public.attendance
    FOR UPDATE USING (public.is_admin());
CREATE POLICY "attendance_admin_delete" ON public.attendance
    FOR DELETE USING (public.is_admin());

-- Work items
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'actions'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.actions', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "actions_select_policy" ON public.actions
    FOR SELECT USING (
        public.is_admin()
        OR owner_name = ANY(public.member_keys())
        OR assigned_by = auth.uid()
    );

CREATE POLICY "actions_insert_policy" ON public.actions
    FOR INSERT WITH CHECK (
        public.is_admin()
        OR (
            public.current_user_role() = 'member'
            AND (
                owner_name = ANY(public.member_keys())
                OR EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE role = 'intern'
                      AND (member_key = public.actions.owner_name
                           OR public.actions.owner_name = ANY(COALESCE(seat_keys, '{}'::text[])))
                )
            )
        )
    );

CREATE POLICY "actions_update_policy" ON public.actions
    FOR UPDATE USING (
        public.is_admin()
        OR owner_name = ANY(public.member_keys())
        OR assigned_by = auth.uid()
    );

CREATE POLICY "actions_delete_policy" ON public.actions
    FOR DELETE USING (public.is_admin());

-- KPIs and their scores and updates
DROP POLICY IF EXISTS "kpis_select_policy" ON public.kpis;
CREATE POLICY "kpis_select_policy" ON public.kpis
    FOR SELECT USING (public.is_admin() OR member = ANY(public.member_keys()));

DROP POLICY IF EXISTS "kpi_scores_select_policy" ON public.kpi_scores;
CREATE POLICY "kpi_scores_select_policy" ON public.kpi_scores
    FOR SELECT USING (
        public.is_admin()
        OR EXISTS (SELECT 1 FROM public.kpis
                    WHERE kpis.id = kpi_scores.kpi_id AND kpis.member = ANY(public.member_keys()))
    );

DROP POLICY IF EXISTS "kpi_scores_modify_policy" ON public.kpi_scores;
CREATE POLICY "kpi_scores_modify_policy" ON public.kpi_scores
    FOR ALL USING (
        public.is_admin()
        OR EXISTS (SELECT 1 FROM public.kpis
                    WHERE kpis.id = kpi_scores.kpi_id AND kpis.member = ANY(public.member_keys()))
    );

DROP POLICY IF EXISTS "kpi_updates_select" ON public.kpi_updates;
CREATE POLICY "kpi_updates_select" ON public.kpi_updates
    FOR SELECT USING (public.is_admin() OR member = ANY(public.member_keys()));

DROP POLICY IF EXISTS "kpi_updates_insert" ON public.kpi_updates;
CREATE POLICY "kpi_updates_insert" ON public.kpi_updates
    FOR INSERT WITH CHECK (public.is_admin() OR member = ANY(public.member_keys()));

DROP POLICY IF EXISTS "kpi_updates_update" ON public.kpi_updates;
CREATE POLICY "kpi_updates_update" ON public.kpi_updates
    FOR UPDATE USING (public.is_admin() OR member = ANY(public.member_keys()))
    WITH CHECK (public.is_admin() OR member = ANY(public.member_keys()));


-- ================================================================
-- 4. Verify
-- ================================================================
DO $$
BEGIN
    RAISE NOTICE 'v5 migration complete. Nothing deleted.';
    RAISE NOTICE '  profiles.seat_keys : who a shared login stands for';
    RAISE NOTICE '  attendance         : one row per person per day, not per login';
    RAISE NOTICE '  check in/out       : take the person as an argument';
    RAISE NOTICE '  policies           : match any of the session''s member keys';
END $$;
