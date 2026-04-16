# Year 2 (CY2026) KRA Framework Upgrade

This upgrades the dashboard from the Year 1 framework (6 flat KPIs + Layer 1/2/3)
to the Year 2 framework (5 KRAs × 10 KPIs per member × 3 members).

## What changes in the database

- **New `kras` table** — 5 KRAs (kra1..kra5)
- **`kpis` gains `kra_id`, `member`, `kpi_code`, `definition`, `measure`, `rubric`, `sort_order`**
  - 30 KPIs total, 10 per member
  - Each member's 10 KPIs sum to 100% weight
- **`actions` gains `kra_id`, `owner_name`, `kpi_code`** — `layer` becomes nullable (still there for history)
  - 29 actions total across the 5 KRAs
- **Row Level Security** stays at the same permissive "authenticated" level

## How to run the migration

1. Open the Supabase SQL Editor for the `growthkavya/growth-ops-dashboard` project
2. Paste the contents of `migration_year2_kra.sql`
3. Click **Run**
4. Verify with:
   ```sql
   SELECT kra_code, name FROM public.kras ORDER BY sort_order;

   SELECT member, COUNT(*) AS kpi_count, SUM(weight) AS total_weight
   FROM public.kpis GROUP BY member;
   -- each of kavya / ishita / riya should have 10 KPIs summing to 100

   SELECT owner_name, status, COUNT(*) FROM public.actions
   GROUP BY owner_name, status ORDER BY owner_name;
   ```

The migration is destructive for `kpis`, `kpi_scores`, and `actions` — back up first
if there's anything there worth keeping.

## How the team uses it

- **Kavya (admin)** logs in → can score any KPI, edit any action
- **Ishita / Riya** log in → see the same dashboard, can score their own KPIs + update actions they own
- All three share the same Supabase project (credentials in `js/config.js`)

## The dashboard UI changes

- **Overview** → KRA Progress bars (5 rows, one per KRA) + Team Snapshot cards
- **Action Tracker** → filter by KRA / Owner / Status; actions grouped under their KRA
- **KPIs** → team tab (Kavya / Ishita / Riya), KPI cards grouped by KRA with weight pills,
  score table with Apr / May / Jun columns and click-to-edit cells (shows the full 1-5 rubric
  in the modal so the scorer picks based on behaviour, not guesses)
- **Leadership View** → team weighted scores, 5-row KRA progress, in-progress/completed
  highlights, and any blockers flagged in the work logs
