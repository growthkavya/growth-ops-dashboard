/**
 * Prove migration_v7_projects.sql before it touches the live database:
 * the whole schema in a throwaway Postgres, v4 to v7 applied (v7 twice),
 * then the new table exercised as the admin and as a member with RLS on.
 *
 *   node supabase/verify_v7.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';

const SQL = '/home/coder/workspace/projects/growth_ops/dashboard/v2/supabase';
const STUBS = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$ SELECT 'authenticated'::text; $$ LANGUAGE sql STABLE;
CREATE PUBLICATION supabase_realtime;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;
const ORDER = ['schema.sql', 'migration_teams.sql', 'migration_year2_kra.sql', 'migration_rbac_v1.sql',
    'migration_rbac_v1_fix.sql', 'migration_interns_v1.sql', 'migration_master_sheets_v1.sql',
    'migration_actions_rich_v1.sql', 'migration_actions_adhoc_v1.sql', 'migration_v3_cleanup.sql',
    'migration_v4_team_attendance.sql', 'migration_v5_shared_logins.sql', 'migration_v6_score_periods.sql'];

const db = new PGlite(); await db.waitReady;
let failures = 0;
const pass = (l) => console.log(`  ok    ${l}`);
const fail = (l, why) => { failures++; console.log(`  FAIL  ${l}\n        ${why}`); };
const run = async (l, sql) => { try { await db.exec(sql); pass(l); } catch (e) { fail(l, e.message); } };
const refuse = async (l, sql) => { try { await db.exec(sql); fail(l, 'expected an error'); } catch (e) { pass(`${l} (refused: ${e.message.split('\n')[0]})`); } };
const as = async (uid, sql) => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid}', false);`);
    try { return await db.query(sql); } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
};
const refuseAs = async (l, uid, sql) => { try { await as(uid, sql); fail(l, 'expected an error'); } catch (e) { pass(`${l} (refused: ${e.message.split('\n')[0]})`); } };

console.log('\nBuilding the schema up to v6:');
await run('stubs', STUBS);
for (const f of ORDER) await run(f, readFileSync(`${SQL}/${f}`, 'utf8'));

console.log('\nApplying v7 twice:');
const v7 = readFileSync(`${SQL}/migration_v7_projects.sql`, 'utf8');
await run('migration_v7 (1st run)', v7);
await run('migration_v7 (2nd run)', v7);

const KAVYA = '11111111-1111-1111-1111-111111111111';
const RIYA  = '22222222-2222-2222-2222-222222222222';
await run('seed people and grants', `
    INSERT INTO auth.users (id, email) VALUES ('${KAVYA}', 'kavya@x.in'), ('${RIYA}', 'riya@x.in');
    UPDATE public.profiles SET role='admin',  member_key='kavya' WHERE id='${KAVYA}';
    UPDATE public.profiles SET role='member', member_key='riya'  WHERE id='${RIYA}';
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;`);

console.log('\nProjects:');
try {
    await as(KAVYA, `INSERT INTO public.projects (slug, name, status) VALUES ('lsq', 'LeadSquared rebuild', 'in_progress')`);
    pass('admin can create a project');
} catch (e) { fail('admin can create a project', e.message); }
await refuseAs('member cannot create a project', RIYA, `INSERT INTO public.projects (slug, name) VALUES ('x', 'X')`);
const seen = (await as(RIYA, `SELECT name FROM public.projects`)).rows;
seen.length === 1 ? pass('member can read the projects') : fail('member can read the projects', JSON.stringify(seen));
await refuse('bad project status refused', `INSERT INTO public.projects (slug, name, status) VALUES ('y', 'Y', 'sideways')`);

console.log('\nWork items:');
await run('task points at a project and a plan', `
    INSERT INTO public.actions (action_id, title, status, owner_name, plan_tag, project_id, completed_at)
    SELECT 't1', 'Old April item', 'done', 'kavya', '2026-04', id, now() FROM public.projects WHERE slug='lsq'`);
await run('carried clears completed_at and percent', `
    UPDATE public.actions SET status='carried', percent_done=40 WHERE action_id='t1'`);
const t1 = (await db.query(`SELECT status, completed_at, percent_done FROM public.actions WHERE action_id='t1'`)).rows[0];
(t1.status === 'carried' && t1.completed_at === null && t1.percent_done === 0)
    ? pass('carried item is closed out') : fail('carried item is closed out', JSON.stringify(t1));
await run('dropped accepted', `UPDATE public.actions SET status='dropped' WHERE action_id='t1'`);
await refuse('unknown status refused', `UPDATE public.actions SET status='maybe' WHERE action_id='t1'`);
await run('done still stamps completed_at', `UPDATE public.actions SET status='done' WHERE action_id='t1'`);
const t2 = (await db.query(`SELECT completed_at FROM public.actions WHERE action_id='t1'`)).rows[0];
t2.completed_at ? pass('done item has a completed_at again') : fail('done item has a completed_at again', 'null');
await run('deleting a project leaves the task in place', `DELETE FROM public.projects WHERE slug='lsq'`);
const t3 = (await db.query(`SELECT project_id FROM public.actions WHERE action_id='t1'`)).rows[0];
t3.project_id === null ? pass('task project_id set to null') : fail('task project_id set to null', JSON.stringify(t3));

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
