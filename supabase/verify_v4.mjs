/**
 * Prove migration_v4_team_attendance.sql before it touches the live
 * database. Rebuilds the whole schema in a throwaway Postgres, applies
 * v4 twice, then exercises it as real signed-in users with row-level
 * security switched on: an admin, a member and an intern.
 *
 *   npm i @electric-sql/pglite
 *   node supabase/verify_v4.mjs
 */

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';

const SQL = '/home/coder/workspace/projects/growth_ops/dashboard/v2/supabase';

const STUBS = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
    SELECT 'authenticated'::text;
$$ LANGUAGE sql STABLE;
CREATE PUBLICATION supabase_realtime;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

const ORDER = [
    'schema.sql', 'migration_teams.sql', 'migration_year2_kra.sql',
    'migration_rbac_v1.sql', 'migration_rbac_v1_fix.sql', 'migration_interns_v1.sql',
    'migration_master_sheets_v1.sql', 'migration_actions_rich_v1.sql',
    'migration_actions_adhoc_v1.sql', 'migration_v3_cleanup.sql'
];

const db = new PGlite();
await db.waitReady;

let failures = 0;
const pass = (label) => console.log(`  ok    ${label}`);
const fail = (label, why) => { failures++; console.log(`  FAIL  ${label}\n        ${why}`); };

const run = async (label, sql) => {
    try { await db.exec(sql); pass(label); return true; }
    catch (err) { fail(label, err.message); return false; }
};

const expectError = async (label, sql) => {
    try { await db.exec(sql); fail(label, 'expected an error, got none'); }
    catch (err) { pass(`${label} (refused: ${err.message.split('\n')[0]})`); }
};

const one = async (sql) => (await db.query(sql)).rows[0];

// Act as a signed-in user with RLS enforced, like PostgREST does.
const as = async (uid, sql) => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid}', false);`);
    try { return await db.query(sql); }
    finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
};

console.log('\nBuilding the live schema:');
await run('supabase stubs', STUBS);
for (const f of ORDER) await run(f, readFileSync(`${SQL}/${f}`, 'utf8'));

console.log('\nApplying v4 twice:');
const v4 = readFileSync(`${SQL}/migration_v4_team_attendance.sql`, 'utf8');
await run('migration_v4 (1st run)', v4);
await run('migration_v4 (2nd run)', v4);

const KAVYA = '11111111-1111-1111-1111-111111111111';
const RIYA  = '22222222-2222-2222-2222-222222222222';
const PAL   = '33333333-3333-3333-3333-333333333333';

await run('seed people and grants', `
    INSERT INTO auth.users (id, email) VALUES
        ('${KAVYA}', 'kavya@x.in'), ('${RIYA}', 'riya@x.in'), ('${PAL}', 'pallak@x.in');
    UPDATE public.profiles SET role='admin',  member_key='kavya'  WHERE id='${KAVYA}';
    UPDATE public.profiles SET role='member', member_key='riya'   WHERE id='${RIYA}';
    UPDATE public.profiles SET role='intern', member_key='pallak' WHERE id='${PAL}';
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth TO authenticated;
`);

console.log('\nkpis.member accepts any team member:');
await run('KPI for a new member key', `
    INSERT INTO public.kpis (name, weight, member, kpi_code)
    VALUES ('Test KPI', 5, 'pallak', 'p_test');`);

console.log('\ncompleted_at:');
await db.exec(`
    INSERT INTO public.actions (action_id, title, status, completed_at, owner_name)
    VALUES ('h-1', 'Old report', 'done', '2026-05-20T10:00:00Z', 'kavya');
    INSERT INTO public.actions (action_id, title, status, owner_name)
    VALUES ('h-2', 'Done today', 'done', 'kavya'),
           ('h-3', 'Open item', 'in_progress', 'kavya');`);
const h1 = await one(`SELECT completed_at FROM public.actions WHERE action_id='h-1'`);
String(h1.completed_at.toISOString()).startsWith('2026-05-20')
    ? pass('a backdated done item keeps its date')
    : fail('a backdated done item keeps its date', `got ${h1.completed_at}`);
const h2 = await one(`SELECT completed_at FROM public.actions WHERE action_id='h-2'`);
h2.completed_at ? pass('a done item with no date is stamped') : fail('stamp on insert', 'null');
await db.exec(`UPDATE public.actions SET status='done' WHERE action_id='h-3'`);
const h3 = await one(`SELECT completed_at FROM public.actions WHERE action_id='h-3'`);
h3.completed_at ? pass('marking done later stamps it') : fail('stamp on update', 'null');
await db.exec(`UPDATE public.actions SET status='in_progress' WHERE action_id='h-3'`);
const h3b = await one(`SELECT completed_at FROM public.actions WHERE action_id='h-3'`);
!h3b.completed_at ? pass('reopening clears it') : fail('clear on reopen', 'still set');

