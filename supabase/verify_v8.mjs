/**
 * Prove migration_v8_notifications.sql in a throwaway Postgres. pg_net and
 * pg_cron do not exist there, so net.http_post is stubbed to record calls
 * and the checks are about WHAT would be sent and to WHOM.
 *
 *   node supabase/verify_v8.mjs
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
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS net;
CREATE TABLE net.calls (id bigserial PRIMARY KEY, url text, body jsonb);
CREATE FUNCTION net.http_post(url text, body jsonb, headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 5000)
RETURNS bigint AS $$ INSERT INTO net.calls (url, body) VALUES (url, body) RETURNING id; $$ LANGUAGE sql;
`;
const ORDER = ['schema.sql', 'migration_teams.sql', 'migration_year2_kra.sql', 'migration_rbac_v1.sql', 'migration_rbac_v1_fix.sql',
    'migration_interns_v1.sql', 'migration_master_sheets_v1.sql', 'migration_actions_rich_v1.sql', 'migration_actions_adhoc_v1.sql',
    'migration_v3_cleanup.sql', 'migration_v4_team_attendance.sql', 'migration_v5_shared_logins.sql', 'migration_v6_score_periods.sql',
    'migration_v7_projects.sql'];
const db = new PGlite(); await db.waitReady;
let failures = 0;
const pass = (l) => console.log(`  ok    ${l}`);
const fail = (l, why) => { failures++; console.log(`  FAIL  ${l}\n        ${why}`); };
const run = async (l, sql) => { try { await db.exec(sql); pass(l); } catch (e) { fail(l, e.message); } };
const q = async (sql) => (await db.query(sql)).rows;
const as = async (uid, sql) => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${uid}', false);`);
    try { return await db.query(sql); } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
};
const refuseAs = async (l, uid, sql) => { try { await as(uid, sql); fail(l, 'expected an error'); } catch (e) { pass(`${l} (refused: ${e.message.split('\n')[0]})`); } };

console.log('\nSchema up to v7:');
await run('stubs', STUBS);
for (const f of ORDER) await run(f, readFileSync(`${SQL}/${f}`, 'utf8'));
console.log('\nv8 twice:');
const v8 = readFileSync(`${SQL}/migration_v8_notifications.sql`, 'utf8');
await run('migration_v8 (1st)', v8);
await run('migration_v8 (2nd)', v8);

const KAVYA = '11111111-1111-1111-1111-111111111111', RIYA = '22222222-2222-2222-2222-222222222222', PAL = '33333333-3333-3333-3333-333333333333';
await run('people', `
    INSERT INTO auth.users (id, email) VALUES ('${KAVYA}','growthops@x.in'), ('${RIYA}','riya@x.in'), ('${PAL}','intern1@x.in');
    UPDATE public.profiles SET role='admin',  member_key='kavya', full_name='Kavya Bahety' WHERE id='${KAVYA}';
    UPDATE public.profiles SET role='member', member_key='riya',  full_name='Riya Singh' WHERE id='${RIYA}';
    UPDATE public.profiles SET role='intern', member_key='intern1', seat_keys=ARRAY['palak','rupam'], full_name='Shared' WHERE id='${PAL}';
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
    INSERT INTO public.projects (slug, name) VALUES ('lsq', 'LeadSquared rebuild');`);

console.log('\nBefore mail is configured:');
await as(KAVYA, `INSERT INTO public.actions (action_id, title, status, owner_name, assigned_by, assigned_by_name) VALUES ('t1','Tag the webinar leads','not_started','riya','${KAVYA}','Kavya Bahety')`);
let n = await q(`SELECT recipient_id, message, link FROM public.notifications`);
(n.length === 1 && n[0].recipient_id === RIYA && n[0].message.includes('Kavya Bahety handed you a task') && n[0].link.startsWith('#work/'))
    ? pass('Riya gets a bell notification') : fail('Riya gets a bell notification', JSON.stringify(n));
(await q(`SELECT count(*)::int c FROM net.calls`))[0].c === 0 ? pass('no email attempted without a URL') : fail('no email attempted without a URL', '');

console.log('\nWith mail configured:');
await run('settings', `INSERT INTO public.app_settings (key, value) VALUES ('mail_url','https://script.example/exec'), ('mail_token','secret-1'), ('digest_to','growthops@x.in')`);
// RLS with no policy: a member's select comes back empty rather than erroring.
const peek = (await as(RIYA, `SELECT * FROM public.app_settings`)).rows;
peek.length === 0 ? pass('members see nothing in app_settings') : fail('members see nothing in app_settings', JSON.stringify(peek));
await as(KAVYA, `INSERT INTO public.actions (action_id, title, status, owner_name, due_date, project_id, assigned_by, assigned_by_name)
    SELECT 't2','Collect OOH site photos','not_started','palak','2026-09-25', id, '${KAVYA}','Kavya Bahety' FROM public.projects WHERE slug='lsq'`);
let calls = await q(`SELECT url, body FROM net.calls ORDER BY id`);
const c = calls[0]?.body;
(calls.length === 1 && c.kind === 'assigned' && c.to === 'intern1@x.in' && c.to_name === 'Palak' && c.token === 'secret-1'
    && c.task.project === 'LeadSquared rebuild' && c.url.endsWith('#work/' + c.task.id) && c.by_email === 'growthops@x.in')
    ? pass('email for Palak goes to the shared login address, with project and link') : fail('email for Palak', JSON.stringify(calls));
(await q(`SELECT recipient_id FROM public.notifications WHERE entity_title='Collect OOH site photos'`))[0]?.recipient_id === PAL
    ? pass('bell notification lands on the shared login') : fail('bell notification lands on the shared login', '');

await run('a personal address wins over the login address', `INSERT INTO public.member_emails (member_key, email, name) VALUES ('palak','palak@gmail.x','Palak Rastogi')`);
await as(KAVYA, `UPDATE public.actions SET owner_name='palak' WHERE action_id='t1'`);
calls = await q(`SELECT body FROM net.calls ORDER BY id DESC LIMIT 1`);
(calls[0].body.to === 'palak@gmail.x' && calls[0].body.to_name === 'Palak Rastogi') ? pass('reassignment emails the new owner at the personal address') : fail('reassignment', JSON.stringify(calls));

const before = (await q(`SELECT count(*)::int c FROM net.calls`))[0].c;
await as(KAVYA, `INSERT INTO public.actions (action_id, title, status, owner_name, assigned_by) VALUES ('t3','My own note','not_started','kavya','${KAVYA}')`);
await as(KAVYA, `INSERT INTO public.actions (action_id, title, status, owner_name, assigned_by, completed_at) VALUES ('t4','Report finished','done','riya','${KAVYA}', now())`);
await as(KAVYA, `UPDATE public.actions SET title='Tag the webinar leads by cohort' WHERE action_id='t1'`);
await db.exec(`SELECT set_config('app.silent','1',false); INSERT INTO public.actions (action_id, title, status, owner_name, assigned_by) VALUES ('t5','Bulk load','not_started','riya','${KAVYA}'); SELECT set_config('app.silent','',false);`);
(await q(`SELECT count(*)::int c FROM net.calls`))[0].c === before
    ? pass('no mail for your own task, for finished work, for a retitle, or during a silent bulk load') : fail('unwanted mail', '');

console.log('\nThe 7 pm summary:');
await db.exec(`UPDATE public.actions SET completed_at = now() WHERE action_id='t4';
    INSERT INTO public.attendance (user_id, member_key, work_date, status, check_in_at) VALUES ('${RIYA}','riya', (now() AT TIME ZONE 'Asia/Kolkata')::date, 'present', now() - interval '6 hours');
    UPDATE public.actions SET due_date = (now() AT TIME ZONE 'Asia/Kolkata')::date - 3 WHERE action_id='t5';`);
const d = (await q(`SELECT public.daily_summary_payload() p`))[0].p;
const riya = d.people.find(p => p.key === 'riya');
(d.kind === 'digest' && d.to === 'growthops@x.in' && riya && riya.done_today.some(t => t.title === 'Report finished')
    && riya.late.some(t => t.title === 'Bulk load') && riya.attendance?.in)
    ? pass(`summary has Riya's finished, late and attendance (${d.day})`) : fail('summary', JSON.stringify(d).slice(0, 600));
const sent = (await q(`SELECT public.send_daily_summary() id`))[0].id;
sent ? pass('send_daily_summary posts to the mail URL') : fail('send_daily_summary', 'no request id');
(await q(`SELECT count(*)::int c FROM public.mail_log WHERE kind='digest'`))[0].c === 1 ? pass('digest recorded in mail_log') : fail('mail_log', '');

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
