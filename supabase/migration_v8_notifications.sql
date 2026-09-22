-- ================================================================
-- v8 Migration: tell people about their work (Sep 2026)
--
-- Two things leave the database on their own:
--
--   1. A task is handed to someone: they get a bell notification in
--      the dashboard at once, and an email with the task and a link
--      that opens it.
--   2. At 7 pm IST, Monday to Saturday, the manager gets a summary:
--      what each person finished today, what is late, what is due next.
--
-- Email goes out through a small Apps Script web app that runs as the
-- GrowthOps Google account (apps-script/growthops-mail/Code.gs). The
-- database calls it with pg_net. Its URL and a shared token sit in
-- app_settings, which no signed-in user can read. Until they are set,
-- nothing is sent and nothing breaks.
--
-- Safe to re-run. Nothing is deleted.
-- ================================================================

-- ---------------------------------------------------------------
-- Extensions. Wrapped so the migration still applies on a database
-- (or a test harness) that does not ship them.
-- ---------------------------------------------------------------
DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_net not available: %', SQLERRM; END;
END $$;

DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron not available: %', SQLERRM; END;
END $$;

-- ---------------------------------------------------------------
-- Settings only the server reads. RLS on, no policies: PostgREST
-- returns nothing to any signed-in user.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
    key        text PRIMARY KEY,
    value      text,
    updated_at timestamptz DEFAULT timezone('utc', now())
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_settings FROM authenticated, anon;

-- Where a person's mail goes when it is not the address they sign in with
-- (two interns share one login, for instance).
CREATE TABLE IF NOT EXISTS public.member_emails (
    member_key text PRIMARY KEY,
    email      text NOT NULL,
    name       text
);
ALTER TABLE public.member_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "member_emails_admin" ON public.member_emails;
CREATE POLICY "member_emails_admin" ON public.member_emails FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_emails TO authenticated;

CREATE OR REPLACE FUNCTION public.setting(p_key text)
RETURNS text AS $$
    SELECT value FROM public.app_settings WHERE key = p_key;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ---------------------------------------------------------------
-- Who is who
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_display_name(p_key text)
RETURNS text AS $$
    SELECT COALESCE(
        (SELECT name FROM public.member_emails WHERE member_key = p_key),
        (SELECT full_name FROM public.profiles WHERE member_key = p_key),
        initcap(p_key));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.member_email(p_key text)
RETURNS text AS $$
    SELECT COALESCE(
        (SELECT email FROM public.member_emails WHERE member_key = p_key),
        (SELECT email FROM public.profiles WHERE member_key = p_key),
        (SELECT email FROM public.profiles WHERE p_key = ANY(seat_keys) LIMIT 1));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

/** The profile that should see a bell notification for a person key. */
CREATE OR REPLACE FUNCTION public.member_profile_id(p_key text)
RETURNS uuid AS $$
    SELECT COALESCE(
        (SELECT id FROM public.profiles WHERE member_key = p_key),
        (SELECT id FROM public.profiles WHERE p_key = ANY(seat_keys) LIMIT 1));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ---------------------------------------------------------------
-- Sending. One function, one place to change how mail leaves.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_mail(p_payload jsonb)
RETURNS bigint AS $$
DECLARE
    v_url   text := public.setting('mail_url');
    v_token text := public.setting('mail_token');
    v_id    bigint;
BEGIN
    IF v_url IS NULL OR v_token IS NULL THEN
        RETURN NULL;                              -- not configured yet: quietly skip
    END IF;
    BEGIN
        SELECT net.http_post(
            url := v_url,
            body := p_payload || jsonb_build_object('token', v_token),
            headers := '{"Content-Type": "application/json"}'::jsonb,
            timeout_milliseconds := 10000
        ) INTO v_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'send_mail: %', SQLERRM;    -- never let mail break the write
        RETURN NULL;
    END;
    INSERT INTO public.mail_log (kind, payload, request_id)
    VALUES (p_payload->>'kind', p_payload - 'token', v_id);
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS public.mail_log (
    id         bigserial PRIMARY KEY,
    kind       text,
    payload    jsonb,
    request_id bigint,
    sent_at    timestamptz DEFAULT timezone('utc', now())
);
ALTER TABLE public.mail_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_log FROM authenticated, anon;

-- ---------------------------------------------------------------
-- 1. A task handed to someone
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger AS $$
DECLARE
    v_by_key    text;
    v_by_name   text;
    v_by_email  text;
    v_to_id     uuid;
    v_project   text;
    v_kpi       text;
    v_base      text := COALESCE(public.setting('dashboard_url'), 'https://growthkavya.github.io/growth-ops-dashboard/dashboard.html');
