/**
 * Rebuild the Growth Ops schema from scratch in a throwaway Postgres,
 * apply every migration in order, then apply migration_v3_cleanup.sql
 * and check the result. Proves the migration runs before it's pasted
 * into the live SQL editor.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';

const SQL = '/home/coder/workspace/projects/growth_ops/dashboard/v2/supabase';

// Supabase-provided objects the migrations depend on. PGlite is plain
// Postgres, so these have to exist before anything else runs.
const SUPABASE_STUBS = `
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
    SELECT current_setting('request.jwt.claim.sub', true)::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
    SELECT 'authenticated'::text;
$$ LANGUAGE sql STABLE;

CREATE PUBLICATION supabase_realtime;
`;

const ORDER = [
    'schema.sql',
    'migration_teams.sql',
    'migration_year2_kra.sql',
    'migration_rbac_v1.sql',
    'migration_rbac_v1_fix.sql',
    'migration_interns_v1.sql',
    'migration_master_sheets_v1.sql',
    'migration_actions_rich_v1.sql',
    'migration_actions_adhoc_v1.sql'
];

const db = new PGlite();
await db.waitReady;

const run = async (label, sql) => {
    try {
        await db.exec(sql);
        console.log(`  ok    ${label}`);
        return true;
    } catch (err) {
        console.log(`  FAIL  ${label}\n        ${err.message}`);
        return false;
    }
};

console.log('\nBuilding the pre-migration schema:');
await run('supabase stubs', SUPABASE_STUBS);

for (const file of ORDER) {
    await run(file, readFileSync(`${SQL}/${file}`, 'utf8'));
}

// Seed a row in every table the migration backfills, so the UPDATE
// statements actually touch data rather than trivially passing on
// empty tables.
console.log('\nSeeding rows so the backfills are exercised:');
await run('seed', `
    INSERT INTO auth.users (id, email) VALUES
        ('11111111-1111-1111-1111-111111111111', 'kavya@ssei.co.in');

    INSERT INTO public.goals (type, title, status, due_date, owner_id) VALUES
        ('year',    'Grow enrolments 20%', 'in_progress', '2026-12-31', '11111111-1111-1111-1111-111111111111'),
        ('quarter', 'Cut lead response time', 'in_progress', '2026-09-30', '11111111-1111-1111-1111-111111111111'),
        ('quarter', 'Goal with no due date', 'not_started', NULL, NULL);

    INSERT INTO public.documents (name, type, url) VALUES
        ('Lead handling SOP', 'sop', 'https://example.com/a');

    INSERT INTO public.master_sheets (name, vertical, url) VALUES
        ('Student master DB', 'academics', 'https://example.com/b');
`);

// Prove the two broken constraints reject valid app writes BEFORE the fix.
console.log('\nConfirming the two bugs exist before the fix:');

const expectFail = async (label, sql) => {
    try {
        await db.exec(sql);
        console.log(`  no bug   ${label} (insert succeeded)`);
        return false;
    } catch (err) {
        console.log(`  BUG      ${label}`);
        console.log(`           rejected: ${err.message.split('\n')[0]}`);
        return true;
    }
};

const bug1 = await expectFail('assign a task to an intern',
    `INSERT INTO public.actions (action_id, title, owner_name, status)
     VALUES ('t-1', 'Collect vendor quotes', 'intern1', 'not_started');`);

const bug2 = await expectFail('log a real activity verb',
    `INSERT INTO public.activity_log (user_name, action, entity_type)
     VALUES ('Kavya', 'finished', 'work_item');`);

// Apply the fix.
console.log('\nApplying migration_v3_cleanup.sql:');
const applied = await run('migration_v3_cleanup.sql',
    readFileSync(`${SQL}/migration_v3_cleanup.sql`, 'utf8'));

console.log('\nRe-running it to confirm it is safe to apply twice:');
const reapplied = await run('migration_v3_cleanup.sql (2nd run)',
    readFileSync(`${SQL}/migration_v3_cleanup.sql`, 'utf8'));

// Both writes should now succeed.
console.log('\nConfirming both bugs are fixed:');
const fixed1 = await run('assign a task to an intern',
    `INSERT INTO public.actions (action_id, title, owner_name, status)
     VALUES ('t-2', 'Collect vendor quotes', 'intern1', 'not_started');`);
const fixed2 = await run('log a real activity verb',
    `INSERT INTO public.activity_log (user_name, action, entity_type)
     VALUES ('Kavya', 'finished', 'work_item');`);

// Check the backfills produced sane values.
console.log('\nChecking the backfills:');
const goals = await db.query(`
    SELECT title, scope, type, period_year, period_quarter FROM public.goals ORDER BY title`);
for (const g of goals.rows) {
    console.log(`  ${g.scope === 'company' ? 'company' : 'team   '}  y=${g.period_year ?? '—'} q=${g.period_quarter ?? '—'}  ${g.title}`);
}

const docs = await db.query(`SELECT name, status FROM public.documents`);
const sheets = await db.query(`SELECT name, status FROM public.master_sheets`);
console.log(`  documents: ${docs.rows.map(d => d.name + '=' + d.status).join(', ')}`);
console.log(`  sheets:    ${sheets.rows.map(d => d.name + '=' + d.status).join(', ')}`);

// completed_at trigger
await db.exec(`UPDATE public.actions SET status='done' WHERE action_id='t-2';`);
const done = await db.query(`SELECT action_id, status, percent_done, completed_at FROM public.actions WHERE action_id='t-2'`);
const r = done.rows[0];
console.log(`  marking done -> percent_done=${r.percent_done}, completed_at ${r.completed_at ? 'stamped' : 'MISSING'}`);

await db.exec(`UPDATE public.actions SET status='in_progress' WHERE action_id='t-2';`);
const reopened = await db.query(`SELECT completed_at FROM public.actions WHERE action_id='t-2'`);
console.log(`  reopening    -> completed_at ${reopened.rows[0].completed_at ? 'STILL SET (wrong)' : 'cleared'}`);

// Every column the new app reads must exist.
console.log('\nChecking every column the app queries:');
const required = {
    goals:   ['scope', 'kra_id', 'metric', 'baseline', 'target', 'progress_pct',
              'period_year', 'period_quarter', 'sort_order', 'archived_at', 'parent_id'],
    actions: ['goal_id', 'completed_at', 'percent_done', 'output_link', 'rm_remarks',
              'project_tag', 'hours_spent', 'owner_name', 'intern_id', 'kra_id'],
    documents:     ['owner_id', 'status', 'last_reviewed_at', 'review_every_days'],
    master_sheets: ['owner_id', 'status', 'last_reviewed_at', 'review_every_days']
};

let missing = 0;
for (const [table, cols] of Object.entries(required)) {
    const got = await db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1`, [table]);
    const have = new Set(got.rows.map(c => c.column_name));
    const gaps = cols.filter(c => !have.has(c));
    if (gaps.length) { missing += gaps.length; console.log(`  MISSING ${table}: ${gaps.join(', ')}`); }
    else console.log(`  ok    ${table} — all ${cols.length} columns present`);
}

const ok = bug1 && bug2 && applied && reapplied && fixed1 && fixed2 && missing === 0;
console.log(`\n${ok ? 'PASS — migration is correct and safe to run.' : 'FAIL — see above.'}\n`);
process.exit(ok ? 0 : 1);
