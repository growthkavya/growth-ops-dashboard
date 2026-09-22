-- ================================================================
-- v9 Migration: the evening summary says what is worth a look (Sep 2026)
--
-- The 7 pm summary listed what each person did. Now it also flags what
-- the manager would want pointed out: no check-in on a working day, a
-- late or short day, a task due today still open, overdue and blocked
-- work, someone in all day with nothing moved, and, on the good side,
-- a big day. It goes at 8 pm IST so check-outs are in.
--
-- Safe to re-run. Nothing is deleted.
-- ================================================================

INSERT INTO public.app_settings (key, value) VALUES ('team_keys', 'riya,palak,rupam')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.team_keys()
RETURNS text[] AS $$
    SELECT string_to_array(COALESCE(public.setting('team_keys'), 'riya,palak,rupam'), ',');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

/** Working day: Monday to Saturday. */
CREATE OR REPLACE FUNCTION public.is_working_day(p_day date)
RETURNS boolean AS $$ SELECT EXTRACT(DOW FROM p_day) BETWEEN 1 AND 6; $$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.daily_summary_payload(p_day date DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date)
RETURNS jsonb AS $$
DECLARE
    v_next   date := CASE EXTRACT(DOW FROM p_day) WHEN 6 THEN p_day + 2 ELSE p_day + 1 END;   -- Saturday looks at Monday
    v_base   text := COALESCE(public.setting('dashboard_url'), 'https://growthkavya.github.io/growth-ops-dashboard/dashboard.html');
    v_team   text[] := public.team_keys();
    v_people jsonb := '[]'::jsonb;
    v_flags  jsonb := '[]'::jsonb;
    v_key    text;
    v_name   text;
    v_att    record;
    v_done   jsonb; v_late jsonb; v_next_j jsonb; v_moved jsonb; v_open int;
    v_person jsonb;
    v_pf     jsonb;          -- this person's flags
    v_n      int;
    v_oldest record;
    v_late_min int;
    v_hours  numeric;
    v_week   date;
    v_unscored int; v_total int;
