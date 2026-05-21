-- ============================================================
-- GROWTH LAB DASHBOARD — Migration v2 (21 May 2026)
-- Complete schema for the intern OS. Supersedes v1.
-- Safe to run on a project that already had v1 applied
-- (everything is IF NOT EXISTS / idempotent).
--
-- Tables:
--   gl_attendance         (from v1)  attendance + approval
--   gl_attendance_audit   NEW        audit trail of edits
--   gl_daily_checkin      NEW        what done / learnt / blockers / tomorrow
--   gl_task               NEW        weekly + daily tasks
--   gl_kpi                NEW        per-intern monthly scorecards
--   gl_idea               NEW        ideas with RM decision
--   gl_learning           NEW        learnings log
--   gl_doc                NEW        docs shared by RM
--   gl_notification       NEW        in-app bell-icon events
-- ============================================================

-- ============ V1 RECAP (idempotent re-apply) ============
ALTER TABLE public.interns
    ADD COLUMN IF NOT EXISTS program text DEFAULT 'growth_ops';

CREATE TABLE IF NOT EXISTS public.gl_attendance (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES public.interns(id) ON DELETE CASCADE,
    attendance_date date NOT NULL,
    check_in_time timestamptz,
    check_out_time timestamptz,
    hours_worked numeric(4,2),
    status text NOT NULL DEFAULT 'present'
        CHECK (status IN ('present','half-day','absent','leave','wfh','sick')),
    daily_work_summary text,
    approval_status text NOT NULL DEFAULT 'pending'
        CHECK (approval_status IN ('pending','approved','rejected')),
    approved_by_id uuid REFERENCES public.profiles(id),
    approved_at timestamptz,
    rm_remarks text,
    last_edited_by_id uuid REFERENCES public.profiles(id),
    last_edited_at timestamptz,
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now()),
    UNIQUE (intern_id, attendance_date)
);

