/**
 * Attendance: who is in, and the month's record.
 *
 * Check-in and check-out are one tap each, from the rail on every page.
 * Times come from the server clock, so this view never writes a time a
 * browser made up. Everyone sees their own record; the admin sees the
 * team and is the only one who can correct a day or mark leave.
 *
 * Late and short days are flagged, never blocked. The register is the
 * basis for a conversation, and a flag with no context is not a verdict.
 */

const teamView = {
    month: null,        // 'YYYY-MM' being shown
    cache: {},          // month -> rows, for months other than the current one

    render() {
        const body = document.getElementById('team-body');
        if (!this.month) this.month = dates.today().slice(0, 7);

        const today = dates.today();
        const people = this.people();
        const todays = store.attendance.filter(r => r.work_date === today);

        body.innerHTML = `
            ${this.todayBlock(people, todays)}
            ${this.registerBlock(people)}
            ${this.summaryBlock(people)}
            <p class="reg-note">
                Office hours ${esc(this.clock(CONFIG.office.start))} to ${esc(this.clock(CONFIG.office.end))}, Monday to Saturday.
                Sunday is a paid weekly off and is marked WO. A check-in after
                ${esc(this.clock(CONFIG.office.start))} is marked late, and a day under
                ${CONFIG.office.fullDayHours} hours is marked short. Leave follows the leave policy: apply by email,
                and the day is marked here once approved.
            </p>
            ${this.rosterBlock()}
            ${auth.audience === 'intern' ? '' : this.internsBlock()}`;

        this.wire();
    },

    /* ---------- The team ------------------------------------ */

    rosterBlock() {
        return `<div class="sec" style="margin-top:36px">
            <div class="sec-head"><h3 class="sec-title">The team</h3></div>
            <div class="list">
                ${CONFIG.team.map(m => {
                    const theirs = store.workItems.filter(w => w.owner_name === m.key);
                    const open = store.open(theirs).length;
                    const kpis = store.kpis.filter(k => k.member === m.key);
                    return `<div class="people-line">
                        ${ui.avatar(m.name, m.key)}
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:500">${esc(m.name)}</div>
                            <div class="meta">${esc(m.role)}</div>
                        </div>
                        <span class="meta">${open} open${kpis.length ? ` · ${kpis.length} measures` : ''}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    },

    internsBlock() {
        // Only the interns on this team; the rest of the Growth Lab cohort stays in the Lab.
        const ours = (i) => CONFIG.team.some(m => m.level === 'intern' && (i.name || '').toLowerCase().startsWith(m.name.toLowerCase()));
        const live   = store.interns.filter(i => ['onboarding', 'active'].includes(i.status));
        const active = live.filter(ours);
        const others = live.length - active.length;
        const past   = store.interns.filter(i => ['completed', 'archived'].includes(i.status) && ours(i));
        return `<div class="sec">
            <div class="sec-head">
                <h3 class="sec-title">Interns</h3>
                <span class="sec-note"><a href="${escAttr(CONFIG.growthLabUrl)}" target="_blank" rel="noopener">Growth Lab &#8599;</a>
                    ${auth.isAdmin ? ` · <a href="#" id="intern-new">Add an intern</a>` : ''}</span>
            </div>
            <div class="list">
                ${active.length ? active.map(i => `<div class="people-line">
                        ${ui.avatar(i.name, CONFIG.internKey)}
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:500">${esc(i.name)}</div>
                            <div class="meta">${esc((i.tags || []).join(', ') || 'No team set')}${i.start_date ? ` · started ${esc(dates.short(i.start_date))}` : ''}</div>
                        </div>
                        <span class="meta">${i.status === 'onboarding' ? 'Onboarding' : 'Active'}</span>
                        <button class="btn btn-quiet btn-sm" data-onboarding="${i.id}">Checklist</button>
                        ${auth.isAdmin ? `<button class="btn btn-quiet btn-sm" data-intern="${i.id}">Edit</button>` : ''}
                    </div>`).join('')
                  : `<div class="task"><span></span><div class="task-main"><div class="task-meta">No interns on the roster.</div></div></div>`}
                ${past.length || others ? `<div class="list-foot">${past.length ? `Finished: ${past.map(i => esc(i.name)).join(', ')}. ` : ''}${others ? `${others} intern${others === 1 ? '' : 's'} from other teams are in the Growth Lab.` : ''}</div>` : ''}
            </div>
        </div>`;
    },

    /* ---------- Who and what -------------------------------- */

    /**
     * The admin sees the team. Everyone else sees themselves, and a
     * shared login sees both the people who use it.
     */
    people() {
        const onRegister = CONFIG.team.filter(m => m.attendance !== false);
        return auth.isAdmin ? onRegister : onRegister.filter(m => auth.keys.includes(m.key));
    },

    rowsFor(month) {
        return month === dates.today().slice(0, 7) ? store.attendance : (this.cache[month] || []);
    },

    clock(hhmm) {
        const [h, m] = hhmm.split(':').map(Number);
        return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
    },

    minutes(hhmm) {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    },

    isWorkDay(iso) {
        return CONFIG.office.workDays.includes(dates.weekday(iso));
    },

    /**
     * The first day a person's attendance counts from: the day the
     * register went live, or their first check-in if that came earlier.
     * Days before it are blank rather than "nothing recorded".
     */
    startFor(key) {
        const first = store.attendance.concat(...Object.values(this.cache))
            .filter(r => r.member_key === key)
            .map(r => r.work_date).sort()[0];
        return first && first < CONFIG.office.trackingFrom ? first : CONFIG.office.trackingFrom;
    },

    /** Everything worth flagging about one day's row. */
    flags(row) {
        const out = [];
        if (!row || !row.check_in_at) return out;
        if (!['present', 'wfh'].includes(row.status)) return out;
        if (dates.minutesOfDay(row.check_in_at) > this.minutes(CONFIG.office.start)) out.push('late');
        if (row.check_out_at) {
            const hours = (new Date(row.check_out_at) - new Date(row.check_in_at)) / 3600000;
            if (hours < CONFIG.office.fullDayHours) out.push('short');
        } else if (row.work_date < dates.today()) {
            out.push('no-out');
        }
        return out;
    },

    flagChips(flags) {
        const label = { late: ['Late', 'warn'], short: ['Short day', 'warn'], 'no-out': ['No check-out', 'bad'] };
        return flags.map(f => ui.chip(label[f][0], label[f][1])).join(' ');
    },

    /* ---------- Today --------------------------------------- */

    todayBlock(people, todays) {
        const today = dates.today();
        const dayName = new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

        const row = (p) => {
            const r = todays.find(x => x.member_key === p.key);
            const f = this.flags(r);
            const state = !r ? (this.isWorkDay(today) ? ui.chip('Not in yet') : ui.chip('Off today'))
                        : r.check_in_at && !r.check_out_at ? ui.chip('In', 'good')
                        : r.check_out_at ? ui.chip('Left', 'idle')
                        : ui.chip(VOCAB.attendance[r.status] || r.status, 'accent');

            return `<tr>
                <td>${ui.who(p.key)}</td>
                <td>${state}</td>
                <td class="col-num">${r?.check_in_at ? esc(dates.time(r.check_in_at)) : '<span class="muted">·</span>'}</td>
                <td class="col-num">${r?.check_out_at ? esc(dates.time(r.check_out_at)) : '<span class="muted">·</span>'}</td>
                <td class="col-num">${r?.check_in_at && r?.check_out_at ? esc(dates.duration(r.check_in_at, r.check_out_at)) : '<span class="muted">·</span>'}</td>
                <td>${this.flagChips(f)}</td>
            </tr>`;
        };

        const mine = app.onRegister() ? store.myDay() : null;
        const myButton = !app.onRegister() ? ''
            : !mine?.check_in_at
            ? `<button class="btn btn-primary btn-sm" data-clock="in">Check in</button>`
            : !mine.check_out_at ? `<button class="btn btn-sm" data-clock="out">Check out</button>` : '';

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Today</h3>
                <div class="filters"><span class="eyebrow">${esc(dayName)}</span>${myButton}</div>
            </div>
            <div class="table-scroll">
                <table class="ledger">
                    <thead><tr>
                        <th>Person</th><th>Status</th>
                        <th style="text-align:right">In</th><th style="text-align:right">Out</th>
                        <th style="text-align:right">Hours</th><th>Flags</th>
                    </tr></thead>
                    <tbody>${people.map(row).join('')}</tbody>
                </table>
            </div>
        </div>`;
    },

    /* ---------- Month register ------------------------------ */

    registerBlock(people) {
        const [y, m] = this.month.split('-').map(Number);
        const days = dates.monthDays(y, m);
        const rows = this.rowsFor(this.month);
        const today = dates.today();
        const loading = this.month !== today.slice(0, 7) && !this.cache[this.month];
        const label = new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

        const cell = (p, iso) => {
            const r = rows.find(x => x.member_key === p.key && x.work_date === iso);
            const off = !this.isWorkDay(iso);
            const future = iso > today;
            const f = this.flags(r);

            let mark = '', tone = 'none';
            if (off && !r) {
                // Sunday is the weekly off, and it is paid.
                mark = 'WO';
                tone = 'off';
            } else if (r) {
                if (r.check_in_at && ['present', 'wfh'].includes(r.status)) {
                    mark = r.status === 'wfh' ? 'WH' : 'P';
                    tone = f.includes('no-out') ? 'bad' : f.length ? 'warn' : 'good';
                } else {
                    mark = VOCAB.attendanceMark[r.status] || '?';
                    tone = { casual_leave: 'leave', sick_leave: 'leave', holiday: 'off', absent: 'bad', half_day: 'warn' }[r.status] || 'good';
                }
            } else if (!off && !future && iso >= this.startFor(p.key) && iso < today) {
                mark = '·';
                tone = 'missing';
            }

            const title = [
                `${p.name}, ${dates.short(iso)}`,
                r ? (VOCAB.attendance[r.status] || r.status)
                  : (off ? 'Weekly off, paid' : future ? '' : 'Nothing recorded'),
                r?.check_in_at ? `in ${dates.time(r.check_in_at)}` : '',
                r?.check_out_at ? `out ${dates.time(r.check_out_at)}` : '',
                f.length ? f.map(x => ({ late: 'late', short: 'short day', 'no-out': 'no check-out' }[x])).join(', ') : '',
                r?.note || ''
            ].filter(Boolean).join(' · ');

            const editable = auth.isAdmin && !future;
            return `<td class="att-cell ${off ? 'is-off' : ''} ${iso === today ? 'is-today' : ''}">
                        <button type="button" class="att-mark t-${tone}" ${editable ? `data-edit="${p.key}" data-date="${iso}"` : 'disabled'}
                                title="${escAttr(title)}">${esc(mark)}</button>
                    </td>`;
        };

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Register</h3>
                <div class="filters">
                    <button class="btn btn-sm btn-quiet" data-month="-1" aria-label="Previous month">&#8249;</button>
                    <span class="eyebrow" style="min-width:110px;text-align:center">${esc(label)}</span>
                    <button class="btn btn-sm btn-quiet" data-month="1" aria-label="Next month"
                            ${this.month >= today.slice(0, 7) ? 'disabled' : ''}>&#8250;</button>
                </div>
            </div>
            ${loading ? ui.loading() : `
            <div class="table-scroll">
                <table class="att-grid">
                    <thead><tr>
                        <th class="att-who"></th>
                        ${days.map(iso => `<th class="${!this.isWorkDay(iso) ? 'is-off' : ''} ${iso === today ? 'is-today' : ''}">
                            <span>${+iso.slice(8)}</span><small>${'SMTWTFS'[dates.weekday(iso)]}</small></th>`).join('')}
                    </tr></thead>
                    <tbody>
                        ${people.map(p => `<tr><th class="att-who">${ui.who(p.key)}</th>${days.map(iso => cell(p, iso)).join('')}</tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="att-legend meta">
                <span><i class="att-key t-good"></i>Present (P)</span>
                <span><i class="att-key t-warn"></i>Late or short</span>
                <span><i class="att-key t-leave"></i>Leave (CL, SL)</span>
                <span><i class="att-key t-off"></i>Weekly off, paid (WO)</span>
                <span><i class="att-key t-bad"></i>Absent or no check-out</span>
                <span><i class="att-key t-missing"></i>Nothing recorded</span>
                ${auth.isAdmin ? '<span>Click a day to correct it or mark leave.</span>' : ''}
            </div>`}
        </div>`;
    },

    /* ---------- Month summary ------------------------------- */

    summaryBlock(people) {
        const [y, m] = this.month.split('-').map(Number);
        const today = dates.today();
        const rows = this.rowsFor(this.month);
        const stat = (p) => {
            const from = this.startFor(p.key);
            const workDays = dates.monthDays(y, m)
                .filter(iso => this.isWorkDay(iso) && iso <= today && iso >= from);
            const mine = rows.filter(r => r.member_key === p.key);
            const holidays = mine.filter(r => r.status === 'holiday').length;
            const present = mine.filter(r => ['present', 'wfh'].includes(r.status) && r.check_in_at).length;
            const wfh = mine.filter(r => r.status === 'wfh').length;
            const offs = dates.monthDays(y, m).filter(iso =>
                !this.isWorkDay(iso) && iso <= today && iso >= from).length;
            const half = mine.filter(r => r.status === 'half_day').length;
            const leave = mine.filter(r => ['casual_leave', 'sick_leave'].includes(r.status)).length;
            const late = mine.filter(r => this.flags(r).includes('late')).length;
            const short = mine.filter(r => this.flags(r).includes('short')).length;
            const noOut = mine.filter(r => this.flags(r).includes('no-out')).length;
            const recorded = new Set(mine.map(r => r.work_date));
            const missing = workDays.filter(iso => iso < today && !recorded.has(iso)).length;
            const timed = mine.filter(r => r.check_in_at && r.check_out_at);
            const avg = timed.length
                ? timed.reduce((s, r) => s + (new Date(r.check_out_at) - new Date(r.check_in_at)), 0) / timed.length / 60000
                : null;
            const due = workDays.length - holidays;

            return `<tr>
                <td>${ui.who(p.key)}</td>
                <td class="col-num">${due > 0 ? `${present}${half ? ` <span class="muted">+${half} half</span>` : ''}<span class="muted"> / ${due}</span>` : '<span class="muted">Not started</span>'}</td>
                <td class="col-num ${late ? 't-warn-ink' : ''}">${late}</td>
                <td class="col-num ${short ? 't-warn-ink' : ''}">${short}</td>
                <td class="col-num">${leave}</td>
                <td class="col-num">${wfh || '<span class="muted">0</span>'}</td>
                <td class="col-num muted">${offs}</td>
                <td class="col-num ${noOut + missing ? 't-bad-ink' : ''}">${noOut + missing}</td>
                <td class="col-num">${avg == null ? '<span class="muted">·</span>' : `${Math.floor(avg / 60)}h ${String(Math.round(avg % 60)).padStart(2, '0')}m`}</td>
            </tr>`;
        };

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Month so far</h3>
                <span class="eyebrow">Working days to date</span>
            </div>
            <div class="table-scroll">
                <table class="ledger">
                    <thead><tr>
                        <th>Person</th>
                        <th style="text-align:right">Present</th>
                        <th style="text-align:right">Late</th>
                        <th style="text-align:right">Short days</th>
                        <th style="text-align:right">Leave</th>
                        <th style="text-align:right">From home</th>
                        <th style="text-align:right" title="Sundays, paid">Weekly off</th>
                        <th style="text-align:right">Gaps</th>
                        <th style="text-align:right">Average day</th>
                    </tr></thead>
                    <tbody>${people.map(stat).join('')}</tbody>
                </table>
            </div>
        </div>`;
    },

    /* ---------- Interaction --------------------------------- */

    wire() {
        const view = document.getElementById('view-team');

        view.querySelectorAll('[data-month]').forEach(btn =>
            btn.addEventListener('click', () => this.shiftMonth(parseInt(btn.dataset.month, 10))));

        view.querySelectorAll('[data-edit]').forEach(btn =>
            btn.addEventListener('click', () => this.openEditor(btn.dataset.edit, btn.dataset.date)));

        document.getElementById('intern-new')?.addEventListener('click', (e) => { e.preventDefault(); this.editIntern(); });
        view.querySelectorAll('[data-intern]').forEach(btn => btn.addEventListener('click', () => this.editIntern(btn.dataset.intern)));
        view.querySelectorAll('[data-onboarding]').forEach(btn => btn.addEventListener('click', () => this.openOnboarding(btn.dataset.onboarding)));
    },

    async shiftMonth(step) {
        const [y, m] = this.month.split('-').map(Number);
        const d = new Date(Date.UTC(y, m - 1 + step, 1));
        const next = d.toISOString().slice(0, 7);
        if (next > dates.today().slice(0, 7)) return;
        this.month = next;
        this.render();
        if (next !== dates.today().slice(0, 7) && !this.cache[next]) {
            const [ny, nm] = next.split('-').map(Number);
            const days = dates.monthDays(ny, nm);
            try {
                this.cache[next] = await data.attendance(days[0], days[days.length - 1]);
            } catch (err) {
                toast(`Could not load ${next}: ${err.message}`, 'bad');
                this.cache[next] = [];
            }
            if (this.month === next) this.render();
        }
    },

    /** Admin only: correct a day, or mark leave, absence or a holiday. */
    openEditor(key, iso) {
        const person = CONFIG.team.find(m => m.key === key);
        const profile = store.profiles.find(p => p.member_key === key);
        if (!profile) {
            toast(`${person?.name || key} has no login yet, so there is no record to edit.`, 'bad');
            return;
        }

        const rows = this.rowsFor(iso.slice(0, 7));
        const r = rows.find(x => x.member_key === key && x.work_date === iso);
        const hhmm = (ts) => ts ? new Date(ts).toLocaleTimeString('en-GB', {
            timeZone: CONFIG.office.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }) : '';
        const at = (t) => t ? new Date(`${iso}T${t}:00+05:30`).toISOString() : null;

        ui.modal({
            title: `${person?.name || key} · ${dates.long(iso)}`,
            body: `
                ${ui.select('status', 'Status', Object.entries(VOCAB.attendance).map(([value, label]) => ({ value, label })),
                    { value: r?.status || 'present' })}
                <div class="field-pair">
                    ${ui.field('in', 'Checked in', { type: 'time', value: hhmm(r?.check_in_at) })}
                    ${ui.field('out', 'Checked out', { type: 'time', value: hhmm(r?.check_out_at) })}
                </div>
                ${ui.textarea('note', 'Note', { value: r?.note || '',
                    placeholder: 'Why this was changed. For leave: when it was approved by email.' })}
                ${r?.edited_at ? `<p class="field-hint">Last corrected ${esc(dates.ago(r.edited_at))}.</p>` : ''}`,
            submitLabel: r ? 'Save correction' : 'Save day',
            danger: r ? {
                label: 'Clear this day',
                confirm: `Remove ${person?.name}'s record for ${dates.long(iso)}?`,
                run: async () => {
                    await data.deleteAttendance(r.id);
                    await data.log('deleted', 'attendance', r.id, `${person?.name}, ${iso}`);
                    delete this.cache[iso.slice(0, 7)];
                    toast('Day cleared');
                    await store.reload();
                    if (iso.slice(0, 7) !== dates.today().slice(0, 7)) this.shiftMonth(0);
                }
            } : null,
            onSubmit: async (form) => {
                const status = form.get('status');
                const checkIn = at(form.get('in'));
                const checkOut = at(form.get('out'));
                if (checkIn && checkOut && checkOut < checkIn) throw new Error('Check-out is before check-in.');
                if (['present', 'wfh'].includes(status) && !checkIn) {
                    throw new Error('A present day needs a check-in time.');
                }

                await data.saveAttendance({
                    user_id: profile.id,
                    member_key: key,
                    work_date: iso,
                    status,
                    check_in_at: checkIn,
                    check_out_at: checkOut,
                    note: form.get('note') || null
                });
                await data.log('updated', 'attendance', null, `${person?.name}, ${iso}: ${VOCAB.attendance[status]}`);
                toast('Day saved');
                delete this.cache[iso.slice(0, 7)];
                await store.reload();
                if (iso.slice(0, 7) !== dates.today().slice(0, 7)) this.shiftMonth(0);
            }
        });
    },

    async openOnboarding(internId) {
        const intern = store.interns.find(i => i.id === internId);
        if (!intern) return;

        const items = await data.onboardingItems(internId);
        const done = items.filter(i => i.status === 'done').length;

        ui.modal({
            title: `${intern.name} — onboarding`,
            wide: true,
            body: items.length === 0
                ? `<p class="meta">No checklist for this person. Checklists are copied from the active template when an intern is added.</p>`
                : `<div style="margin-bottom:var(--s4)">
                       ${ui.measureRow({ value: done, max: items.length, target: items.length,
                                         label: `${done}/${items.length}` })}
                   </div>
                   <div class="block-body--flush">
                       ${items.map(i => `
                           <div class="row-item" style="padding-left:0;padding-right:0">
                               <button class="dot s-${i.status}" data-onboarding-step="${i.id}"
                                       title="${esc(VOCAB.status[i.status])} — click to advance"></button>
                               <div class="row-main">
                                   <div class="row-title ${i.status === 'done' ? 'strike' : ''}">${esc(i.title)}</div>
                                   ${i.description ? `<div class="row-sub">${esc(i.description)}</div>` : ''}
                               </div>
                               ${i.category ? ui.chip(i.category) : ''}
                           </div>`).join('')}
                   </div>`,
            onSubmit: null
        });

        document.getElementById('modal-host').querySelectorAll('[data-onboarding-step]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const item = items.find(i => i.id === btn.dataset.onboardingStep);
                if (!item) return;
                const cycle = VOCAB.statusCycle;
                const next = cycle[(cycle.indexOf(item.status) + 1) % cycle.length];
                await data.updateOnboardingItem(item.id, {
                    status: next,
                    completed_at: next === 'done' ? new Date().toISOString() : null
                });
                item.status = next;
                btn.className = `dot s-${next}`;
                btn.closest('.row-item').querySelector('.row-title')
                   .classList.toggle('strike', next === 'done');
            });
        });
    },

    editIntern(id = null) {
        const i = id ? store.interns.find(x => x.id === id) : null;

        const supervisors = store.profiles
            .filter(p => p.role !== 'intern')
            .map(p => ({ value: p.id, label: p.full_name || p.email }));

        ui.modal({
            title: i ? 'Intern' : 'Add an intern',
            body: `
                ${ui.field('name', 'Name', { value: i?.name || '', required: true })}
                <div class="field-pair">
                    ${ui.field('intern_code', 'Short code', {
                        value: i?.intern_code || '', required: true,
                        placeholder: 'akash-01', hint: 'Unique. Used to tell shared-login interns apart.' })}
                    ${ui.field('email_alias', 'Email', { value: i?.email_alias || '' })}
                </div>
                <div class="field-pair">
                    ${ui.select('supervisor_id', 'Reports to', supervisors, { value: i?.supervisor_id || auth.userId })}
                    ${ui.select('status', 'Status', [
                        { value: 'onboarding', label: 'Onboarding' },
                        { value: 'active', label: 'Active' },
                        { value: 'completed', label: 'Finished' },
                        { value: 'archived', label: 'Archived' }
                    ], { value: i?.status || 'onboarding' })}
                </div>
                <div class="field-pair">
                    ${ui.field('start_date', 'Started', { type: 'date', value: i?.start_date || '' })}
                    ${ui.field('end_date', 'Ends', { type: 'date', value: i?.end_date || '' })}
                </div>
                ${ui.field('tags', 'Team', {
                    value: (i?.tags || []).join(', '),
                    placeholder: 'growth_ops, performance',
                    hint: 'Comma separated. Matches the verticals used in the Growth Lab.' })}
                ${ui.textarea('notes', 'Notes', { value: i?.notes || '' })}`,
            submitLabel: i ? 'Save' : 'Add intern',
            onSubmit: async (form) => {
                const fields = {
                    name: (form.get('name') || '').trim(),
                    intern_code: (form.get('intern_code') || '').trim(),
                    email_alias: form.get('email_alias') || null,
                    supervisor_id: form.get('supervisor_id') || null,
                    status: form.get('status'),
                    start_date: form.get('start_date') || null,
                    end_date: form.get('end_date') || null,
                    tags: (form.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean),
                    notes: form.get('notes') || null
                };
                if (i) await data.updateIntern(i.id, fields);
                else   await data.createIntern(fields);
                toast(i ? 'Saved' : 'Intern added');
                await store.reload();
            }
        });
    }
};
