# Growth Lab Dashboard

SSEI Growth Lab — internship program control panel for the 9-intern Cohort 1 (May 2026).

Lives at the GitHub-Pages-hosted URL once enabled. Backed by the same Supabase project as Kavya's Growth Ops dashboard.

## Three roles

| Role | Who | Sees |
|---|---|---|
| Intern | intern1–5@ssei.co.in (shared team mailboxes) | Their own attendance, check-in/out, streak |
| Reporting Manager | saloni@, shubhankar@, chirag@ssei.co.in | Their team's interns + pending approvals |
| Super-Admin | vidyutkauntia@ssei.co.in, growthops@ssei.co.in (Kavya) | All 9 interns org-wide |

## One-time deploy steps

### 1. Apply the database migration (30 seconds)

Open the Supabase SQL Editor:
https://supabase.com/dashboard/project/glheaimbqdjgpufsclrr/sql

Paste the contents of `supabase/migration_growth_lab_v1.sql` and click **Run**. It:
- Creates the `gl_attendance` table with RLS policies
- Adds a `program` column to `interns` (idempotent — safe to re-run)

### 2. Enable GitHub Pages

In the repo settings → Pages → Source = `main` branch, `/` (root). URL will be something like `https://growthkavya.github.io/growth-lab-dashboard/`.

That's it.

## Initial credentials

See `_credentials_INITIAL.txt` (gitignored). Rotate after first login.

## Tech stack

- Vanilla HTML/JS, no framework, no build step
- Supabase JS SDK v2 (CDN)
- Same Supabase project as Kavya's Growth Ops dashboard (project ref: `glheaimbqdjgpufsclrr`)
- Hosted on GitHub Pages (static)

## Architecture

- `index.html` — login screen + intern picker overlay + app shell (one page)
- `js/config.js` — Supabase URL + anon key + cohort config
- `js/supabase.js` — client init + DOM helpers + date utils
- `js/auth.js` — login/logout/session + role detection
- `js/api.js` — all Supabase queries (RLS-enforced)
- `js/views/intern.js` — intern home: check-in/out + streak + calendar
- `js/views/rm.js` — RM home: pending approvals + team status + month summary
- `js/views/super.js` — super-admin: org-wide overview + team cards
- `js/app.js` — boot + role routing
- `supabase/migration_growth_lab_v1.sql` — one-paste DB schema for attendance

## How access control works

Row-Level Security on `gl_attendance`:
- Super-admin (`is_admin()`): full access
- Anyone else: only attendance rows where their auth.uid matches either the intern's `supervisor_id` OR `auth_user_id`

So Saloni can only see Performance interns; Akash can only see his own rows. Enforced server-side — cannot be bypassed by editing the client.

## Phases

- **Phase 1 (this build, 21 May 2026):** Attendance tracker. Check-in, check-out, RM approval, calendar, team views.
- **Phase 2 (this week):** Daily check-in narrative (what done / learnt / blockers), weekly tasks, KPI scorecards.
- **Phase 3 (week after):** Ideas + learnings + RM docs + trend charts + email reminders.