-- Ensure new "last edited by" cols exist if v1 was already applied
ALTER TABLE public.gl_attendance ADD COLUMN IF NOT EXISTS last_edited_by_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.gl_attendance ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_gl_attendance_intern_date ON public.gl_attendance(intern_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_gl_attendance_pending ON public.gl_attendance(approval_status) WHERE approval_status='pending';

-- ============ Attendance audit trail ============
CREATE TABLE IF NOT EXISTS public.gl_attendance_audit (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    attendance_id uuid NOT NULL REFERENCES public.gl_attendance(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES public.profiles(id),
    actor_name text,
    action text NOT NULL,                 -- 'check_in' | 'check_out' | 'edit' | 'approve' | 'reject' | 'rm_override'
    before_json jsonb,
    after_json jsonb,
    note text,
    created_at timestamptz DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_gl_attendance_audit_att ON public.gl_attendance_audit(attendance_id, created_at DESC);

-- ============ Daily Check-in ============
CREATE TABLE IF NOT EXISTS public.gl_daily_checkin (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES public.interns(id) ON DELETE CASCADE,
    checkin_date date NOT NULL,
    what_done text,
    what_learnt text,
    blockers text,
    tomorrow_plan text,
    hours_spent numeric(4,2),
    linked_doc text,
    rm_acknowledged boolean DEFAULT false,
    rm_acknowledged_at timestamptz,
    rm_comment text,
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now()),
    UNIQUE (intern_id, checkin_date)
);
CREATE INDEX IF NOT EXISTS idx_gl_dc_intern_date ON public.gl_daily_checkin(intern_id, checkin_date DESC);

-- ============ Tasks (weekly + daily) ============
CREATE TABLE IF NOT EXISTS public.gl_task (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES public.interns(id) ON DELETE CASCADE,
    assigned_by_id uuid REFERENCES public.profiles(id),
    task_type text NOT NULL CHECK (task_type IN ('daily','weekly')),
    title text NOT NULL,
    description text,
    week_of date,                         -- Monday of the week if weekly
    due_date date,
    priority text DEFAULT 'med' CHECK (priority IN ('low','med','high')),
    status text NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started','in_progress','blocked','done','cancelled')),
    percent_done int DEFAULT 0 CHECK (percent_done BETWEEN 0 AND 100),
    output_link text,
    rm_remarks text,
    done_at timestamptz,
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_gl_task_intern_status ON public.gl_task(intern_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_gl_task_due ON public.gl_task(due_date) WHERE status NOT IN ('done','cancelled');

-- ============ KRAs (high-level monthly goals) ============
CREATE TABLE IF NOT EXISTS public.gl_kra (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES public.interns(id) ON DELETE CASCADE,
    period_month date NOT NULL,           -- first of month
    kra_index int NOT NULL CHECK (kra_index BETWEEN 1 AND 5),
    title text NOT NULL,
    description text,
    target_outcome text,
    progress_notes text,
    status text NOT NULL DEFAULT 'on_track'
        CHECK (status IN ('on_track','at_risk','behind','done','dropped')),
    percent_done int DEFAULT 0 CHECK (percent_done BETWEEN 0 AND 100),
    rm_comments text,
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now()),
    UNIQUE (intern_id, period_month, kra_index)
);
CREATE INDEX IF NOT EXISTS idx_gl_kra_intern_month ON public.gl_kra(intern_id, period_month);

-- ============ KPIs (measurable, feed into KRAs) ============
CREATE TABLE IF NOT EXISTS public.gl_kpi (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES public.interns(id) ON DELETE CASCADE,
    period_month date NOT NULL,           -- first of month, e.g. 2026-05-01
    kpi_index int NOT NULL CHECK (kpi_index BETWEEN 1 AND 5),
    label text NOT NULL,
    kra_index int CHECK (kra_index BETWEEN 1 AND 5),  -- which KRA this KPI rolls up to (optional)
    target text,
    actual text,
    rm_score int CHECK (rm_score BETWEEN 1 AND 5),
    rm_comments text,
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now()),
    UNIQUE (intern_id, period_month, kpi_index)
);
CREATE INDEX IF NOT EXISTS idx_gl_kpi_intern_month ON public.gl_kpi(intern_id, period_month);

-- ============ Ideas ============
CREATE TABLE IF NOT EXISTS public.gl_idea (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES public.interns(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    why_matters text,
    estimated_effort text,
    status text NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','under_review','approved','rejected','parked')),
    decided_by_id uuid REFERENCES public.profiles(id),
    decision_notes text,
    decided_at timestamptz,
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_gl_idea_intern ON public.gl_idea(intern_id, created_at DESC);

-- ============ Learnings ============
CREATE TABLE IF NOT EXISTS public.gl_learning (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES public.interns(id) ON DELETE CASCADE,
    learning_date date NOT NULL DEFAULT CURRENT_DATE,
    what_learnt text NOT NULL,
    category text DEFAULT 'general'      -- tools, frameworks, domain, soft_skills, technical, general
        CHECK (category IN ('tools','frameworks','domain','soft_skills','technical','general')),
    source text,                          -- book, video, work, mentor, internet, general
    how_to_apply text,
    linked_doc text,
    created_at timestamptz DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_gl_learn_intern ON public.gl_learning(intern_id, learning_date DESC);
-- For idempotency if v2 was already applied without category
ALTER TABLE public.gl_learning ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';

-- ============ Docs shared by RM ============
CREATE TABLE IF NOT EXISTS public.gl_doc (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    shared_by_id uuid REFERENCES public.profiles(id),
    -- audience: either a single intern, or a team-wide share via vertical
    intern_id uuid REFERENCES public.interns(id) ON DELETE CASCADE,
    vertical text,                        -- 'growth_ops' | 'performance' | 'organic' | 'product_content' | 'all'
    title text NOT NULL,
    drive_link text,
    doc_type text DEFAULT 'reference'
        CHECK (doc_type IN ('brief','sop','reference','reading','template','other')),
    notes text,
    created_at timestamptz DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_gl_doc_intern ON public.gl_doc(intern_id);
CREATE INDEX IF NOT EXISTS idx_gl_doc_vertical ON public.gl_doc(vertical);

CREATE TABLE IF NOT EXISTS public.gl_doc_ack (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    doc_id uuid NOT NULL REFERENCES public.gl_doc(id) ON DELETE CASCADE,
    intern_id uuid NOT NULL REFERENCES public.interns(id) ON DELETE CASCADE,
    acknowledged_at timestamptz DEFAULT timezone('utc', now()),
    UNIQUE (doc_id, intern_id)
);

-- ============ Notifications ============
CREATE TABLE IF NOT EXISTS public.gl_notification (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_id uuid NOT NULL REFERENCES public.profiles(id),
    actor_id uuid REFERENCES public.profiles(id),
    actor_name text,
    intern_id uuid REFERENCES public.interns(id),
    intern_name text,
    event_type text NOT NULL,             -- 'attendance_submitted' | 'attendance_approved' | 'attendance_rejected'
                                          -- | 'task_assigned' | 'task_completed' | 'idea_submitted' | 'idea_decided'
                                          -- | 'checkin_submitted' | 'doc_shared'
    message text,
    link text,
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_gl_notif_recipient ON public.gl_notification(recipient_id, is_read, created_at DESC);

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public.gl_touch_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
    FOR t IN VALUES ('gl_attendance'),('gl_daily_checkin'),('gl_task'),('gl_kra'),('gl_kpi'),('gl_idea')
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON public.%I', t, t);
        EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.gl_touch_updated_at()', t, t);
    END LOOP;
END $$;

-- ============ Attendance audit trigger ============
CREATE OR REPLACE FUNCTION public.gl_attendance_audit_trg()
RETURNS trigger AS $$
DECLARE
    actor_uid uuid;
    actor text;
BEGIN
    actor_uid := auth.uid();
    BEGIN
        SELECT full_name INTO actor FROM public.profiles WHERE id = actor_uid LIMIT 1;
    EXCEPTION WHEN OTHERS THEN actor := NULL; END;
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.gl_attendance_audit (attendance_id, actor_id, actor_name, action, after_json)
            VALUES (NEW.id, actor_uid, actor, 'check_in', to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NEW.approval_status = 'approved' THEN
            INSERT INTO public.gl_attendance_audit (attendance_id, actor_id, actor_name, action, before_json, after_json, note)
                VALUES (NEW.id, actor_uid, actor, 'approve', to_jsonb(OLD), to_jsonb(NEW), NEW.rm_remarks);
        ELSIF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NEW.approval_status = 'rejected' THEN
            INSERT INTO public.gl_attendance_audit (attendance_id, actor_id, actor_name, action, before_json, after_json, note)
                VALUES (NEW.id, actor_uid, actor, 'reject', to_jsonb(OLD), to_jsonb(NEW), NEW.rm_remarks);
        ELSIF OLD.check_out_time IS NULL AND NEW.check_out_time IS NOT NULL THEN
            INSERT INTO public.gl_attendance_audit (attendance_id, actor_id, actor_name, action, before_json, after_json)
                VALUES (NEW.id, actor_uid, actor, 'check_out', to_jsonb(OLD), to_jsonb(NEW));
        ELSE
            INSERT INTO public.gl_attendance_audit (attendance_id, actor_id, actor_name, action, before_json, after_json)
                VALUES (NEW.id, actor_uid, actor, 'edit', to_jsonb(OLD), to_jsonb(NEW));
            UPDATE public.gl_attendance SET last_edited_by_id = actor_uid, last_edited_at = timezone('utc', now())
                WHERE id = NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS gl_attendance_audit_trg ON public.gl_attendance;
CREATE TRIGGER gl_attendance_audit_trg
    AFTER INSERT OR UPDATE ON public.gl_attendance
    FOR EACH ROW EXECUTE FUNCTION public.gl_attendance_audit_trg();

-- ============ Notification helper functions ============
-- Notify the RM (supervisor) when an intern submits something
CREATE OR REPLACE FUNCTION public.gl_notify_rm_on_attendance()
RETURNS trigger AS $$
DECLARE
    sup_id uuid;
    intern_nm text;
    actor text;
BEGIN
    SELECT supervisor_id, name INTO sup_id, intern_nm FROM public.interns WHERE id = NEW.intern_id;
    SELECT full_name INTO actor FROM public.profiles WHERE id = auth.uid();
    IF sup_id IS NOT NULL THEN
        IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.check_out_time IS NULL AND NEW.check_out_time IS NOT NULL) THEN
            INSERT INTO public.gl_notification (recipient_id, actor_id, actor_name, intern_id, intern_name, event_type, message, link)
                VALUES (sup_id, auth.uid(), actor, NEW.intern_id, intern_nm,
                    CASE WHEN TG_OP='INSERT' THEN 'attendance_submitted' ELSE 'attendance_checked_out' END,
                    intern_nm || (CASE WHEN TG_OP='INSERT' THEN ' checked in for ' ELSE ' checked out for ' END) || NEW.attendance_date::text,
                    '#approvals');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS gl_notify_rm_on_attendance ON public.gl_attendance;
CREATE TRIGGER gl_notify_rm_on_attendance AFTER INSERT OR UPDATE ON public.gl_attendance
    FOR EACH ROW EXECUTE FUNCTION public.gl_notify_rm_on_attendance();

-- Notify intern when RM approves/rejects
CREATE OR REPLACE FUNCTION public.gl_notify_intern_on_approval()
RETURNS trigger AS $$
DECLARE
    intern_auth_id uuid;
    intern_nm text;
    actor text;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.approval_status IN ('approved','rejected') AND NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
        SELECT auth_user_id, name INTO intern_auth_id, intern_nm FROM public.interns WHERE id = NEW.intern_id;
        SELECT full_name INTO actor FROM public.profiles WHERE id = auth.uid();
        IF intern_auth_id IS NOT NULL THEN
            INSERT INTO public.gl_notification (recipient_id, actor_id, actor_name, intern_id, intern_name, event_type, message, link)
                VALUES (intern_auth_id, auth.uid(), actor, NEW.intern_id, intern_nm,
                    CASE WHEN NEW.approval_status='approved' THEN 'attendance_approved' ELSE 'attendance_rejected' END,
                    'Attendance for ' || NEW.attendance_date::text || ' ' || NEW.approval_status ||
                    COALESCE(' — ' || NEW.rm_remarks, ''),
                    '#attendance');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS gl_notify_intern_on_approval ON public.gl_attendance;
CREATE TRIGGER gl_notify_intern_on_approval AFTER UPDATE ON public.gl_attendance
    FOR EACH ROW EXECUTE FUNCTION public.gl_notify_intern_on_approval();

-- Notify intern when RM assigns task
CREATE OR REPLACE FUNCTION public.gl_notify_intern_on_task()
RETURNS trigger AS $$
DECLARE
    intern_auth_id uuid;
    intern_nm text;
    actor text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT auth_user_id, name INTO intern_auth_id, intern_nm FROM public.interns WHERE id = NEW.intern_id;
        SELECT full_name INTO actor FROM public.profiles WHERE id = auth.uid();
        IF intern_auth_id IS NOT NULL THEN
            INSERT INTO public.gl_notification (recipient_id, actor_id, actor_name, intern_id, intern_name, event_type, message, link)
                VALUES (intern_auth_id, auth.uid(), actor, NEW.intern_id, intern_nm, 'task_assigned',
                    COALESCE(actor, 'RM') || ' assigned: ' || NEW.title, '#tasks');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS gl_notify_intern_on_task ON public.gl_task;
CREATE TRIGGER gl_notify_intern_on_task AFTER INSERT ON public.gl_task
    FOR EACH ROW EXECUTE FUNCTION public.gl_notify_intern_on_task();

-- Notify RM when intern completes a task
CREATE OR REPLACE FUNCTION public.gl_notify_rm_on_task_done()
RETURNS trigger AS $$
DECLARE sup_id uuid; intern_nm text;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
        SELECT supervisor_id, name INTO sup_id, intern_nm FROM public.interns WHERE id = NEW.intern_id;
        IF sup_id IS NOT NULL THEN
            INSERT INTO public.gl_notification (recipient_id, intern_id, intern_name, event_type, message, link)
                VALUES (sup_id, NEW.intern_id, intern_nm, 'task_completed',
                    intern_nm || ' completed: ' || NEW.title, '#tasks');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS gl_notify_rm_on_task_done ON public.gl_task;
CREATE TRIGGER gl_notify_rm_on_task_done AFTER UPDATE ON public.gl_task
    FOR EACH ROW EXECUTE FUNCTION public.gl_notify_rm_on_task_done();

-- Notify RM when intern submits idea or learning or daily check-in
CREATE OR REPLACE FUNCTION public.gl_notify_rm_on_submission()
RETURNS trigger AS $$
DECLARE sup_id uuid; intern_nm text; evt text; msg text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT supervisor_id, name INTO sup_id, intern_nm FROM public.interns WHERE id = NEW.intern_id;
        IF sup_id IS NULL THEN RETURN NEW; END IF;
        IF TG_TABLE_NAME = 'gl_idea' THEN
            evt := 'idea_submitted';
            msg := intern_nm || ' submitted an idea: ' || NEW.title;
            INSERT INTO public.gl_notification (recipient_id, intern_id, intern_name, event_type, message, link)
                VALUES (sup_id, NEW.intern_id, intern_nm, evt, msg, '#ideas');
        ELSIF TG_TABLE_NAME = 'gl_learning' THEN
            evt := 'learning_submitted';
            msg := intern_nm || ' logged a learning: ' || LEFT(NEW.what_learnt, 60);
            INSERT INTO public.gl_notification (recipient_id, intern_id, intern_name, event_type, message, link)
                VALUES (sup_id, NEW.intern_id, intern_nm, evt, msg, '#submissions');
        ELSIF TG_TABLE_NAME = 'gl_daily_checkin' THEN
            evt := 'checkin_submitted';
            msg := intern_nm || ' submitted daily check-in for ' || NEW.checkin_date::text;
            INSERT INTO public.gl_notification (recipient_id, intern_id, intern_name, event_type, message, link)
                VALUES (sup_id, NEW.intern_id, intern_nm, evt, msg, '#daily-logs');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS gl_notify_rm_on_idea ON public.gl_idea;
CREATE TRIGGER gl_notify_rm_on_idea AFTER INSERT ON public.gl_idea
    FOR EACH ROW EXECUTE FUNCTION public.gl_notify_rm_on_submission();
DROP TRIGGER IF EXISTS gl_notify_rm_on_learning ON public.gl_learning;
CREATE TRIGGER gl_notify_rm_on_learning AFTER INSERT ON public.gl_learning
    FOR EACH ROW EXECUTE FUNCTION public.gl_notify_rm_on_submission();
DROP TRIGGER IF EXISTS gl_notify_rm_on_checkin ON public.gl_daily_checkin;
CREATE TRIGGER gl_notify_rm_on_checkin AFTER INSERT ON public.gl_daily_checkin
    FOR EACH ROW EXECUTE FUNCTION public.gl_notify_rm_on_submission();

-- Notify intern when doc is shared
CREATE OR REPLACE FUNCTION public.gl_notify_intern_on_doc()
RETURNS trigger AS $$
DECLARE r record; actor text;
BEGIN
    SELECT full_name INTO actor FROM public.profiles WHERE id = auth.uid();
    IF NEW.intern_id IS NOT NULL THEN
        -- Direct share
        FOR r IN SELECT auth_user_id, name FROM public.interns WHERE id = NEW.intern_id
        LOOP
            IF r.auth_user_id IS NOT NULL THEN
                INSERT INTO public.gl_notification (recipient_id, actor_id, actor_name, intern_id, intern_name, event_type, message, link)
                    VALUES (r.auth_user_id, auth.uid(), actor, NEW.intern_id, r.name, 'doc_shared',
                        COALESCE(actor,'RM') || ' shared: ' || NEW.title, '#docs');
            END IF;
        END LOOP;
    ELSIF NEW.vertical IS NOT NULL THEN
        -- Team share
        FOR r IN SELECT auth_user_id, name, id FROM public.interns
                 WHERE tags @> ARRAY[NEW.vertical]::text[] AND status = 'active' AND tags @> ARRAY['growth_lab']::text[]
        LOOP
            IF r.auth_user_id IS NOT NULL THEN
                INSERT INTO public.gl_notification (recipient_id, actor_id, actor_name, intern_id, intern_name, event_type, message, link)
                    VALUES (r.auth_user_id, auth.uid(), actor, r.id, r.name, 'doc_shared',
                        COALESCE(actor,'RM') || ' shared with team: ' || NEW.title, '#docs');
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS gl_notify_intern_on_doc ON public.gl_doc;
CREATE TRIGGER gl_notify_intern_on_doc AFTER INSERT ON public.gl_doc
    FOR EACH ROW EXECUTE FUNCTION public.gl_notify_intern_on_doc();

-- ============ Activity feed view (chronological) ============
CREATE OR REPLACE VIEW public.gl_activity_feed AS
SELECT 'attendance' AS source, id, intern_id, attendance_date AS event_date, created_at,
    ('Attendance ' || approval_status) AS title, daily_work_summary AS body
    FROM public.gl_attendance
UNION ALL
SELECT 'checkin', id, intern_id, checkin_date, created_at, 'Daily check-in', LEFT(what_done, 140) FROM public.gl_daily_checkin
UNION ALL
SELECT 'task', id, intern_id, COALESCE(due_date, week_of, created_at::date), created_at, ('Task: ' || title), description FROM public.gl_task
UNION ALL
SELECT 'idea', id, intern_id, created_at::date, created_at, ('Idea: ' || title), description FROM public.gl_idea
UNION ALL
SELECT 'learning', id, intern_id, learning_date, created_at, 'Learning logged', what_learnt FROM public.gl_learning
UNION ALL
SELECT 'doc', id, intern_id, created_at::date, created_at, ('Doc shared: ' || title), notes FROM public.gl_doc;

-- ============ RLS — apply same pattern as gl_attendance ============
DO $$
DECLARE t text;
BEGIN
    FOR t IN VALUES ('gl_attendance'),('gl_attendance_audit'),('gl_daily_checkin'),('gl_task'),
                    ('gl_kra'),('gl_kpi'),('gl_idea'),('gl_learning'),('gl_doc'),('gl_doc_ack'),('gl_notification')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        FOR t IN
            SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t
        LOOP
            -- (no-op; the inner loop name shadows — handled below explicitly)
        END LOOP;
    END LOOP;
END $$;

-- Drop & recreate every policy idempotently
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT policyname, tablename FROM pg_policies
        WHERE schemaname='public'
          AND tablename IN ('gl_attendance','gl_attendance_audit','gl_daily_checkin','gl_task',
                            'gl_kra','gl_kpi','gl_idea','gl_learning','gl_doc','gl_doc_ack','gl_notification')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- ============ gl_attendance policies ============
CREATE POLICY gl_attendance_select ON public.gl_attendance FOR SELECT USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_attendance.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_attendance_insert ON public.gl_attendance FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_attendance.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_attendance_update ON public.gl_attendance FOR UPDATE USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_attendance.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_attendance_delete ON public.gl_attendance FOR DELETE USING (public.is_admin());

-- ============ gl_attendance_audit policies — read-only to interested parties ============
CREATE POLICY gl_audit_select ON public.gl_attendance_audit FOR SELECT USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.gl_attendance a JOIN public.interns i ON i.id=a.intern_id
        WHERE a.id = gl_attendance_audit.attendance_id AND (i.supervisor_id=auth.uid() OR i.auth_user_id=auth.uid())));
CREATE POLICY gl_audit_insert ON public.gl_attendance_audit FOR INSERT WITH CHECK (true);  -- triggers only

-- ============ Generic "intern-scoped" policy macro applied to remaining tables ============
-- Pattern: admin OR (intern's supervisor) OR (intern's auth_user)
CREATE POLICY gl_dc_select ON public.gl_daily_checkin FOR SELECT USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_daily_checkin.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_dc_insert ON public.gl_daily_checkin FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_daily_checkin.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_dc_update ON public.gl_daily_checkin FOR UPDATE USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_daily_checkin.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_dc_delete ON public.gl_daily_checkin FOR DELETE USING (public.is_admin());

CREATE POLICY gl_task_select ON public.gl_task FOR SELECT USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_task.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_task_insert ON public.gl_task FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_task.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_task_update ON public.gl_task FOR UPDATE USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_task.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_task_delete ON public.gl_task FOR DELETE USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_task.intern_id
        AND i.supervisor_id = auth.uid()));

CREATE POLICY gl_kra_select ON public.gl_kra FOR SELECT USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_kra.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_kra_insert ON public.gl_kra FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_kra.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_kra_update ON public.gl_kra FOR UPDATE USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_kra.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_kra_delete ON public.gl_kra FOR DELETE USING (public.is_admin());

CREATE POLICY gl_kpi_select ON public.gl_kpi FOR SELECT USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_kpi.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_kpi_insert ON public.gl_kpi FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_kpi.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_kpi_update ON public.gl_kpi FOR UPDATE USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_kpi.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_kpi_delete ON public.gl_kpi FOR DELETE USING (public.is_admin());

CREATE POLICY gl_idea_select ON public.gl_idea FOR SELECT USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_idea.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_idea_insert ON public.gl_idea FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_idea.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_idea_update ON public.gl_idea FOR UPDATE USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_idea.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_idea_delete ON public.gl_idea FOR DELETE USING (public.is_admin());

CREATE POLICY gl_learn_select ON public.gl_learning FOR SELECT USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_learning.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_learn_insert ON public.gl_learning FOR INSERT WITH CHECK (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_learning.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_learn_update ON public.gl_learning FOR UPDATE USING (
    public.is_admin() OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_learning.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())));
CREATE POLICY gl_learn_delete ON public.gl_learning FOR DELETE USING (public.is_admin());

-- gl_doc: shared with one intern OR one vertical
CREATE POLICY gl_doc_select ON public.gl_doc FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_doc.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid()))
    OR (gl_doc.vertical IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.interns i WHERE i.tags @> ARRAY[gl_doc.vertical]::text[]
            AND i.tags @> ARRAY['growth_lab']::text[]
            AND (i.auth_user_id = auth.uid() OR i.supervisor_id = auth.uid())
    ))
    OR shared_by_id = auth.uid()
);
CREATE POLICY gl_doc_insert ON public.gl_doc FOR INSERT WITH CHECK (
    public.is_admin() OR (public.current_user_role() IN ('admin','member'))
);
CREATE POLICY gl_doc_update ON public.gl_doc FOR UPDATE USING (
    public.is_admin() OR shared_by_id = auth.uid()
);
CREATE POLICY gl_doc_delete ON public.gl_doc FOR DELETE USING (
    public.is_admin() OR shared_by_id = auth.uid()
);

