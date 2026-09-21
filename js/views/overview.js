/**
 * Overview: the leadership page.
 *
 * What the vertical committed to, where it has got to, and what it has
 * shipped. Read only, on purpose: nothing here can be edited, so it can
 * be opened in a review without anyone worrying about changing a number.
 */

const overviewView = {

    render() {
        const body = document.getElementById('overview-body');
        if (!body) return;

        const year = store.goalsOfType('year');
        const pct = year.length
            ? Math.round(year.reduce((s, g) => s + store.goalProgress(g).pct, 0) / year.length)
            : 0;

        document.getElementById('overview-figure').innerHTML = `${pct}<small>%</small>`;
        document.getElementById('overview-figure-label').textContent = `The year so far`;

        body.innerHTML = `
            ${this.yearBlock(year)}
            <div class="grid-side">
                <div>
                    ${this.periodBlock('month', 'This month')}
                    ${this.periodBlock('week', 'This week')}
                    ${this.shippedBlock()}
                </div>
                <div>
                    ${this.scoreBlock()}
                    ${this.teamBlock()}
                </div>
            </div>`;
    },

    /* ---------- The year ------------------------------------- */

    yearBlock(goals) {
        if (!goals.length) return '';
        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">What Growth &amp; Ops is delivering this year</h3>
                <span class="eyebrow">One goal per responsibility area</span>
            </div>
            <div class="block-body block-body--flush">
                ${goals.map(g => {
                    const p = store.goalProgress(g);
                    const kra = store.kraById(g.kra_id);
                    return `<div class="goal-row">
                        <div class="goal-main">
                            <div class="row-title">${esc(g.title)}</div>
                            <div class="row-sub">
                                ${kra ? ui.chip(kra.short_name || kra.name) : ''}
                                ${g.target ? ui.chip(`Target: ${g.target}`) : ''}
                                ${p.from === 'work' ? ui.chip(`${p.done} of ${p.total} tasks done`) : ''}
                            </div>
                        </div>
                        <div class="goal-measure">
                            ${ui.measureRow({ value: p.pct, max: 100, label: `${p.pct}%`,
                                tone: p.pct === 100 ? 'good' : p.pct === 0 ? 'idle' : 'accent' })}
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    },

    periodBlock(type, title) {
        const goals = store.goalsOfType(type);
        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">${esc(title)}</h3>
                <span class="eyebrow">${goals.length} goal${goals.length === 1 ? '' : 's'}</span>
            </div>
            <div class="block-body block-body--flush">
                ${goals.length ? goals.map(g => {
                    const p = store.goalProgress(g);
                    return `<div class="goal-row">
                        <div class="goal-main">
                            <div class="row-title">${esc(g.title)}</div>
                            <div class="row-sub">
                                ${p.from === 'work' ? ui.chip(`${p.done} of ${p.total} done`, p.pct === 100 ? 'good' : '') : ''}
                                ${g.due_date ? ui.chip(`by ${dates.short(g.due_date)}`) : ''}
                            </div>
                        </div>
                        <div class="goal-measure">${ui.measure({ value: p.pct, max: 100, size: 'sm' })}</div>
                    </div>`;
                }).join('') : ui.empty('Nothing set', 'No goals for this period yet.')}
            </div>
        </div>`;
    },

    /* ---------- What shipped --------------------------------- */

    shippedBlock() {
        const done = store.workItems
            .filter(w => w.status === 'done' && w.completed_at)
            .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
            .slice(0, 12);

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Recently finished</h3>
                <span class="eyebrow">Last 12</span>
            </div>
            <div class="log-items">
                ${done.map(w => `
                    <div class="log-item" style="cursor:default">
                        <span class="log-when num">${esc(dates.short(dates.iso(w.completed_at)))}</span>
                        <div class="log-body">
                            <div class="log-title">${w.output_link
                                ? `<a href="${escAttr(w.output_link)}" target="_blank" rel="noopener">${esc(w.title)} &#8599;</a>`
                                : esc(w.title)}</div>
                            <div class="meta">${esc(personName(w.owner_name))}${w.kpis ? ' · ' + esc(w.kpis.name) : ''}</div>
                        </div>
                    </div>`).join('')}
            </div>
        </div>`;
    },

    /* ---------- Scores and team ------------------------------ */

    scoreBlock() {
        const rows = CONFIG.team
            .map(m => ({ m, kpis: store.kpis.filter(k => k.member === m.key) }))
            .filter(r => r.kpis.length);

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Scores</h3>
                <span class="eyebrow">Latest against a target of ${CONFIG.scoreTarget}</span>
            </div>
            <div class="block-body block-body--flush">
                ${rows.map(({ m, kpis }) => {
                    const latest = kpis.map(k => {
                        const s = store.scores.filter(x => x.kpi_id === k.id)
                            .sort((a, b) => (b.period_start || '').localeCompare(a.period_start || ''))[0];
                        return s?.score;
                    }).filter(v => v != null);
                    const avg = latest.length ? latest.reduce((a, b) => a + b, 0) / latest.length : null;

                    return `<div class="person">
                        ${ui.avatar(m.name, m.key)}
                        <div class="person-main">
                            <div class="person-name">${esc(m.name)}</div>
                            <div class="person-role">${esc(m.role)}</div>
                        </div>
                        <div class="person-stats">
                            <div class="person-stat">
                                <div class="person-stat-val">${avg == null ? '—' : avg.toFixed(1)}</div>
                                <span class="eyebrow">${latest.length} of ${kpis.length} scored</span>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    },

    teamBlock() {
        const today = dates.today();
        const rows = CONFIG.team.filter(m => m.attendance !== false);

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Team today</h3>
                <span class="eyebrow">${esc(dates.short(today))}</span>
            </div>
            <div class="block-body block-body--flush">
                ${rows.map(m => {
                    const r = store.attendance.find(a => a.member_key === m.key && a.work_date === today);
                    const open = store.workItems.filter(w => w.owner_name === m.key && w.status !== 'done').length;
                    return `<div class="person">
                        ${ui.avatar(m.name, m.key)}
                        <div class="person-main">
                            <div class="person-name">${esc(m.name)}</div>
                            <div class="person-role">${r?.check_in_at ? `In since ${dates.time(r.check_in_at)}` :
                                r ? (VOCAB.attendance[r.status] || r.status) : 'Not checked in'}</div>
                        </div>
                        <div class="person-stats">
                            <div class="person-stat">
                                <div class="person-stat-val">${open}</div>
                                <span class="eyebrow">open</span>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }
};
