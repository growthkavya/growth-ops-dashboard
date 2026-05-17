-- ============================================================
-- INTERNS Migration v1 (17 May 2026)
--
-- Shared inbox model: ONE intern1@ssei.co.in Supabase login,
-- multiple humans behind it. Each human = one row in `interns`.
-- The frontend asks "Who is using this now?" after login.
--
-- Also adds:
--   - onboarding_templates (master checklist)
--   - onboarding_items (per-intern, cloned from templates)
--   - notifications (Kavya + Riya pinged when intern acts)
--   - intern_id FK on actions, ideas, daily_entries
-- ============================================================


-- 1. INTERNS table
CREATE TABLE IF NOT EXISTS public.interns (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    intern_code text UNIQUE NOT NULL,
    email_alias text,
    auth_user_id uuid REFERENCES public.profiles(id),
    supervisor_id uuid REFERENCES public.profiles(id),
    status text NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding', 'active', 'completed', 'archived')),
    start_date date,
    end_date date,
    tags text[],
    notes text,
    created_at timestamp with time zone DEFAULT timezone('utc', now()),
    updated_at timestamp with time zone DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_interns_auth_user_id ON public.interns(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_interns_supervisor ON public.interns(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_interns_status ON public.interns(status);


-- 2. ONBOARDING template (master)
CREATE TABLE IF NOT EXISTS public.onboarding_templates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    description text,
    category text,
    estimated_days integer,
    sort_order integer NOT NULL DEFAULT 100,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc', now())
);


-- 3. ONBOARDING items (per-intern, cloned from templates)
CREATE TABLE IF NOT EXISTS public.onboarding_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    intern_id uuid REFERENCES public.interns(id) ON DELETE CASCADE NOT NULL,
    template_id uuid REFERENCES public.onboarding_templates(id),
    title text NOT NULL,
    description text,
    category text,
    sort_order integer,
    status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done')),
    completed_at timestamp with time zone,
    completed_by_intern_id uuid REFERENCES public.interns(id),
    created_at timestamp with time zone DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_onboarding_items_intern ON public.onboarding_items(intern_id);


-- 4. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_id uuid REFERENCES public.profiles(id) NOT NULL,
    actor_id uuid REFERENCES public.profiles(id),
    actor_name text,
    intern_id uuid REFERENCES public.interns(id),
    intern_name text,
    event_type text NOT NULL,
    entity_type text,
    entity_id uuid,
    entity_title text,
    message text,
    link text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, is_read, created_at DESC);


-- 5. FK columns on existing tables
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS intern_id uuid REFERENCES public.interns(id);
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS intern_id uuid REFERENCES public.interns(id);
ALTER TABLE public.daily_entries ADD COLUMN IF NOT EXISTS intern_id uuid REFERENCES public.interns(id);

CREATE INDEX IF NOT EXISTS idx_actions_intern ON public.actions(intern_id);
CREATE INDEX IF NOT EXISTS idx_ideas_intern ON public.ideas(intern_id);
CREATE INDEX IF NOT EXISTS idx_daily_entries_intern ON public.daily_entries(intern_id);


-- 6. RLS
ALTER TABLE public.interns               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications         ENABLE ROW LEVEL SECURITY;

-- Drop any old policies dynamically
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname FROM pg_policies
        WHERE schemaname='public' AND tablename IN ('interns','onboarding_templates','onboarding_items','notifications')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- INTERNS
-- admin+member: read all; intern user: read interns tied to their shared auth_user_id
CREATE POLICY interns_select ON public.interns FOR SELECT USING (
    public.is_admin()
    OR public.current_user_role() = 'member'
    OR auth_user_id = auth.uid()
);
-- admin+member can create/edit/archive interns; intern can update notes on themselves (handled in app)
CREATE POLICY interns_insert ON public.interns FOR INSERT WITH CHECK (
    public.current_user_role() IN ('admin', 'member')
);
CREATE POLICY interns_update ON public.interns FOR UPDATE USING (
    public.current_user_role() IN ('admin', 'member')
);
CREATE POLICY interns_delete ON public.interns FOR DELETE USING (public.is_admin());

-- ONBOARDING_TEMPLATES — everyone reads; admin+member write
CREATE POLICY onboarding_templates_select ON public.onboarding_templates FOR SELECT USING (true);
CREATE POLICY onboarding_templates_modify ON public.onboarding_templates FOR ALL USING (
    public.current_user_role() IN ('admin', 'member')
);

-- ONBOARDING_ITEMS
-- admin+member: read+write all
-- intern: read+update items for interns tied to their shared auth_user_id
CREATE POLICY onboarding_items_select ON public.onboarding_items FOR SELECT USING (
    public.is_admin()
    OR public.current_user_role() = 'member'
    OR EXISTS (
        SELECT 1 FROM public.interns i
        WHERE i.id = onboarding_items.intern_id AND i.auth_user_id = auth.uid()
    )
);
CREATE POLICY onboarding_items_insert ON public.onboarding_items FOR INSERT WITH CHECK (
    public.current_user_role() IN ('admin', 'member')
    OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = onboarding_items.intern_id AND i.auth_user_id = auth.uid())
);
CREATE POLICY onboarding_items_update ON public.onboarding_items FOR UPDATE USING (
    public.is_admin()
    OR public.current_user_role() = 'member'
    OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = onboarding_items.intern_id AND i.auth_user_id = auth.uid())
);
CREATE POLICY onboarding_items_delete ON public.onboarding_items FOR DELETE USING (
    public.current_user_role() IN ('admin', 'member')
);

-- NOTIFICATIONS — each user sees their own; admin can see all
CREATE POLICY notifications_select ON public.notifications FOR SELECT USING (
    public.is_admin() OR recipient_id = auth.uid()
);
CREATE POLICY notifications_insert ON public.notifications FOR INSERT WITH CHECK (true);  -- anyone can write a notification (server-side trusted)
CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING (
    recipient_id = auth.uid()
);
CREATE POLICY notifications_delete ON public.notifications FOR DELETE USING (
    recipient_id = auth.uid() OR public.is_admin()
);


-- 7. Update existing ACTIONS RLS so interns see actions linked to their interns OR assigned to them
-- (Drop the v1 RBAC select policy and recreate broader)
DROP POLICY IF EXISTS "actions_select_policy" ON public.actions;
CREATE POLICY "actions_select_policy" ON public.actions FOR SELECT USING (
    public.is_admin()
    OR owner_name = public.current_member_key()
    OR assigned_by = auth.uid()
    OR (
        public.current_user_role() = 'intern'
        AND intern_id IN (
            SELECT id FROM public.interns WHERE auth_user_id = auth.uid()
        )
    )
);

-- Interns can update status on their own actions
DROP POLICY IF EXISTS "actions_update_policy" ON public.actions;
CREATE POLICY "actions_update_policy" ON public.actions FOR UPDATE USING (
    public.is_admin()
    OR owner_name = public.current_member_key()
    OR assigned_by = auth.uid()
    OR (
        public.current_user_role() = 'intern'
        AND intern_id IN (
            SELECT id FROM public.interns WHERE auth_user_id = auth.uid()
        )
    )
);


-- 8. Verify
DO $$
BEGIN
    RAISE NOTICE 'Interns migration v1 complete.';
    RAISE NOTICE 'Tables added: interns, onboarding_templates, onboarding_items, notifications';
    RAISE NOTICE 'FK added: actions.intern_id, ideas.intern_id, daily_entries.intern_id';
END $$;