console.log('\nAttendance, as the people who will use it:');
const r1 = (await as(RIYA, `SELECT * FROM public.attendance_check_in()`)).rows[0];
r1?.check_in_at ? pass('Riya checks in') : fail('Riya checks in', 'no row');
await new Promise(res => setTimeout(res, 30));
const r2 = (await as(RIYA, `SELECT * FROM public.attendance_check_in()`)).rows[0];
+r2.check_in_at === +r1.check_in_at
    ? pass('a second tap does not move the check-in')
    : fail('second tap', 'check-in time moved');
const r3 = (await as(RIYA, `SELECT * FROM public.attendance_check_out()`)).rows[0];
r3?.check_out_at ? pass('Riya checks out') : fail('check out', 'no time');

try { await as(PAL, `SELECT * FROM public.attendance_check_out()`); fail('check out before check in', 'allowed'); }
catch (e) { pass(`check out before checking in is refused (${e.message})`); }

await as(PAL, `SELECT * FROM public.attendance_check_in()`);
const palSees = (await as(PAL, `SELECT member_key FROM public.attendance`)).rows;
palSees.length === 1 && palSees[0].member_key === 'pallak'
    ? pass('an intern sees only her own days')
    : fail('intern visibility', JSON.stringify(palSees));
const adminSees = (await as(KAVYA, `SELECT member_key FROM public.attendance`)).rows;
adminSees.length === 2 ? pass('the admin sees the whole team') : fail('admin visibility', adminSees.length);

const forged = await as(RIYA, `
    UPDATE public.attendance SET check_in_at = check_in_at - interval '2 hours'
    WHERE user_id = '${RIYA}' RETURNING id`);
forged.rows.length === 0
    ? pass('a member cannot edit her own times directly')
    : fail('forged time', 'update went through');

try {
    await as(RIYA, `INSERT INTO public.attendance (user_id, member_key, work_date, status)
                    VALUES ('${RIYA}', 'riya', '2026-09-01', 'present')`);
    fail('member backfills a day', 'insert allowed');
} catch (e) { pass('a member cannot backfill a day'); }

const fixed = await as(KAVYA, `
    INSERT INTO public.attendance (user_id, member_key, work_date, status, note, edited_by)
    VALUES ('${RIYA}', 'riya', '2026-09-01', 'casual_leave', 'Approved by email', '${KAVYA}')
    RETURNING id`);
fixed.rows.length ? pass('the admin marks leave for a past day') : fail('admin leave', 'no row');

await expectError('an unknown status is rejected', `
    INSERT INTO public.attendance (user_id, member_key, work_date, status)
    VALUES ('${RIYA}', 'riya', '2026-09-02', 'vacation')`);

console.log('\nKPI updates:');
await db.exec(`
    INSERT INTO public.kpis (name, weight, member, kpi_code) VALUES
        ('Riya KPI', 10, 'riya', 'r_t'), ('Kavya KPI', 10, 'kavya', 'k_t');`);
const riyaKpi  = (await one(`SELECT id FROM public.kpis WHERE kpi_code='r_t'`)).id;
const kavyaKpi = (await one(`SELECT id FROM public.kpis WHERE kpi_code='k_t'`)).id;

const u1 = await as(RIYA, `
    INSERT INTO public.kpi_updates (kpi_id, member, period, period_start, summary)
    VALUES ('${riyaKpi}', 'kavya', 'week', '2026-09-14', 'Built the welcome journey')
    RETURNING member, created_by`);
u1.rows[0]?.member === 'riya' && u1.rows[0]?.created_by === RIYA
    ? pass('member is taken from the KPI, not the browser')
    : fail('member fill', JSON.stringify(u1.rows[0]));

try {
    await as(RIYA, `INSERT INTO public.kpi_updates (kpi_id, member, period, period_start, summary)
                    VALUES ('${kavyaKpi}', 'riya', 'week', '2026-09-14', 'x')`);
    fail('update on someone else\'s KPI', 'allowed');
} catch (e) { pass('a member cannot write under someone else\'s KPI'); }

const riyaReads = (await as(RIYA, `SELECT count(*)::int n FROM public.kpi_updates`)).rows[0].n;
const palReads  = (await as(PAL,  `SELECT count(*)::int n FROM public.kpi_updates`)).rows[0].n;
riyaReads === 1 && palReads === 0
    ? pass('updates are visible to their owner only (and the admin)')
    : fail('update visibility', `riya=${riyaReads} pallak=${palReads}`);

await expectError('one weekly update per KPI per week', `
    INSERT INTO public.kpi_updates (kpi_id, member, period, period_start, summary)
    VALUES ('${riyaKpi}', 'riya', 'week', '2026-09-14', 'duplicate')`);

console.log(`\n${failures === 0 ? 'PASS: v4 is correct and safe to run.' : `FAIL: ${failures} check(s) failed.`}\n`);
process.exit(failures === 0 ? 0 : 1);
