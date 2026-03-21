-- Team Management Migration
-- Run this in Supabase SQL Editor to add team features

-- ============================================
-- 1. Add manager relationship to profiles
-- ============================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id);

-- ============================================
-- 2. Create work_logs table for daily updates
-- ============================================
CREATE TABLE IF NOT EXISTS public.work_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) NOT NULL,
    log_date date NOT NULL DEFAULT CURRENT_DATE,
    tasks_completed text[] DEFAULT '{}',
    tasks_in_progress text[] DEFAULT '{}',
    blockers text[] DEFAULT '{}',
    notes text,
    hours_worked numeric(4,2),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, log_date)
);

-- Enable RLS
ALTER TABLE public.work_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own logs
CREATE POLICY "Users can view own work logs"
    ON public.work_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own logs
CREATE POLICY "Users can insert own work logs"
    ON public.work_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own logs
CREATE POLICY "Users can update own work logs"
    ON public.work_logs FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Managers can view their team's logs
CREATE POLICY "Managers can view team work logs"
    ON public.work_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = work_logs.user_id
            AND profiles.manager_id = auth.uid()
        )
    );

-- ============================================
-- 3. Update trigger for work_logs
-- ============================================
CREATE TRIGGER update_work_logs_updated_at
    BEFORE UPDATE ON public.work_logs
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ============================================
-- 4. Enable realtime for work_logs
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_logs;

-- ============================================
-- 5. Function to get team members
-- ============================================
CREATE OR REPLACE FUNCTION get_team_members(manager_uuid uuid)
RETURNS SETOF public.profiles AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM public.profiles
    WHERE manager_id = manager_uuid
    ORDER BY full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Function to get team work logs
-- ============================================
CREATE OR REPLACE FUNCTION get_team_work_logs(manager_uuid uuid, days_back integer DEFAULT 7)
RETURNS TABLE (
    log_id uuid,
    user_id uuid,
    user_name text,
    log_date date,
    tasks_completed text[],
    tasks_in_progress text[],
    blockers text[],
    notes text,
    hours_worked numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        wl.id,
        wl.user_id,
        p.full_name,
        wl.log_date,
        wl.tasks_completed,
        wl.tasks_in_progress,
        wl.blockers,
        wl.notes,
        wl.hours_worked
    FROM public.work_logs wl
    JOIN public.profiles p ON p.id = wl.user_id
    WHERE p.manager_id = manager_uuid
    AND wl.log_date >= CURRENT_DATE - days_back
    ORDER BY wl.log_date DESC, p.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
