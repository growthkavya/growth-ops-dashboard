-- ============================================================
-- GROWTH LAB DASHBOARD — Migration v3 (21 May 2026)
-- Wave 2: 1:1 records, perf reviews, comment threads, task templates,
-- admin audit on task/idea/kra.
-- Safe to run on top of v1 + v2. All IF NOT EXISTS.
-- ============================================================

-- ============ 1:1 Records ============
CREATE TABLE IF NOT EXISTS public.gl_one_on_one (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES public.interns(id) ON DELETE CASCADE,
    rm_id uuid REFERENCES public.profiles(id),
    meeting_date date NOT NULL DEFAULT CURRENT_DATE,
    duration_minutes int DEFAULT 30,
    discussion_notes text,
    intern_priorities text,           -- what intern wants to discuss
    rm_feedback text,                 -- RM's feedback this week
    blockers_raised text,
    action_items text,                -- agreed next steps
    intern_mood text CHECK (intern_mood IN ('great','good','ok','struggling','stuck')),
    created_by_id uuid REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_gl_oo_intern_date ON public.gl_one_on_one(intern_id, meeting_date DESC);

-- ============ Quarterly Performance Review ============
CREATE TABLE IF NOT EXISTS public.gl_perf_review (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES public.interns(id) ON DELETE CASCADE,
    rm_id uuid REFERENCES public.profiles(id),
    review_period text NOT NULL,      -- 'Q1-2026', 'Mid-Year', 'End-of-Internship'
    overall_rating int CHECK (overall_rating BETWEEN 1 AND 5),
    strengths text,
    areas_to_improve text,
    achievements text,
    growth_areas text,
    intern_self_review text,
    rm_summary text,
    promotion_recommendation text CHECK (promotion_recommendation IN ('strong_yes','yes','neutral','no','strong_no')),
    next_period_focus text,
    intern_acknowledged_at timestamptz,
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now()),
    UNIQUE (intern_id, review_period)
);
CREATE INDEX IF NOT EXISTS idx_gl_pr_intern ON public.gl_perf_review(intern_id, created_at DESC);

