-- ============================================================
-- GROWTH LAB DASHBOARD — Migration v5 (22 May 2026)
-- Schedules daily-digest Edge Function to fire 9pm IST every day.
--
-- PRE-REQUISITES (do these IN ORDER before running this SQL):
--   1. Sign up at https://resend.com  (free tier: 3000 emails/month)
--   2. Verify a sender domain (or use Resend's onboarding@resend.dev for testing)
--   3. Generate an API key → copy it
--   4. Add Supabase secrets via CLI:
--        supabase secrets set RESEND_API_KEY=re_XXXX
--        supabase secrets set DIGEST_FROM_EMAIL="Growth Lab <growth-lab@ssei.co.in>"
--        supabase secrets set DIGEST_DASHBOARD_URL="https://growthkavya.github.io/growth-ops-dashboard/lab/"
--   5. Deploy the function:
--        supabase functions deploy daily-digest --no-verify-jwt
--   6. Then paste THIS SQL in the Supabase SQL Editor.
--
-- Alternative (no CLI): set those env vars in Supabase Dashboard → Edge Functions → daily-digest → Settings → Add Secret.
-- ============================================================

-- Enable required extensions (idempotent — Supabase usually has them on)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper: invoke the daily-digest Edge Function over HTTP
CREATE OR REPLACE FUNCTION public.gl_invoke_daily_digest()
RETURNS void AS $$
DECLARE
    proj_url text := current_setting('app.settings.supabase_url', true);
    svc_key  text := current_setting('app.settings.service_role_key', true);
BEGIN
    -- Try GUC; fall back to hardcoded values if not set
    IF proj_url IS NULL OR proj_url = '' THEN proj_url := 'https://glheaimbqdjgpufsclrr.supabase.co'; END IF;
    -- Service key MUST be set via:
    --   ALTER DATABASE postgres SET app.settings.service_role_key TO 'sb_secret_xxxx';
    -- OR supply it inline (less safe). We'll require GUC.
    IF svc_key IS NULL OR svc_key = '' THEN
        RAISE WARNING 'app.settings.service_role_key is not set. Run: ALTER DATABASE postgres SET app.settings.service_role_key TO ''YOUR_SERVICE_ROLE_KEY''; then restart database (or run SELECT pg_reload_conf();)';
        RETURN;
    END IF;
    PERFORM net.http_post(
        url := proj_url || '/functions/v1/daily-digest',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || svc_key
        ),
        body := '{}'::jsonb
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove any existing schedule with this name
SELECT cron.unschedule('gl-daily-digest') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gl-daily-digest');

-- Schedule: 9pm IST = 15:30 UTC (IST is UTC+5:30)
SELECT cron.schedule(
    'gl-daily-digest',
    '30 15 * * *',         -- minute hour DoM month DoW   (15:30 UTC = 21:00 IST)
    'SELECT public.gl_invoke_daily_digest();'
);

DO $$ BEGIN
    RAISE NOTICE 'Growth Lab v5 complete: daily-digest scheduled for 21:00 IST (15:30 UTC).';
    RAISE NOTICE 'Verify with: SELECT * FROM cron.job WHERE jobname = ''gl-daily-digest'';';
    RAISE NOTICE 'Manual test: SELECT public.gl_invoke_daily_digest();';
END $$;
