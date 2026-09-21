/**
 * Today: the one page to start from.
 *
 * What is waiting on you, what is due this week, who is in, and what
 * the team finished lately. One column, nothing decorative. Anything
 * that needs a longer look has its own tab.
 */

const homeView = {

    render() {
        const body = document.getElementById('home-body');
        const today = dates.today();
        const hour = new Date().getHours();
        const first = auth.name.split(' ')[0];

        document.getElementById('home-date').textContent = dates.dayLabel(today);
        document.getElementById('home-greeting').textContent =
            `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, ${first}`;
        document.getElementById('home-actions').innerHTML =
            auth.isLeader ? '' : `<button class="btn btn-primary btn-sm" id="home-add">Add a task</button>`;

        body.innerHTML = `
            ${this.clockNudge()}
            ${this.waiting()}
            ${this.week()}
            ${this.plate()}
            ${this.team()}
            ${this.latest()}`;

        document.getElementById('home-add')?.addEventListener('click', () =>
            workView.openEditor(null, { due_date: today }));

        body.querySelectorAll('[data-score-week]').forEach(btn =>
            btn.addEventListener('click', () => {
                scorecardView.period = 'week';
                scorecardView.anchor = btn.dataset.scoreWeek;
                scorecardView.person = auth.key;
                app.go('scorecard');
            }));
    },

    /** On a working day with no check-in yet, the first thing the page asks for. */
    clockNudge() {
        if (!app.onRegister()) return '';
        const today = dates.today();
        if (!CONFIG.office.workDays.includes(dates.weekday(today))) return '';
        if (store.myDay()?.check_in_at) return '';
        return `<div class="nudge">
                    <div class="nudge-line">
                        <span>You haven't checked in today. Office opens at ${esc(teamView.clock(CONFIG.office.start))}.</span>
                        <button class="btn btn-primary btn-sm" data-clock="in">Check in</button>
                    </div>
                </div>`;
    },

    /** Late or blocked work, and scoring that is due. Absent when there is nothing. */
    waiting() {
        const items = store.needsAttention(store.mine())
            .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
        const score = this.scoreLine();
        if (!items.length && !score) return '';

        return `<div class="sec">
            <div class="sec-head"><h3 class="sec-title">Waiting on you</h3></div>
            <div class="nudge" style="margin-bottom:0">
                ${score}
                ${items.slice(0, 6).map(w => ui.taskRow(w)).join('')}
                ${items.length > 6 ? `<div class="list-foot"><a href="#work" data-goto="work">${items.length - 6} more in Tasks</a></div>` : ''}
            </div>
        </div>`;
    },

    scoreLine() {
        const mine = store.kpis.filter(k => k.member === auth.key);
        if (!mine.length || auth.isLeader) return '';
        const lastWeek = dates.addDays(dates.weekStart(), -7);
        if (lastWeek < CONFIG.scoringFrom) return '';
        const waiting = store.unscored('week', lastWeek);
        if (!waiting.length) return '';
        return `<div class="nudge-line">
                    <span><b>${waiting.length} of ${mine.length} measures</b> still to score for the week of ${esc(dates.short(lastWeek))}.</span>
                    <button class="btn btn-sm" data-score-week="${lastWeek}">Score them</button>
                </div>`;
    },

    week() {
        const from = dates.weekStart(), to = dates.weekEnd();
        const items = auth.isAdmin ? store.workItems : store.mine();
        const due = store.dueBetween(from, to, items);
        const done = store.doneBetween(from, to, items);

        return `<div class="sec">
            <div class="sec-head">
                <h3 class="sec-title">This week</h3>
                <span class="sec-note">${esc(dates.short(from))} to ${esc(dates.short(to))}${auth.audience === 'intern' ? '' : ` · <a href="#plan" data-goto="plan">See the plan</a>`}</span>
            </div>
            <div class="list">
                ${due.length ? due.map(w => ui.taskRow(w)).join('')
                    : `<div class="task"><span></span><div class="task-main"><div class="task-meta">Nothing is due this week.</div></div></div>`}
                ${done.length ? `<details class="fold">
                        <summary class="list-foot" style="cursor:pointer">${done.length} finished this week</summary>
                        ${done.map(w => ui.taskRow(w, { when: 'done' })).join('')}
                    </details>` : ''}
            </div>
        </div>`;
    },

    /** Open work with no date, for the people who work from a list rather than a calendar. */
    plate() {
        if (auth.isAdmin) return '';
        const from = dates.weekStart(), to = dates.weekEnd();
        const items = store.open(store.mine().filter(w => auth.keys.includes(w.owner_name)))
            .filter(w => !w.due_date || w.due_date > to || w.due_date < from)
            .filter(w => !(w.due_date && w.due_date < dates.today()))     // already under Waiting on you
            .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
        if (!items.length) return '';
        return `<div class="sec">
            <div class="sec-head"><h3 class="sec-title">Also on your plate</h3><span class="sec-note">${items.length}</span></div>
            <div class="list">${items.slice(0, 8).map(w => ui.taskRow(w, { who: false })).join('')}
                ${items.length > 8 ? `<div class="list-foot"><a href="#work" data-goto="work">All ${items.length} in Tasks</a></div>` : ''}
            </div>
        </div>`;
    },

    team() {
        if (!auth.isAdmin) return '';
        const today = dates.today();
        const people = CONFIG.team.filter(m => m.attendance !== false);
        if (!people.length) return '';

        return `<div class="sec">
            <div class="sec-head"><h3 class="sec-title">Team today</h3><span class="sec-note"><a href="#team" data-goto="team">Register</a></span></div>
            <div class="list">
                ${people.map(m => {
                    const r = store.attendance.find(a => a.member_key === m.key && a.work_date === today);
                    const open = store.open(store.workItems.filter(w => w.owner_name === m.key)).length;
                    const state = r?.check_in_at && !r.check_out_at ? `In since ${dates.time(r.check_in_at)}`
                                : r?.check_out_at ? `Left at ${dates.time(r.check_out_at)}`
                                : r ? (VOCAB.attendance[r.status] || r.status)
                                : CONFIG.office.workDays.includes(dates.weekday(today)) ? 'Not in yet' : 'Off today';
                    return `<div class="people-line">
                        ${ui.who(m.key)}
                        <span class="muted">${esc(state)}</span>
                        <span class="meta">${open} open</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    },

    latest() {
        const items = store.visibleWork()
            .filter(w => w.status === 'done' && w.completed_at)
            .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
            .slice(0, 6);
        if (!items.length) return '';
        return `<div class="sec">
            <div class="sec-head"><h3 class="sec-title">Finished lately</h3>
                ${auth.audience === 'intern' ? '' : `<span class="sec-note"><a href="#projects" data-goto="projects">All projects</a></span>`}</div>
            <div class="list">${items.map(w => ui.taskRow(w, { when: 'done' })).join('')}</div>
        </div>`;
    }
};
