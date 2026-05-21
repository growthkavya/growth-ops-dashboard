-- ============================================================
-- GROWTH LAB DASHBOARD — Migration v1 (21 May 2026)
--
-- Purpose: enable attendance tracking + program-tagging for the
-- 9-intern Growth Lab cohort starting 22 May 2026.
--
-- Re-uses Kavya's existing `interns` table + RBAC helpers
-- (public.is_admin, public.current_user_role) — see migration_interns_v1.sql.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Tag interns with their program so Growth Lab cohort can be filtered
-- (Kavya's existing internal interns default to 'growth_ops')
ALTER TABLE public.interns
    ADD COLUMN IF NOT EXISTS program text DEFAULT 'growth_ops';

-- 2. Attendance log table
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
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now()),
    UNIQUE (intern_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_gl_attendance_intern_date
    ON public.gl_attendance(intern_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_gl_attendance_pending
    ON public.gl_attendance(approval_status)
    WHERE approval_status = 'pending';

-- 3. updated_at trigger
CREATE OR REPLACE FUNCTION public.gl_attendance_set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gl_attendance_updated_at_trg ON public.gl_attendance;
CREATE TRIGGER gl_attendance_updated_at_trg
    BEFORE UPDATE ON public.gl_attendance
    FOR EACH ROW EXECUTE FUNCTION public.gl_attendance_set_updated_at();

-- 4. RLS
ALTER TABLE public.gl_attendance ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to make migration idempotent
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname='public' AND tablename='gl_attendance'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.gl_attendance', r.policyname);
    END LOOP;
END $$;

-- Select: admin sees all; intern sees rows for interns linked to their shared auth_user_id;
-- RM (any 'member' role) sees rows where they are the supervisor.
CREATE POLICY gl_attendance_select ON public.gl_attendance FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.interns i
        WHERE i.id = gl_attendance.intern_id
          AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())
    )
);

CREATE POLICY gl_attendance_insert ON public.gl_attendance FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.interns i
        WHERE i.id = gl_attendance.intern_id
          AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())
    )
);

CREATE POLICY gl_attendance_update ON public.gl_attendance FOR UPDATE USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.interns i
        WHERE i.id = gl_attendance.intern_id
          AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid())
    )
);

CREATE POLICY gl_attendance_delete ON public.gl_attendance FOR DELETE USING (
    public.is_admin()
);

-- 5. Done
DO $$
BEGIN
    RAISE NOTICE 'Growth Lab migration v1 complete.';
    RAISE NOTICE '  + table:  public.gl_attendance (with RLS)';
    RAISE NOTICE '  + column: public.interns.program';
END $$;