BEGIN
    -- Everyone with work or attendance today, the team first, the manager last.
    FOR v_key IN
        SELECT k FROM (
            SELECT DISTINCT owner_name AS k FROM public.actions WHERE owner_name IS NOT NULL
            UNION SELECT member_key FROM public.attendance WHERE work_date = p_day
            UNION SELECT unnest(v_team)
        ) s
        WHERE k = ANY(v_team) OR k = 'kavya'
        ORDER BY CASE WHEN k = 'kavya' THEN 9 ELSE array_position(v_team, k) END, k
    LOOP
        v_name := public.member_display_name(v_key);
        v_pf := '[]'::jsonb;

        SELECT status, check_in_at, check_out_at, note INTO v_att
        FROM public.attendance WHERE member_key = v_key AND work_date = p_day;

        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'project', p.name, 'link', a.output_link) ORDER BY a.completed_at), '[]'::jsonb)
        INTO v_done FROM public.actions a LEFT JOIN public.projects p ON p.id = a.project_id
        WHERE a.owner_name = v_key AND a.status = 'done' AND (a.completed_at AT TIME ZONE 'Asia/Kolkata')::date = p_day;

        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'project', p.name, 'status', a.status) ORDER BY a.updated_at), '[]'::jsonb)
        INTO v_moved FROM public.actions a LEFT JOIN public.projects p ON p.id = a.project_id
        WHERE a.owner_name = v_key AND a.status IN ('in_progress', 'blocked')
          AND (a.updated_at AT TIME ZONE 'Asia/Kolkata')::date = p_day;

        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'project', p.name, 'due', a.due_date, 'blocked', a.status = 'blocked', 'why', a.rm_remarks) ORDER BY a.due_date NULLS LAST), '[]'::jsonb)
        INTO v_late FROM public.actions a LEFT JOIN public.projects p ON p.id = a.project_id
        WHERE a.owner_name = v_key AND a.status IN ('not_started', 'in_progress', 'blocked') AND (a.due_date < p_day OR a.status = 'blocked');

        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'project', p.name, 'due', a.due_date) ORDER BY a.due_date), '[]'::jsonb)
        INTO v_next_j FROM public.actions a LEFT JOIN public.projects p ON p.id = a.project_id
        WHERE a.owner_name = v_key AND a.status IN ('not_started', 'in_progress') AND a.due_date BETWEEN p_day AND v_next;

        SELECT count(*) INTO v_open FROM public.actions WHERE owner_name = v_key AND status IN ('not_started', 'in_progress', 'blocked');

        /* ---------- Flags for a team member ---------- */
        IF v_key = ANY(v_team) AND public.is_working_day(p_day) THEN
            IF v_att.status IS NULL THEN
                v_pf := v_pf || jsonb_build_object('level', 'attention', 'text', 'No check-in today, and nothing marked in the register.');
            ELSIF v_att.status IN ('casual_leave', 'sick_leave', 'holiday') THEN
                v_pf := v_pf || jsonb_build_object('level', 'note', 'text', format('%s today.', initcap(replace(v_att.status, '_', ' '))));
            ELSIF v_att.status IN ('present', 'wfh', 'half_day') THEN
                v_late_min := EXTRACT(HOUR FROM v_att.check_in_at AT TIME ZONE 'Asia/Kolkata')::int * 60
                            + EXTRACT(MINUTE FROM v_att.check_in_at AT TIME ZONE 'Asia/Kolkata')::int - 630;
                IF v_att.check_in_at IS NOT NULL AND v_late_min > 10 THEN
                    v_pf := v_pf || jsonb_build_object('level', CASE WHEN v_late_min >= 60 THEN 'attention' ELSE 'note' END,
                        'text', format('Checked in at %s, %s late.', to_char(v_att.check_in_at AT TIME ZONE 'Asia/Kolkata', 'FMHH12:MI am'),
                            CASE WHEN v_late_min >= 60 THEN format('%sh %sm', v_late_min / 60, v_late_min % 60) ELSE format('%s minutes', v_late_min) END));
                END IF;
                IF v_att.check_in_at IS NOT NULL AND v_att.check_out_at IS NULL AND v_att.status = 'present' THEN
                    v_pf := v_pf || jsonb_build_object('level', 'note', 'text', 'No check-out recorded yet.');
                ELSIF v_att.check_out_at IS NOT NULL THEN
                    v_hours := EXTRACT(EPOCH FROM (v_att.check_out_at - v_att.check_in_at)) / 3600;
                    IF v_att.status = 'present' AND v_hours < 9 THEN
                        v_pf := v_pf || jsonb_build_object('level', 'note', 'text',
                            format('Short day: %sh %sm.', floor(v_hours)::int, floor((v_hours - floor(v_hours)) * 60)::int));
                    END IF;
                END IF;
                IF v_att.status = 'wfh' THEN
                    v_pf := v_pf || jsonb_build_object('level', 'note', 'text', 'Worked from home.');
                END IF;
                -- In today, and nothing moved at all.
                IF jsonb_array_length(v_done) = 0 AND jsonb_array_length(v_moved) = 0 AND v_open > 0 THEN
                    v_pf := v_pf || jsonb_build_object('level', 'attention', 'text', format('In today, but none of the %s open tasks moved.', v_open));
                END IF;
            ELSIF v_att.status = 'absent' THEN
                v_pf := v_pf || jsonb_build_object('level', 'attention', 'text', 'Marked absent.');
            END IF;
        END IF;

        /* ---------- Flags about the work, for anyone ---------- */
        SELECT count(*) INTO v_n FROM public.actions WHERE owner_name = v_key AND status IN ('not_started', 'in_progress') AND due_date = p_day;
        IF v_n > 0 THEN
            v_pf := v_pf || jsonb_build_object('level', 'attention', 'text', format('%s task%s due today still open.', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END));
        END IF;

        SELECT count(*) AS n, min(due_date) AS oldest INTO v_oldest FROM public.actions
        WHERE owner_name = v_key AND status IN ('not_started', 'in_progress') AND due_date < p_day;
        IF v_oldest.n > 0 THEN
            v_pf := v_pf || jsonb_build_object('level', 'attention', 'text',
                format('%s task%s overdue, the oldest since %s.', v_oldest.n, CASE WHEN v_oldest.n = 1 THEN '' ELSE 's' END, to_char(v_oldest.oldest, 'FMDD Mon')));
        END IF;

        SELECT count(*) INTO v_n FROM public.actions WHERE owner_name = v_key AND status = 'blocked';
        IF v_n > 0 THEN
            v_pf := v_pf || jsonb_build_object('level', 'note', 'text', format('%s blocked task%s waiting on someone.', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END));
        END IF;

        SELECT count(*) INTO v_n FROM public.actions
        WHERE owner_name = v_key AND status = 'not_started' AND due_date IS NULL AND created_at < p_day - 7 AND plan_tag IS NULL;
        IF v_n >= 3 THEN
            v_pf := v_pf || jsonb_build_object('level', 'note', 'text', format('%s tasks with no date have sat untouched for over a week.', v_n));
        END IF;

        IF jsonb_array_length(v_done) >= 4 THEN
            v_pf := v_pf || jsonb_build_object('level', 'good', 'text', format('Big day: %s tasks finished.', jsonb_array_length(v_done)));
        END IF;

        -- Monday: last week's scoring.
        IF EXTRACT(DOW FROM p_day) = 1 AND EXISTS (SELECT 1 FROM public.kpis WHERE member = v_key) THEN
            v_week := p_day - 7;
            SELECT count(*) INTO v_total FROM public.kpis WHERE member = v_key;
            SELECT count(*) INTO v_unscored FROM public.kpis k
            WHERE k.member = v_key AND NOT EXISTS (SELECT 1 FROM public.kpi_scores s WHERE s.kpi_id = k.id AND s.period = 'week' AND s.period_start = v_week);
            IF v_unscored > 0 AND v_week >= COALESCE(public.setting('scoring_from')::date, '2026-09-21'::date) THEN
                v_pf := v_pf || jsonb_build_object('level', 'note', 'text', format('%s of %s measures not yet scored for last week.', v_unscored, v_total));
            END IF;
        END IF;

        v_person := jsonb_build_object(
            'key', v_key, 'name', v_name,
            'attendance', CASE WHEN v_att.status IS NULL THEN NULL ELSE jsonb_build_object('status', v_att.status,
                'in',  to_char(v_att.check_in_at  AT TIME ZONE 'Asia/Kolkata', 'FMHH12:MI am'),
                'out', to_char(v_att.check_out_at AT TIME ZONE 'Asia/Kolkata', 'FMHH12:MI am')) END,
            'done_today', v_done, 'worked_on', v_moved, 'late', v_late, 'next', v_next_j, 'open', v_open, 'flags', v_pf);
        v_people := v_people || v_person;

        SELECT v_flags || COALESCE(jsonb_agg(f || jsonb_build_object('who', v_name)), '[]'::jsonb) INTO v_flags
        FROM jsonb_array_elements(v_pf) f;
    END LOOP;

    RETURN jsonb_build_object(
        'kind', 'digest',
        'to', COALESCE(public.setting('digest_to'), 'growthops@ssei.co.in'),
        'day', to_char(p_day, 'FMDay, FMDD Month'),
        'next_day', to_char(v_next, 'FMDay'),
        'working_day', public.is_working_day(p_day),
        'people', v_people,
        'flags', v_flags,
        'home', v_base
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 8:30 pm IST is 15:00 UTC. Monday to Saturday.
DO $$ BEGIN
    PERFORM cron.unschedule('growthops-daily-summary');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
    PERFORM cron.schedule('growthops-daily-summary', '0 15 * * 1-6', $cron$SELECT public.send_daily_summary()$cron$);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron not scheduled: %', SQLERRM; END $$;

DO $$ BEGIN
    RAISE NOTICE 'v9 migration complete. Nothing deleted.';
    RAISE NOTICE '  daily_summary_payload : now carries worked_on and flags per person';
    RAISE NOTICE '  cron                  : 8:30 pm IST, Monday to Saturday';
END $$;