CREATE POLICY gl_doc_ack_select ON public.gl_doc_ack FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_doc_ack.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid()))
);
CREATE POLICY gl_doc_ack_insert ON public.gl_doc_ack FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_doc_ack.intern_id
        AND i.auth_user_id = auth.uid())
);
CREATE POLICY gl_doc_ack_delete ON public.gl_doc_ack FOR DELETE USING (public.is_admin());

-- gl_notification: each user sees their own
CREATE POLICY gl_notif_select ON public.gl_notification FOR SELECT USING (
    public.is_admin() OR recipient_id = auth.uid()
);
CREATE POLICY gl_notif_insert ON public.gl_notification FOR INSERT WITH CHECK (true);
CREATE POLICY gl_notif_update ON public.gl_notification FOR UPDATE USING (recipient_id = auth.uid());
CREATE POLICY gl_notif_delete ON public.gl_notification FOR DELETE USING (recipient_id = auth.uid() OR public.is_admin());

-- ============ Done ============
DO $$
BEGIN
    RAISE NOTICE 'Growth Lab migration v2 complete.';
    RAISE NOTICE '  + tables: gl_attendance, gl_attendance_audit, gl_daily_checkin, gl_task, gl_kpi, gl_idea, gl_learning, gl_doc, gl_doc_ack, gl_notification';
    RAISE NOTICE '  + triggers: attendance audit + 5 notification triggers';
    RAISE NOTICE '  + view: gl_activity_feed (chronological event feed)';
    RAISE NOTICE '  + RLS: enabled + policies on all 10 tables';
END $$;