-- ============ Task templates ============
CREATE TABLE IF NOT EXISTS public.gl_task_template (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id uuid REFERENCES public.profiles(id),   -- who created it
    vertical text,                                   -- 'growth_ops' | 'performance' | etc | NULL=global
    title text NOT NULL,
    description text,
    default_task_type text DEFAULT 'weekly' CHECK (default_task_type IN ('daily','weekly')),
    default_priority text DEFAULT 'med' CHECK (default_priority IN ('low','med','high')),
    default_days_to_due int DEFAULT 7,
    use_count int DEFAULT 0,                         -- analytics: how often used
    is_archived boolean DEFAULT false,
    created_at timestamptz DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_gl_tt_owner ON public.gl_task_template(owner_id, is_archived);

-- ============ Generic comment thread ============
CREATE TABLE IF NOT EXISTS public.gl_comment (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    entity_type text NOT NULL CHECK (entity_type IN ('task','idea','checkin','attendance','review','one_on_one','kra','kpi')),
    entity_id uuid NOT NULL,
    intern_id uuid REFERENCES public.interns(id) ON DELETE CASCADE,  -- the intern this entity belongs to (for RLS)
    author_id uuid REFERENCES public.profiles(id),
    author_name text,
    author_role text,
    body text NOT NULL,
    created_at timestamptz DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_gl_comment_entity ON public.gl_comment(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gl_comment_intern ON public.gl_comment(intern_id);

-- ============ Admin actions audit (on task/idea/kra/kpi) ============
CREATE TABLE IF NOT EXISTS public.gl_admin_audit (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    entity_table text NOT NULL,
    entity_id uuid NOT NULL,
    intern_id uuid REFERENCES public.interns(id) ON DELETE SET NULL,
    actor_id uuid REFERENCES public.profiles(id),
    actor_name text,
    action text NOT NULL,
    before_json jsonb,
    after_json jsonb,
    created_at timestamptz DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_gl_aa_entity ON public.gl_admin_audit(entity_table, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gl_aa_actor ON public.gl_admin_audit(actor_id, created_at DESC);

-- updated_at triggers for new tables
DO $$ DECLARE t text;
BEGIN
    FOR t IN VALUES ('gl_one_on_one'),('gl_perf_review') LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON public.%I', t, t);
        EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.gl_touch_updated_at()', t, t);
    END LOOP;
END $$;

-- ============ Admin audit triggers — generic helper ============
CREATE OR REPLACE FUNCTION public.gl_admin_audit_fn()
RETURNS trigger AS $$
DECLARE
    actor_uid uuid;
    actor_nm text;
    target_intern uuid;
    act text;
BEGIN
    actor_uid := auth.uid();
    BEGIN SELECT full_name INTO actor_nm FROM public.profiles WHERE id = actor_uid LIMIT 1;
    EXCEPTION WHEN OTHERS THEN actor_nm := NULL; END;
    target_intern := COALESCE(NEW.intern_id, OLD.intern_id);
    IF TG_OP = 'INSERT' THEN act := 'create';
    ELSIF TG_OP = 'UPDATE' THEN act := 'update';
    ELSIF TG_OP = 'DELETE' THEN act := 'delete';
    END IF;
    INSERT INTO public.gl_admin_audit (entity_table, entity_id, intern_id, actor_id, actor_name, action, before_json, after_json)
        VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), target_intern, actor_uid, actor_nm, act,
                CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
                CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ DECLARE t text;
BEGIN
    FOR t IN VALUES ('gl_task'),('gl_idea'),('gl_kra'),('gl_kpi'),('gl_one_on_one'),('gl_perf_review') LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I_audit ON public.%I', t, t);
        EXECUTE format('CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.gl_admin_audit_fn()', t, t);
    END LOOP;
END $$;

-- ============ Comment notification: notify the OTHER party ============
CREATE OR REPLACE FUNCTION public.gl_comment_notify_fn()
RETURNS trigger AS $$
DECLARE
    intern_auth_id uuid;
    intern_nm text;
    sup_id uuid;
    target_id uuid;
BEGIN
    SELECT auth_user_id, supervisor_id, name INTO intern_auth_id, sup_id, intern_nm
    FROM public.interns WHERE id = NEW.intern_id;
    -- Notify the opposite party: if author is RM (or admin), notify intern's shared auth user
    IF NEW.author_id = sup_id OR NEW.author_role IN ('admin','member') THEN
        target_id := intern_auth_id;
    ELSE
        target_id := sup_id;
    END IF;
    IF target_id IS NOT NULL AND target_id != NEW.author_id THEN
        INSERT INTO public.gl_notification (recipient_id, actor_id, actor_name, intern_id, intern_name, event_type, message, link)
            VALUES (target_id, NEW.author_id, NEW.author_name, NEW.intern_id, intern_nm, 'comment_posted',
                COALESCE(NEW.author_name, 'Someone') || ' commented on ' || NEW.entity_type || ': ' || LEFT(NEW.body, 80), '#' || NEW.entity_type);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS gl_comment_notify ON public.gl_comment;
CREATE TRIGGER gl_comment_notify AFTER INSERT ON public.gl_comment FOR EACH ROW EXECUTE FUNCTION public.gl_comment_notify_fn();

-- ============ RLS ============
ALTER TABLE public.gl_one_on_one     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_perf_review    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_task_template  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_comment        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_admin_audit    ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE r RECORD;
BEGIN FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN
    ('gl_one_on_one','gl_perf_review','gl_task_template','gl_comment','gl_admin_audit') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
END LOOP; END $$;

-- 1:1: intern + their RM + admin
CREATE POLICY gl_oo_select ON public.gl_one_on_one FOR SELECT USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_one_on_one.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_oo_insert ON public.gl_one_on_one FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_one_on_one.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_oo_update ON public.gl_one_on_one FOR UPDATE USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_one_on_one.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_oo_delete ON public.gl_one_on_one FOR DELETE USING (public.is_admin());

-- Perf Review: intern + their RM + admin
CREATE POLICY gl_pr_select ON public.gl_perf_review FOR SELECT USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_perf_review.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_pr_insert ON public.gl_perf_review FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_perf_review.intern_id
        AND i.supervisor_id = auth.uid()));
CREATE POLICY gl_pr_update ON public.gl_perf_review FOR UPDATE USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_perf_review.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_pr_delete ON public.gl_perf_review FOR DELETE USING (public.is_admin());

-- Task templates: owner + admin + members can read all (so they can share)
CREATE POLICY gl_tt_select ON public.gl_task_template FOR SELECT USING (
    public.is_admin() OR public.current_user_role() IN ('admin','member')
);
CREATE POLICY gl_tt_insert ON public.gl_task_template FOR INSERT WITH CHECK (
    public.current_user_role() IN ('admin','member')
);
CREATE POLICY gl_tt_update ON public.gl_task_template FOR UPDATE USING (
    public.is_admin() OR owner_id = auth.uid()
);
CREATE POLICY gl_tt_delete ON public.gl_task_template FOR DELETE USING (
    public.is_admin() OR owner_id = auth.uid()
);

-- Comments: intern + their RM + admin can read/write
CREATE POLICY gl_comment_select ON public.gl_comment FOR SELECT USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_comment.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_comment_insert ON public.gl_comment FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_comment.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_comment_update ON public.gl_comment FOR UPDATE USING (author_id = auth.uid() OR public.is_admin());
CREATE POLICY gl_comment_delete ON public.gl_comment FOR DELETE USING (author_id = auth.uid() OR public.is_admin());

-- Admin audit: admin only (read-only)
CREATE POLICY gl_aa_select ON public.gl_admin_audit FOR SELECT USING (public.is_admin());
CREATE POLICY gl_aa_insert ON public.gl_admin_audit FOR INSERT WITH CHECK (true);

DO $$ BEGIN RAISE NOTICE 'Growth Lab v3 complete: 1:1s, perf reviews, task templates, comments, admin audit.'; END $$;
