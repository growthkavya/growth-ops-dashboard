/**
 * Home — what needs you today.
 *
 * Deliberately not a summary of the other five tabs. Everything here is
 * an item you can act on without leaving the page, or a signal that
 * something has gone off track. If it's only interesting, it belongs in
 * the tab that owns it.
 */

const homeView = {

    render() {
        this.paintHeader();
        const body = document.getElementById('home-body');

        const mine      = store.mine();
        const open      = store.open(mine);
        const attention = store.needsAttention(mine);
        const next      = this.rank(open)[0];

        body.innerHTML = `
            ${this.clockNudge()}
            ${this.tally(mine, open, attention)}
            <div class="grid-side">
                <div>
                    ${next ? this.focus(next) : this.nothingPending()}
                    ${this.queue(this.rank(open).slice(1, 6))}
                </div>
                <div>
                    ${this.weekBlock()}
                    ${this.scoreNudge()}
                    ${this.teamToday()}
                    ${this.activityBlock()}
                </div>
            </div>`;

        this.wire();
    },

    /** On a working day with no check-in yet, the first thing Home asks for. */
    clockNudge() {
        if (!app.onRegister()) return '';
        const today = dates.today();
        if (!CONFIG.office.workDays.includes(dates.weekday(today))) return '';
        if (store.myDay()?.check_in_at) return '';
        return `<div class="notice" style="display:flex;align-items:center;justify-content:space-between;gap:var(--s3);margin-bottom:var(--s4)">
                    <span><strong>You haven't checked in today.</strong> Office opens at ${esc(attendanceView.clock(CONFIG.office.start))}.</span>
                    <button class="btn btn-primary btn-sm" data-clock="in">Check in</button>
                </div>`;
    },

    paintHeader() {
        const hour = new Date().getHours();
        const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const first = auth.name.split(' ')[0];

        document.getElementById('home-greeting').textContent = `${part}, ${first}`;

        const attention = store.needsAttention().length;
        document.getElementById('home-figure').textContent = attention || store.open(store.mine()).length;
        document.getElementById('home-figure-label').textContent =
            attention ? 'Need attention' : 'Open items';
    },

    /**
     * What to do next. Late work outranks blocked work, because blocked
     * work is usually waiting on somebody else and late work is not.
     */
    rank(items) {
        const today = dates.today();
        const weight = (w) => {
            let score = 0;
            if (w.due_date && w.due_date < today) score += 100;
            if (w.due_date === today)             score += 60;
            if (w.status === 'blocked')           score += 50;
            if (w.status === 'in_progress')       score += 20;
            if (w.goal_id)                        score += 10;
            return score;
        };
        return [...items].sort((a, b) =>
            weight(b) - weight(a) || (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    },

    tally(mine, open, attention) {
        const shipped = mine.filter(w =>
            w.status === 'done' && (w.completed_at || w.updated_at || '').slice(0, 10) >= dates.daysAgo(7)).length;
        const blocked = open.filter(w => w.status === 'blocked').length;
        const late    = open.filter(w => w.due_date && w.due_date < dates.today()).length;

        const cell = (value, label, tone = '') => `
            <div class="tally-cell ${tone ? 't-' + tone : ''}">
                <div class="tally-val">${value}</div>
                <span class="eyebrow">${esc(label)}</span>
            </div>`;

        return `<div class="tally">
                    ${cell(shipped, 'Finished this week', shipped ? 'good' : '')}
                    ${cell(open.length, 'Still open')}
                    ${cell(late, 'Past due', late ? 'bad' : '')}
                    ${cell(blocked, 'Blocked', blocked ? 'warn' : '')}
                </div>`;
    },

    focus(w) {
        const due  = dates.relativeDue(w.due_date);
        const pct  = w.percent_done || 0;
        const goal = w.goals?.title;

        return `<article class="focus" data-id="${w.id}">
                    <div style="display:flex;align-items:center;gap:var(--s2);flex-wrap:wrap">
                        <span class="eyebrow">Do this next</span>
                        ${w.status === 'blocked' ? ui.chip('Blocked', 'bad') : ''}
                        ${due.tone !== 'idle' ? ui.chip(due.text, due.tone) : ''}
                    </div>

                    <h3 class="focus-title">${esc(w.title)}</h3>
                    ${w.description ? `<p class="focus-desc">${esc(w.description)}</p>` : ''}
                    ${goal ? `<p class="meta" style="margin-bottom:var(--s4)">Serves: ${esc(goal)}</p>` : ''}
                    ${w.rm_remarks ? `<div class="focus-note"><strong>Note:</strong> ${esc(w.rm_remarks)}</div>` : ''}

                    <div style="margin-bottom:var(--s4)">
                        ${ui.measure({ value: pct, max: 100, size: 'lg', tone: pct >= 100 ? 'good' : 'accent' })}
                    </div>

                    <div class="focus-foot">
                        <div class="steps">
                            ${[0, 25, 50, 75, 100].map(p =>
                                `<button class="step ${pct === p ? 'active' : ''}" data-step="${p}" data-id="${w.id}">${p}%</button>`
                            ).join('')}
                        </div>
                        <div style="display:flex;gap:var(--s2)">
                            <button class="btn btn-sm" data-block="${w.id}">
                                ${w.status === 'blocked' ? 'Unblock' : 'Mark blocked'}
                            </button>
                            <button class="btn btn-primary btn-sm" data-done="${w.id}">Mark done</button>
                        </div>
                    </div>

                    <div class="meta" style="margin-top:var(--s3)">
                        ${w.due_date ? esc(due.text) : 'No due date'}
                        ${w.output_link
                            ? ` · <a href="${escAttr(w.output_link)}" target="_blank" rel="noopener">Open the output &#8599;</a>`
                            : ` · <button class="btn-quiet" data-output="${w.id}" style="font-size:12px;color:var(--accent)">Add a link to the output</button>`}
                    </div>
                </article>`;
    },

    nothingPending() {
        return `<div class="block">
                    ${ui.empty(
                        'Nothing open on your plate',
                        'Everything assigned to you is done. Pick up something new in Delegations, or check whether a goal needs work behind it.',
                        `<button class="btn btn-primary" id="home-new">Add a work item</button>`
                    )}
                </div>`;
    },

    queue(items) {
        if (items.length === 0) return '';

        return `<div class="block">
                    <div class="block-head">
                        <h3 class="h-block">After that</h3>
                        <a href="#work" class="meta">See all delegations &rarr;</a>
                    </div>
                    <div class="block-body block-body--flush">
                        ${items.map(w => {
                            const due = dates.relativeDue(w.due_date);
                            return `<div class="row-item">
                                <button class="dot s-${w.status}" data-cycle="${w.id}"
                                        title="${esc(VOCAB.status[w.status])} — click to advance"></button>
                                <div class="row-main">
                                    <div class="row-title">${esc(w.title)}</div>
                                    <div class="row-sub">
                                        ${ui.who(w.owner_name)}
                                        <span class="${due.tone === 'bad' ? 'doc-stale' : ''}">${esc(due.text)}</span>
                                    </div>
                                </div>
                                <div class="row-measure">
                                    ${ui.measure({ value: w.percent_done || 0, max: 100, size: 'xs', tone: 'accent' })}
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
    },

    /**
     * This week's goals. Progress is counted from the tasks pointed at
     * each goal, so this moves when work moves, not when someone
     * remembers to update a percentage.
     */
    weekBlock() {
        const goals = store.goalsOfType('week');

        return `<div class="block">
                    <div class="block-head">
                        <h3 class="h-block">This week</h3>
                        <a href="#goals" class="meta">All goals &rarr;</a>
                    </div>
                    <div class="block-body">
                        ${goals.length === 0
                            ? `<p class="meta">No goals set for this week.</p>`
                            : goals.map(g => {
                                const p = store.goalProgress(g);
                                return `<div style="margin-bottom:var(--s3)">
                                    <div style="display:flex;justify-content:space-between;gap:var(--s3);margin-bottom:3px">
                                        <span style="font-size:12.5px">${esc(g.title)}</span>
                                        <span class="num meta">${p.pct}%</span>
                                    </div>
                                    ${ui.measure({ value: p.pct, max: 100, size: 'xs',
                                                   tone: p.pct >= 100 ? 'good' : 'accent' })}
                                    ${p.from === 'work' ? `<div class="meta">${p.done} of ${p.total} tasks done</div>` : ''}
                                </div>`;
                            }).join('')}
                        ${auth.isLeader ? '' : `<button class="btn btn-sm" id="home-goal">Add a goal for this week</button>`}
                    </div>
                </div>`;
    },

    /**
     * What is waiting to be scored this week. One click from here to the
     * standard, so scoring never means hunting through a tab.
     */
    scoreNudge() {
        const mine = store.kpis.filter(k => k.member === auth.key);
        if (!mine.length) return '';

        const week = dates.weekStart();
        const waiting = store.unscored('week', week);
        if (!waiting.length) {
            return `<div class="block">
                        <div class="block-head"><h3 class="h-block">Scoring</h3>
                            <span class="eyebrow">Week of ${esc(dates.short(week))}</span></div>
                        <div class="block-body"><p class="meta">All ${mine.length} measures scored this week.</p></div>
                    </div>`;
        }

        return `<div class="block">
                    <div class="block-head">
                        <h3 class="h-block">To score this week</h3>
                        <span class="eyebrow">${waiting.length} of ${mine.length} left</span>
                    </div>
                    <div class="block-body block-body--flush">
                        ${waiting.slice(0, 5).map(k => `
                            <div class="row-item">
                                <div class="row-main">
                                    <div class="row-title">${esc(k.name)}</div>
                                    <div class="row-sub">${esc(store.kraById(k.kra_id)?.short_name || '')} · ${k.weight || 0}%</div>
                                </div>
                                <button class="btn btn-sm" data-score="${k.id}">Score</button>
                            </div>`).join('')}
                        ${waiting.length > 5 ? `<div class="row-item"><a href="#scorecard" class="meta">${waiting.length - 5} more in KRAs &amp; KPIs &rarr;</a></div>` : ''}
                    </div>
                </div>`;
    },

    /** Who is in today. Only the manager needs this on Home. */
    teamToday() {
        if (!auth.isAdmin) return '';
        const today = dates.today();
        const people = CONFIG.team.filter(m => m.attendance !== false);
        if (!people.length) return '';

        return `<div class="block">
                    <div class="block-head">
                        <h3 class="h-block">Team today</h3>
                        <a href="#attendance" class="meta">Register &rarr;</a>
                    </div>
                    <div class="block-body block-body--flush">
                        ${people.map(m => {
                            const r = store.attendance.find(a => a.member_key === m.key && a.work_date === today);
                            const open = store.workItems.filter(w => w.owner_name === m.key && w.status !== 'done').length;
                            return `<div class="row-item">
                                <div class="row-main">
                                    <div class="row-title">${esc(m.name)}</div>
                                    <div class="row-sub">${r?.check_in_at
                                        ? `In since ${esc(dates.time(r.check_in_at))}`
                                        : r ? esc(VOCAB.attendance[r.status] || r.status) : 'Not checked in'}</div>
                                </div>
                                <span class="meta">${open} open</span>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
    },

    activityBlock() {
        const since = new Date(Date.now() - 3 * 86400000).toISOString();
        const recent = store.activity
            .filter(e => e.timestamp > since)
            .filter(e => auth.isAdmin || e.user_id === auth.userId)
            .slice(0, 7);

        return `<div class="block">
                    <div class="block-head">
                        <h3 class="h-block">Recently</h3>
                        <span class="eyebrow">${auth.isAdmin ? 'Whole team' : 'You'} · 3 days</span>
                    </div>
                    <div class="block-body">
                        ${recent.length === 0
                            ? `<p class="meta">Nothing recorded in the last three days.</p>`
                            : recent.map(e => `
                                <div class="feed-item">
                                    <div style="flex:1">
                                        <strong style="font-weight:550">${esc(e.user_name || 'Someone')}</strong>
                                        ${esc(e.action)}
                                        ${e.entity_title ? `<span class="muted">${esc(this.clip(e.entity_title, 42))}</span>` : ''}
                                    </div>
                                    <span class="feed-when">${dates.ago(e.timestamp)}</span>
                                </div>`).join('')}
                    </div>
                </div>`;
    },

    clip(text, max) {
        const s = String(text || '');
        return s.length > max ? s.slice(0, max - 1) + '…' : s;
    },

    /* ---------- Interactions -------------------------------- */

    wire() {
        const body = document.getElementById('home-body');

        body.querySelectorAll('[data-step]').forEach(btn => {
            btn.addEventListener('click', () =>
                workView.setProgress(btn.dataset.id, parseInt(btn.dataset.step, 10)));
        });

        body.querySelectorAll('[data-done]').forEach(btn => {
            btn.addEventListener('click', () => workView.markDone(btn.dataset.done));
        });

        body.querySelectorAll('[data-block]').forEach(btn => {
            btn.addEventListener('click', () => workView.toggleBlocked(btn.dataset.block));
        });

        body.querySelectorAll('[data-cycle]').forEach(btn => {
            btn.addEventListener('click', () => workView.cycleStatus(btn.dataset.cycle));
        });

        body.querySelectorAll('[data-output]').forEach(btn => {
            btn.addEventListener('click', () => workView.addOutputLink(btn.dataset.output));
        });

        document.getElementById('home-new')?.addEventListener('click', () => workView.openEditor());

        document.getElementById('home-goal')?.addEventListener('click', () => {
            goalsView.period = 'week';
            goalsView.openEditor(null);
        });

        // Scoring from Home scores the week, which is what Home is showing.
        body.querySelectorAll('[data-score]').forEach(btn => {
            btn.addEventListener('click', () => {
                scorecardView.period = 'week';
                scorecardView.anchor = dates.weekStart();
                scorecardView.openScorer(btn.dataset.score);
            });
        });
    }
};
