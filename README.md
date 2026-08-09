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

## The six tabs, and what each one is for

Each tab owns one question. If you find yourself adding something that
answers a question another tab already owns, it belongs in that tab.

| Tab | The question it answers |
|---|---|
| **Home** | What needs me today? |
| **Goals** | What are we trying to achieve, and are we getting there? |
| **KRAs & KPIs** | How is each person performing? |
| **Delegations** | Who is doing what, right now? |
| **Documents** | Which sheets and docs can I trust? |
| **People** | Who's on the team, and what are they carrying? |

Home is the one exception that pulls from elsewhere — quarter progress and
recent activity — because a quarter going off track is worth seeing unprompted.
Everything else on Home is actionable in place.

---

## How the model fits together

```
Company goal (annual)            "Grow paid enrolments 20% over CY2026"
  └─ Team goal (quarterly)       "Cut lead response time to under 2 hours"
       └─ Work item              "Set up the WhatsApp auto-reply"
```

- A **company goal**'s progress is the average of the team goals under it.
  It is never typed in by hand.
- A **team goal** carries a progress percentage, an owner, and optionally a KRA.
  One with no parent appears in its own section — that's deliberate, so
  unattached work is visible rather than lost.
- A **work item** is any piece of work. It can link to a goal, a KRA, a KPI,
  or nothing at all. Ad-hoc work uses `project_tag` instead of forcing a KPI.

**KRAs and KPIs are a separate axis.** A KRA is a standing area of
responsibility; a goal is a target for one quarter. Work items can carry both.

---

## Files

```
index.html          Sign in
dashboard.html      The app shell — nav plus one <section> per tab
css/app.css         The whole design system
js/config.js        Period, team, and VOCAB (every user-facing word)
js/data.js          Every Supabase query. Views never call supabase directly.
js/ui.js            Shared components — the measure bar, modals, toasts, dates
js/auth.js          Session and identity
js/app.js           The store and the router
js/views/*.js       One file per tab
supabase/*.sql      Migrations, applied in filename order
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
