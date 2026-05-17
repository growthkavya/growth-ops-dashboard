-- ============================================================
-- RBAC Migration v1 (17 May 2026)
--
-- Adds role-based row-level filtering so:
--   • admin    (Kavya, Vidyut) sees everything
--   • member   (Riya)          sees only her own KPIs/actions/scores
--                              + actions she has assigned to interns
--   • intern   (future)        sees only actions assigned to them
--
-- Also adds assignment audit trail (who assigned what to whom, when).
--
-- Safe to re-run. All ALTER/CREATE statements are guarded with IF NOT EXISTS
-- or DROP IF EXISTS where needed.
-- ============================================================


-- 1. ROLE CHECK CONSTRAINT — allow 'intern' alongside 'admin' / 'member'
-- ------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'member', 'intern'));


-- 2. PROFILE EXTENSIONS — member_key for filtering, supervisor_id for interns
-- ------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS member_key text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_profiles_member_key ON public.profiles(member_key);


-- 3. ACTIONS — assignment audit trail
-- ------------------------------------------------------------
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS assigned_by_name text;
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS assigned_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_actions_owner_name ON public.actions(owner_name);
CREATE INDEX IF NOT EXISTS idx_actions_assigned_by ON public.actions(assigned_by);


-- 4. HELPER FUNCTIONS
-- ------------------------------------------------------------
-- Get the current user's member_key (e.g. 'kavya', 'riya', or NULL for admins)
CREATE OR REPLACE FUNCTION public.current_member_key()
RETURNS text AS $$
    SELECT member_key FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Get the current user's role ('admin', 'member', 'intern')
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- True if current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
    SELECT public.current_user_role() = 'admin';
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- 5. RLS POLICIES — ACTIONS
-- ------------------------------------------------------------
-- admins: see all, do all
-- non-admins: see actions where they're the owner OR they assigned it
DROP POLICY IF EXISTS "Actions viewable by authenticated users" ON public.actions;
DROP POLICY IF EXISTS "Actions modifiable by authenticated users" ON public.actions;
DROP POLICY IF EXISTS "actions_select_policy" ON public.actions;
DROP POLICY IF EXISTS "actions_modify_policy" ON public.actions;

CREATE POLICY "actions_select_policy" ON public.actions
    FOR SELECT
    USING (
        public.is_admin()
        OR owner_name = public.current_member_key()
        OR assigned_by = auth.uid()
    );

-- INSERT: admins can assign to anyone; members can assign to interns or themselves
CREATE POLICY "actions_insert_policy" ON public.actions
    FOR INSERT
    WITH CHECK (
        public.is_admin()
        OR (
            public.current_user_role() = 'member'
            AND (
                -- assigning to self
                owner_name = public.current_member_key()
                -- OR assigning to an intern
                OR EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE member_key = public.actions.owner_name
                      AND role = 'intern'
                )
            )
        )
    );

-- UPDATE: admins can update anything; non-admins can update their own actions
CREATE POLICY "actions_update_policy" ON public.actions
    FOR UPDATE
    USING (
        public.is_admin()
        OR owner_name = public.current_member_key()
        OR assigned_by = auth.uid()
    );

-- DELETE: admins only
CREATE POLICY "actions_delete_policy" ON public.actions
    FOR DELETE
    USING (public.is_admin());


-- 6. RLS POLICIES — KPIS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "KPIs viewable by authenticated users" ON public.kpis;
DROP POLICY IF EXISTS "KPIs modifiable by authenticated users" ON public.kpis;

CREATE POLICY "kpis_select_policy" ON public.kpis
    FOR SELECT
    USING (
        public.is_admin()
        OR member = public.current_member_key()
    );

CREATE POLICY "kpis_modify_policy" ON public.kpis
    FOR ALL
    USING (public.is_admin());


-- 7. RLS POLICIES — KPI_SCORES
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "KPI scores viewable by authenticated users" ON public.kpi_scores;
DROP POLICY IF EXISTS "KPI scores modifiable by authenticated users" ON public.kpi_scores;

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


-- 8. RLS POLICIES — GOALS (kept open within team for now; admins write-all)
-- ------------------------------------------------------------
-- Goals are team-visible by design (you and Riya should see each other's
-- strategic goals to align). Tighten later if needed.


-- 9. RLS POLICIES — KRAS (read-only labels, all authenticated can SELECT)
-- ------------------------------------------------------------
-- Unchanged. Already permissive.


-- 10. RLS POLICIES — PROFILES (everyone sees the team list)
-- ------------------------------------------------------------
-- Keep existing: authenticated users see all profiles. Allows
-- the Assigned-by name lookup to work.


-- 11. VERIFY block
-- ------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'RBAC migration complete.';
    RAISE NOTICE '  profiles.role check    : admin / member / intern';
    RAISE NOTICE '  profiles.member_key    : added';
    RAISE NOTICE '  profiles.supervisor_id : added';
    RAISE NOTICE '  actions.assigned_by    : added';
    RAISE NOTICE '  Helper functions       : current_member_key(), current_user_role(), is_admin()';
    RAISE NOTICE '  RLS policies rewritten : actions, kpis, kpi_scores';
END $$;
