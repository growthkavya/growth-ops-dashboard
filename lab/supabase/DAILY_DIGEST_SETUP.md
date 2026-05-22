# 📧 Daily Digest Setup

Sets up a 9pm IST email to each RM + super-admin with pending approvals, unack check-ins, ideas to review, at-risk interns, and overdue tasks.

## What you need before starting (one-time, ~10 minutes)

1. **Resend account** — free tier (3000 emails/month is plenty)
2. **A verified sender** — either:
   - Your own domain (`growth-lab@ssei.co.in`) — best
   - OR Resend's sandbox `onboarding@resend.dev` (works only to verified test addresses)

## Step 1. Resend signup + API key

1. Go to https://resend.com → Sign up
2. Settings → API Keys → **Create API Key** → name it `Growth Lab Supabase` → permission `Sending access` → choose **Full access**
3. **Copy the key** (`re_...`) — you only see it once. Save it somewhere.
4. (Recommended) Settings → Domains → **Add Domain** → `ssei.co.in` → follow DNS instructions (TXT + CNAME records in your DNS provider). Verified in ~10 min. Then your `From` becomes `Growth Lab <growth-lab@ssei.co.in>`.
   - Skip this if testing — use `onboarding@resend.dev` to send to verified test recipients.

## Step 2. Deploy the Edge Function

You need the Supabase CLI installed: https://supabase.com/docs/guides/cli

```bash
cd lab/supabase

# Login + link (one-time)
supabase login
supabase link --project-ref glheaimbqdjgpufsclrr

# Set secrets
supabase secrets set RESEND_API_KEY=re_PASTE_KEY_HERE
supabase secrets set DIGEST_FROM_EMAIL="Growth Lab <growth-lab@ssei.co.in>"
supabase secrets set DIGEST_DASHBOARD_URL="https://growthkavya.github.io/growth-ops-dashboard/lab/"

# Deploy
supabase functions deploy daily-digest --no-verify-jwt
```

**Don't want CLI?** Dashboard alternative:
1. Supabase Dashboard → Edge Functions → "+ Deploy a new function" → name `daily-digest`
2. Paste contents of `functions/daily-digest/index.ts`
3. Click Deploy
4. Click the function → Settings → Secrets → add `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`, `DIGEST_DASHBOARD_URL`

## Step 3. Set the service role key (one-time)

The cron job runs as Postgres and needs to call your Edge Function. Set it once:

```sql
ALTER DATABASE postgres SET app.settings.service_role_key TO 'sb_secret_YOUR_SERVICE_ROLE_KEY';
SELECT pg_reload_conf();
```

Find your service role key: Supabase Dashboard → Project Settings → API → `service_role` secret. (NOT the anon key.)

## Step 4. Schedule the cron job

Open the SQL editor and run `migration_growth_lab_v5.sql`. That schedules the function to fire at 21:00 IST (15:30 UTC) every day.

## Step 5. Test it

In the SQL editor:

```sql
SELECT public.gl_invoke_daily_digest();
```

Then check Edge Function logs:
- Supabase Dashboard → Edge Functions → daily-digest → Logs

You should see one entry per RM (Vidyut, Kavya, Saloni, Shubhankar, Chirag) — either "sent" or "skipped: nothing to report".

To see the email itself: check the inbox of each RM (or your Resend dashboard → Logs).

## Troubleshooting

**No emails arrive**
- Check Resend logs (resend.com/emails) — they show whether the message was sent and any bounces.
- Check Edge Function logs in Supabase — look for `Resend 4xx: ...` errors.

**"Resend 422: from address not verified"**
- Either verify your domain at Resend, or use `from = "onboarding@resend.dev"` for testing.

**"app.settings.service_role_key is not set"**
- Re-run Step 3 with the right key.

**Cron didn't fire**
- `SELECT * FROM cron.job;` — check it exists with schedule `30 15 * * *`.
- `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;` — see recent runs.

## Cost

- Resend: 100 emails/day free, then $20/mo for 50k. You'll send ~5 emails/day. Zero cost forever.
- Supabase Edge Functions: 500k invocations/month free. You'll use 30/month. Zero cost forever.
- pg_cron / pg_net: built into Supabase, free.

## Stopping it

```sql
SELECT cron.unschedule('gl-daily-digest');
```

Or in Supabase Dashboard → Database → Cron Jobs → toggle off.