BEGIN
    -- Bulk loads set app.silent so a reseed never sends forty emails.
    IF current_setting('app.silent', true) = '1' THEN RETURN NEW; END IF;
    IF NEW.owner_name IS NULL THEN RETURN NEW; END IF;
    IF NEW.status IN ('done', 'carried', 'dropped') THEN RETURN NEW; END IF;   -- logging finished work is not a delegation
    IF TG_OP = 'UPDATE' AND OLD.owner_name IS NOT DISTINCT FROM NEW.owner_name THEN RETURN NEW; END IF;

    -- Who handed it over: the signed-in person, else whoever the row says.
    v_by_key := COALESCE(public.current_member_key(),
                         (SELECT member_key FROM public.profiles WHERE id = NEW.assigned_by));
    IF v_by_key IS NOT NULL AND v_by_key = NEW.owner_name THEN RETURN NEW; END IF;   -- your own task, no mail

    v_by_name  := COALESCE(NEW.assigned_by_name, public.member_display_name(v_by_key), 'Growth & Ops');
    v_by_email := COALESCE(public.member_email(v_by_key), 'growthops@ssei.co.in');
    v_to_id    := public.member_profile_id(NEW.owner_name);
    SELECT name INTO v_project FROM public.projects WHERE id = NEW.project_id;
    SELECT name INTO v_kpi FROM public.kpis WHERE id = NEW.kpi_id;

    IF v_to_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_id, actor_id, actor_name, event_type, entity_type, entity_id, entity_title, message, link)
        VALUES (v_to_id, NEW.assigned_by, v_by_name, 'task_assigned', 'work_item', NEW.id, NEW.title,
                format('%s handed you a task: %s', v_by_name, NEW.title), '#work/' || NEW.id);
    END IF;

    PERFORM public.send_mail(jsonb_build_object(
        'kind', 'assigned',
        'to', public.member_email(NEW.owner_name),
        'to_name', public.member_display_name(NEW.owner_name),
        'by_name', v_by_name,
        'by_email', v_by_email,
        'task', jsonb_build_object(
            'id', NEW.id, 'title', NEW.title, 'description', NEW.description, 'notes', NEW.rm_remarks,
            'due_date', NEW.due_date, 'project', v_project, 'kpi', v_kpi, 'link', NEW.output_link),
        'url', v_base || '#work/' || NEW.id,
        'home', v_base
    ));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_actions_notify_assigned ON public.actions;
CREATE TRIGGER trg_actions_notify_assigned
AFTER INSERT OR UPDATE OF owner_name ON public.actions
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

-- ---------------------------------------------------------------
-- 2. The day, at 7 pm
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daily_summary_payload(p_day date DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date)
RETURNS jsonb AS $$
DECLARE
    v_next date := CASE EXTRACT(DOW FROM p_day) WHEN 6 THEN p_day + 2 ELSE p_day + 1 END;   -- Saturday looks at Monday
    v_base text := COALESCE(public.setting('dashboard_url'), 'https://growthkavya.github.io/growth-ops-dashboard/dashboard.html');
    v_people jsonb;
BEGIN
    WITH keys AS (
        SELECT DISTINCT owner_name AS k FROM public.actions WHERE owner_name IS NOT NULL
        UNION SELECT member_key FROM public.attendance WHERE work_date = p_day
    ),
    task AS (
        SELECT a.id, a.title, a.owner_name, a.status, a.due_date,
               (a.completed_at AT TIME ZONE 'Asia/Kolkata')::date AS done_on,
               p.name AS project
        FROM public.actions a LEFT JOIN public.projects p ON p.id = a.project_id
    )
    SELECT jsonb_agg(jsonb_build_object(
        'key', k.k,
        'name', public.member_display_name(k.k),
        'attendance', (SELECT jsonb_build_object('status', s.status,
                          'in',  to_char(s.check_in_at  AT TIME ZONE 'Asia/Kolkata', 'HH12:MI am'),
                          'out', to_char(s.check_out_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI am'))
                       FROM public.attendance s WHERE s.member_key = k.k AND s.work_date = p_day),
        'done_today', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'project', t.project) ORDER BY t.title), '[]'::jsonb)
                       FROM task t WHERE t.owner_name = k.k AND t.status = 'done' AND t.done_on = p_day),
        'late', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'project', t.project, 'due', t.due_date, 'blocked', t.status = 'blocked') ORDER BY t.due_date), '[]'::jsonb)
                 FROM task t WHERE t.owner_name = k.k AND t.status IN ('not_started','in_progress','blocked') AND (t.due_date < p_day OR t.status = 'blocked')),
        'next', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'project', t.project, 'due', t.due_date) ORDER BY t.due_date), '[]'::jsonb)
                 FROM task t WHERE t.owner_name = k.k AND t.status IN ('not_started','in_progress') AND t.due_date BETWEEN p_day AND v_next),
        'open', (SELECT count(*) FROM task t WHERE t.owner_name = k.k AND t.status IN ('not_started','in_progress','blocked'))
    ) ORDER BY CASE k.k WHEN 'kavya' THEN 9 ELSE 1 END, k.k)
    INTO v_people
    FROM keys k
    WHERE k.k IN (SELECT member_key FROM public.profiles WHERE member_key IS NOT NULL)
       OR k.k IN (SELECT unnest(seat_keys) FROM public.profiles WHERE seat_keys IS NOT NULL);

    RETURN jsonb_build_object(
        'kind', 'digest',
        'to', COALESCE(public.setting('digest_to'), 'growthops@ssei.co.in'),
        'day', to_char(p_day, 'FMDay, FMDD Month'),
        'next_day', to_char(v_next, 'FMDay'),
        'people', COALESCE(v_people, '[]'::jsonb),
        'home', v_base
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.send_daily_summary()
RETURNS bigint AS $$
    SELECT public.send_mail(public.daily_summary_payload());
$$ LANGUAGE sql SECURITY DEFINER;

-- 7 pm IST is 13:30 UTC. Monday to Saturday.
DO $$ BEGIN
    PERFORM cron.unschedule('growthops-daily-summary');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    PERFORM cron.schedule('growthops-daily-summary', '30 13 * * 1-6', $cron$SELECT public.send_daily_summary()$cron$);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron not scheduled: %', SQLERRM; END $$;

-- ================================================================
DO $$ BEGIN
    RAISE NOTICE 'v8 migration complete. Nothing deleted.';
    RAISE NOTICE '  app_settings    : mail_url, mail_token, digest_to, dashboard_url (server only)';
    RAISE NOTICE '  member_emails   : where a person''s mail goes if not their login';
    RAISE NOTICE '  task handed over: bell notification + email (once mail_url is set)';
    RAISE NOTICE '  7 pm IST daily  : summary email to digest_to';
END $$;
