-- ============================================================
-- RBAC Migration v1 FIX (17 May 2026)
--
-- Previous migration didn't actually filter — old permissive
-- policies "KPIs are viewable by all authenticated users" etc.
-- were still attached because my DROP names didn't match.
--
-- This file nukes ALL existing policies on actions/kpis/kpi_scores
-- dynamically, then recreates exactly the RBAC ones we want.
-- ============================================================

-- 1. Dynamically drop ALL existing policies on the 3 sensitive tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('actions', 'kpis', 'kpi_scores')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                       r.policyname, r.schemaname, r.tablename);
        RAISE NOTICE 'Dropped policy % on %.%', r.policyname, r.schemaname, r.tablename;
    END LOOP;
END $$;


-- 2. ACTIONS — RBAC policies
CREATE POLICY "actions_select_policy" ON public.actions
    FOR SELECT
    USING (
        public.is_admin()
        OR owner_name = public.current_member_key()
        OR assigned_by = auth.uid()
    );

CREATE POLICY "actions_insert_policy" ON public.actions
    FOR INSERT
    WITH CHECK (
        public.is_admin()
        OR (
            public.current_user_role() = 'member'
            AND (
                owner_name = public.current_member_key()
                OR EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE member_key = public.actions.owner_name
                      AND role = 'intern'
                )
            )
        )
    );

CREATE POLICY "actions_update_policy" ON public.actions
    FOR UPDATE
    USING (
        public.is_admin()
        OR owner_name = public.current_member_key()
        OR assigned_by = auth.uid()
    );

CREATE POLICY "actions_delete_policy" ON public.actions
    FOR DELETE
    USING (public.is_admin());


-- 3. KPIS — RBAC policies
CREATE POLICY "kpis_select_policy" ON public.kpis
    FOR SELECT
    USING (
        public.is_admin()
        OR member = public.current_member_key()
    );

CREATE POLICY "kpis_modify_policy" ON public.kpis
    FOR ALL
    USING (public.is_admin());


-- 4. KPI_SCORES — RBAC policies
CREATE POLICY "kpi_scores_select_policy" ON public.kpi_scores
    FOR SELECT
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.kpis
            WHERE kpis.id = kpi_scores.kpi_id
              AND kpis.member = public.current_member_key()
        )
    );

CREATE POLICY "kpi_scores_modify_policy" ON public.kpi_scores
    FOR ALL
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.kpis
            WHERE kpis.id = kpi_scores.kpi_id
              AND kpis.member = public.current_member_key()
        )
    );


-- 5. Verify — list final policies
DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE '=== Final policies on RBAC tables ===';
    FOR r IN
        SELECT tablename, policyname, cmd
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('actions', 'kpis', 'kpi_scores')
        ORDER BY tablename, policyname
    LOOP
        RAISE NOTICE '  %.% — %', r.tablename, r.policyname, r.cmd;
    END LOOP;
END $$;
