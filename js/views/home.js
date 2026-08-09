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
            ${this.tally(mine, open, attention)}
            <div class="grid-side">
                <div>
                    ${next ? this.focus(next) : this.nothingPending()}
                    ${this.queue(this.rank(open).slice(1, 6))}
                </div>
                <div>
                    ${this.quarterBlock()}
                    ${this.activityBlock()}
                </div>
            </div>`;

        this.wire();
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

    /** The one place Home reaches into another tab — because a quarter
        that's off track is exactly the thing you want to see unprompted. */
    quarterBlock() {
        const teamGoals = store.goals.filter(g =>
            g.scope === 'team' &&
            g.period_year === CONFIG.year &&
            g.period_quarter === CONFIG.quarter);

        if (teamGoals.length === 0) {
            return `<div class="block">
                        <div class="block-head"><h3 class="h-block">This quarter</h3></div>
                        ${ui.empty('No goals set for this quarter',
                            'Set them in Goals so the work has something to ladder up to.')}
                    </div>`;
        }

        const avg = Math.round(teamGoals.reduce((s, g) => s + (g.progress_pct || 0), 0) / teamGoals.length);

        return `<div class="block">
                    <div class="block-head">
                        <h3 class="h-block">This quarter</h3>
                        <span class="eyebrow">${esc(CONFIG.quarterLabel)}</span>
                    </div>
                    <div class="block-body">
                        <div style="margin-bottom:var(--s4)">
                            ${/* Accent, not a status colour: being at 54% mid-quarter
                                 is neither good nor bad, and colouring it red would
                                 say otherwise. */''}
                            ${ui.measureRow({ value: avg, max: 100, target: 100, label: avg + '%',
                                              tone: avg >= 100 ? 'good' : 'accent' })}
                        </div>
                        ${teamGoals.slice(0, 5).map(g => `
                            <div style="margin-bottom:var(--s3)">
                                <div style="display:flex;justify-content:space-between;gap:var(--s3);margin-bottom:3px">
                                    <span style="font-size:12.5px">${esc(g.title)}</span>
                                    <span class="num meta">${g.progress_pct || 0}%</span>
                                </div>
                                ${ui.measure({ value: g.progress_pct || 0, max: 100, size: 'xs',
                                               tone: (g.progress_pct || 0) >= 100 ? 'good' : 'accent' })}
                            </div>`).join('')}
                        <a href="#goals" class="meta">All goals &rarr;</a>
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
    }
};
