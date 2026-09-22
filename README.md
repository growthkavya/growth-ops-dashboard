# Growth & Ops

Internal dashboard for the SSEI Growth & Ops team.

- **App:** https://growthkavya.github.io/growth-ops-dashboard/
- **Growth Lab** (interns, separate app): https://growthkavya.github.io/growth-ops-dashboard/lab/

Vanilla HTML/JS, no build step, no framework. Supabase for data and auth
(project `glheaimbqdjgpufsclrr`, shared with the Lab). Hosted on GitHub Pages
from the repo root.

---

## Deploying a change

Push to `main`. GitHub Pages serves the repo root, so it's live in about a minute.
If the change touches CSS or JS, bump the `?v=` on that file's tag in
`dashboard.html` — otherwise browsers keep the cached copy.

---

## The tabs, and what each one is for

Each tab owns one question. If something answers a question another tab
already owns, it belongs in that tab.

| Tab | The question it answers |
|---|---|
| **Today** | What is waiting on me, and what is due this week? |
| **Plan** | What are we working towards this week, this month, this quarter and this year, and what happened to the plan made in April? |
| **KPIs** | How is each measure doing, and what work sits behind it? |
| **Projects** | What are the streams of work, what has each produced, and what is next? |
| **Tasks** | What is on each person's plate? |
| **Calendar** | What is due or was finished on each day of the month? |
| **Team** | Who is in today, what does the month's attendance look like, and who is on the team? |
| **Documents** | Which sheets and docs can I trust? |

Leadership (Vidyut) lands on Plan and sees Plan, KPIs, Projects and Calendar,
read only. Interns see Today, Tasks, Calendar and Team.

---

## How the model fits together

```
Yearly goal (one per responsibility area)     "One student database the whole company trusts"
  └─ Quarter goal                             "LeadSquared rebuilt and audited"
       └─ Task (a work item)                  "First data-quality audit after the rebuild"
Project (a stream of work)                    "LeadSquared rebuild"  <- every task also belongs to one
```

- A **project** is a stream of work the team would name in conversation.
  Every work item points at one, so the history of a project is one click deep.
- A **task** can carry a project, a KPI, a quarter goal, and the plan it came
  from (`plan_tag`: `2026-04` for the April plan, `2026-Q4` for October to December).
- A **goal**'s progress is counted from its tasks. A yearly goal averages the
  quarter goals under it. Nothing is typed in by hand.
- The April plan's items are closed out with two extra statuses: `carried`
  (continues as a fresh task in the current plan) and `dropped`.

**KRAs and KPIs are a separate axis.** A KRA is a standing area of
responsibility; a KPI is scored by the week or by the quarter.

## Email and the 7 pm summary

Two emails leave the database on their own (`supabase/migration_v8_notifications.sql`):

- **A task handed to someone**: they get a bell notification in the dashboard at once,
  and an email with the task and a link (`#work/<id>`) that opens it, straight through
  the sign-in page if needed.
- **7 pm IST, Monday to Saturday**: the manager gets the team's day: finished today,
  late or blocked, due by the next working day, and who was in.

Mail is sent by `apps-script/growthops-mail/Code.gs`, a small web app running as the
GrowthOps Google account. The database calls it with pg_net; its URL and a shared token
live in `app_settings`, which no signed-in user can read. Until they are set nothing is
sent and nothing breaks. Bulk loads set `app.silent` so a reseed never sends forty emails.

## Files

```
index.html          Sign in
dashboard.html      The app shell: nav plus one <section> per tab
css/app.css         The whole design system
js/config.js        Period, team, and VOCAB (every user-facing word)
js/data.js          Every Supabase query. Views never call supabase directly.
js/ui.js            Shared components: the task row, the measure bar, modals, toasts, dates
js/auth.js          Session and identity
js/app.js           The store and the router
js/views/*.js       One file per tab
supabase/*.sql      Migrations, applied in filename order
apps-script/        The mail script (deploy once from growthops@ssei.co.in)
lab/                The Growth Lab app (separate, its own README)
```

### Two rules worth keeping

**One store.** `app.js` fetches everything once into `store`; views read from
it and call `store.reload()` after a write. The previous build had four
modules each fetching `actions` separately, which is how the same task ended
up shown three different ways.

**One vocabulary.** Every user-facing word resolves through `VOCAB` in
`config.js`. A status is "In progress" everywhere, never "in_progress" in one
place and "In flight" in another. If you add a word, add it there.

### One visual primitive

Goal progress, a KPI score against its target, a task's completion, and a
document's freshness are all the same question — *where is this against where
it should be*. They all render through `ui.measure()`: a track, a fill, and a
notch marking the target. Nothing draws its own progress bar.

---

## Adding things

**A new quarter.** Change `year`, `quarter` and `quarterLabel` in
`js/config.js`. Everything that says "this quarter" follows.

**A new team member.** Add them to `CONFIG.team` in `js/config.js`, create
their Supabase auth user, and set `profiles.member_key` to match the key you
used. Their KPIs go in the `kpis` table with the same `member` value.

**A new tab.** Add the nav link and `<section id="view-x">` to
`dashboard.html`, create `js/views/x.js` exporting an object with a
`render()`, and register it in `app.views`. Before you do — check it isn't a
question one of the six already owns.

---

## Migrations

Run in the [Supabase SQL editor](https://supabase.com/dashboard/project/glheaimbqdjgpufsclrr/sql),
in filename order. All are safe to re-run.

`migration_v3_cleanup.sql` is required by this version of the app. If it
hasn't been run, the dashboard shows a banner saying so rather than
silently rendering empty sections.

### Testing a migration before running it on live data

`supabase/verify.mjs` rebuilds the whole schema from scratch in a throwaway
Postgres, applies every migration in order, and checks the result — that the
backfills produce sane values, that triggers fire both ways, that every column
the app queries exists, and that the migration survives being run twice.

```bash
npm i @electric-sql/pglite
node supabase/verify.mjs
```

It found a real bug in `migration_v3_cleanup.sql` before that migration was
ever run: two policies weren't dropped before being recreated, so a second run
would have failed halfway through. Worth running for any migration that
touches existing data.

It also fixes two constraints that were rejecting writes:

- `actions.owner_name` only allowed `kavya`/`ishita`/`riya`, so assigning a
  task to an intern was rejected by the database.
- `activity_log.action` only allowed `created`/`updated`/`deleted`, while the
  app logged `finished`, `blocked` and others. Those inserts failed silently,
  so the activity feed under-reported.

---

## History

`work_logs`, `weekly_logs`, `daily_entries` and `ideas` are no longer written
to. Daily logging is now just a work item, and ideas graduate straight into
work items. The tables are left in place with their data intact.
