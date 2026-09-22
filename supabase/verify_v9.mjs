/** The evening flags, proven in a throwaway Postgres.   node supabase/verify_v9.mjs */
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
CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS net;
CREATE TABLE net.calls (id bigserial PRIMARY KEY, url text, body jsonb);
CREATE FUNCTION net.http_post(url text, body jsonb, headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 5000)
RETURNS bigint AS $$ INSERT INTO net.calls (url, body) VALUES (url, body) RETURNING id; $$ LANGUAGE sql;`;
const ORDER = ['schema.sql', 'migration_teams.sql', 'migration_year2_kra.sql', 'migration_rbac_v1.sql', 'migration_rbac_v1_fix.sql',
    'migration_interns_v1.sql', 'migration_master_sheets_v1.sql', 'migration_actions_rich_v1.sql', 'migration_actions_adhoc_v1.sql',
    'migration_v3_cleanup.sql', 'migration_v4_team_attendance.sql', 'migration_v5_shared_logins.sql', 'migration_v6_score_periods.sql',
    'migration_v7_projects.sql', 'migration_v8_notifications.sql'];
const db = new PGlite(); await db.waitReady;
let failures = 0;
const pass = (l) => console.log(`  ok    ${l}`);
const fail = (l, why) => { failures++; console.log(`  FAIL  ${l}\n        ${why}`); };
const run = async (l, sql) => { try { await db.exec(sql); pass(l); } catch (e) { fail(l, e.message); } };
const q = async (sql) => (await db.query(sql)).rows;

console.log('\nSchema up to v8:');
await run('stubs', STUBS);
for (const f of ORDER) await run(f, readFileSync(`${SQL}/${f}`, 'utf8'));
const v9 = readFileSync(`${SQL}/migration_v9_daily_flags.sql`, 'utf8');
await run('migration_v9 (1st)', v9);
await run('migration_v9 (2nd)', v9);

const KAVYA = '11111111-1111-1111-1111-111111111111', RIYA = '22222222-2222-2222-2222-222222222222', PAL = '33333333-3333-3333-3333-333333333333';
// A Wednesday, well inside the scoring period.
const DAY = '2026-09-23';
await run('people, a working Wednesday', `
    INSERT INTO auth.users (id, email) VALUES ('${KAVYA}','growthops@x.in'), ('${RIYA}','riya@x.in'), ('${PAL}','intern1@x.in');
    UPDATE public.profiles SET role='admin',  member_key='kavya', full_name='Kavya Bahety' WHERE id='${KAVYA}';
    UPDATE public.profiles SET role='member', member_key='riya',  full_name='Riya Singh' WHERE id='${RIYA}';
    UPDATE public.profiles SET role='intern', member_key='intern1', seat_keys=ARRAY['palak','rupam'], full_name='Shared' WHERE id='${PAL}';
    INSERT INTO public.app_settings (key, value) VALUES ('mail_url','https://x/exec'), ('mail_token','t');
    SELECT set_config('app.silent','1',false);
    -- Riya: in late, checked out short, finished 4, one due today open, one overdue.
    INSERT INTO public.attendance (user_id, member_key, work_date, status, check_in_at, check_out_at)
    VALUES ('${RIYA}','riya','${DAY}','present','${DAY} 06:15+00','${DAY} 12:30+00');
    INSERT INTO public.actions (action_id, title, status, owner_name, completed_at, assigned_by)
    SELECT 'r'||g, 'Riya finished '||g, 'done', 'riya', '${DAY} 08:00+00', '${KAVYA}' FROM generate_series(1,4) g;
    INSERT INTO public.actions (action_id, title, status, owner_name, due_date, assigned_by) VALUES
      ('r-today','Due today thing','not_started','riya','${DAY}','${KAVYA}'),
      ('r-old','Old thing','in_progress','riya','2026-09-15','${KAVYA}');
    ALTER TABLE public.actions DISABLE TRIGGER update_actions_updated_at;   -- so a fixed test day can be used
    UPDATE public.actions SET updated_at = '${DAY} 09:00+00' WHERE action_id = 'r-old';
    ALTER TABLE public.actions ENABLE TRIGGER update_actions_updated_at;
    -- Palak: present on time, nothing moved, 2 open. Rupam: no record at all.
    INSERT INTO public.attendance (user_id, member_key, work_date, status, check_in_at, check_out_at)
    VALUES ('${PAL}','palak','${DAY}','present','${DAY} 04:58+00','${DAY} 14:05+00');
    INSERT INTO public.actions (action_id, title, status, owner_name, due_date, assigned_by, updated_at) VALUES
      ('p1','Palak task one','not_started','palak','2026-09-30','${KAVYA}','2026-09-20 05:00+00'),
      ('p2','Palak task two','not_started','palak','2026-09-30','${KAVYA}','2026-09-20 05:00+00'),
      ('u1','Rupam blocked thing','blocked','rupam',NULL,'${KAVYA}','2026-09-20 05:00+00');
    SELECT set_config('app.silent','',false);`);

const d = (await q(`SELECT public.daily_summary_payload('${DAY}') p`))[0].p;
const by = Object.fromEntries(d.people.map(p => [p.key, p]));
const texts = (k) => (by[k]?.flags || []).map(f => f.level + ': ' + f.text).join(' | ');

const riya = texts('riya');
/Checked in at 11:45 am, 1h 15m late/.test(riya) ? pass('late check-in flagged with the minutes') : fail('late check-in', riya);
/Short day: 6h 15m/.test(riya) ? pass('short day flagged') : fail('short day', riya);
/good: Big day: 4 tasks finished/.test(riya) ? pass('a big day is noted as good') : fail('big day', riya);
/1 task due today still open/.test(riya) ? pass('due today, still open') : fail('due today', riya);
/\d+ tasks? overdue, the oldest since \d+ \w+/.test(riya) ? pass('overdue count with the oldest date (the base schema seeds April tasks too)') : fail('overdue', riya);

const palak = texts('palak');
/In today, but none of the 2 open tasks moved/.test(palak) ? pass('in all day, nothing moved') : fail('nothing moved', palak);
!/late/.test(palak) ? pass('on-time check-in not flagged') : fail('on time', palak);

const rupam = texts('rupam');
/attention: No check-in today/.test(rupam) ? pass('no check-in flagged') : fail('no check-in', rupam);
/1 blocked task waiting/.test(rupam) ? pass('blocked work noted') : fail('blocked', rupam);

(d.flags.length >= 8 && d.flags.every(f => f.who)) ? pass(`all ${d.flags.length} flags carry a name`) : fail('flags', JSON.stringify(d.flags));
(by.riya.worked_on.length === 1 && by.riya.worked_on[0].title === 'Old thing') ? pass('worked-on list carries tasks moved today') : fail('worked_on', JSON.stringify(by.riya.worked_on));

const sun = (await q(`SELECT public.daily_summary_payload('2026-09-27') p`))[0].p;
sun.working_day === false && !sun.flags.some(f => /check-in/.test(f.text)) ? pass('Sunday raises no attendance flags') : fail('Sunday', JSON.stringify(sun.flags));

const job = (await q(`SELECT 1 AS x`));   // cron is stubbed out here; the schedule line is covered live
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
