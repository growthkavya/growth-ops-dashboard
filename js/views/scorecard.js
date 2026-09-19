/**
 * KRAs & KPIs — the scorecard.
 *
 * Each person has five responsibility areas (KRAs), and within them a
 * set of measures (KPIs) whose weights sum to 100. Each measure is
 * scored 1–5 per month against a written standard.
 *
 * Two things this view refuses to do:
 *  - hide the standard behind a tooltip. You score honestly by reading
 *    what a 3 versus a 4 actually means, so the full standard is shown
 *    at the moment of scoring.
 *  - print a weighted average without saying how much of the period has
 *    been scored. A 4.6 from two of ten measures is not a 4.6.
 */

const scorecardView = {
    person: null,

    render() {
        const body = document.getElementById('scorecard-body');

        // Non-admins only have their own row under RLS, so don't offer
        // a picker that returns an empty screen. Interns carry no KPIs,
        // so they don't get an empty tab either.
        const people = (auth.isAdmin
            ? CONFIG.team
            : CONFIG.team.filter(m => m.key === auth.key))
            .filter(m => store.kpis.some(k => k.member === m.key));

        if (!this.person || !people.some(p => p.key === this.person)) {
            this.person = people[0]?.key || auth.key;
        }

        const kpis = store.kpis.filter(k => k.member === this.person);

        if (kpis.length === 0) {
            document.getElementById('scorecard-figure').innerHTML = '—';
            body.innerHTML = `<div class="block">${ui.empty(
                'No measures set up',
                `There are no KPIs recorded for ${personName(this.person)}. Ask Kavya if this looks wrong.`
            )}</div>`;
            return;
        }

        const summary = this.summarise(kpis);

        document.getElementById('scorecard-figure').innerHTML =
            summary.scored > 0 ? `${summary.weighted.toFixed(2)}<small>/5</small>` : '—';
        document.getElementById('scorecard-figure-label').textContent =
            summary.scored > 0 ? `Weighted · ${personName(this.person)}` : 'Not scored yet';

        body.innerHTML = `
            ${people.length > 1 ? `
                <div class="segments" style="margin-bottom:var(--s4)">
                    ${people.map(p =>
                        `<button class="segment ${this.person === p.key ? 'active' : ''}" data-person="${p.key}">${esc(p.name)}</button>`
                    ).join('')}
                </div>` : ''}

            ${this.coverageNote(summary, kpis)}
            ${this.areaBlock(kpis)}
            ${this.measuresBlock(kpis)}
            ${this.logBlock(kpis)}`;

        this.wire();
    },

    /* ---------- Maths --------------------------------------- */

    scoreFor(kpiId, month) {
        return store.scores.find(s =>
            s.kpi_id === kpiId && s.month === month && s.year === CONFIG.year);
    },

    /** The three months of the current quarter. */
    months() {
        const first = (CONFIG.quarter - 1) * 3 + 1;
        return [first, first + 1, first + 2].map(m => ({
            num: m,
            label: new Date(CONFIG.year, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' })
        }));
    },

    /** Latest score in the quarter for a measure, or null. */
    latest(kpiId) {
        for (const m of [...this.months()].reverse()) {
            const s = this.scoreFor(kpiId, m.num);
            if (s?.score != null) return s.score;
        }
        return null;
    },

    /**
     * Weighted average over scored measures only, plus how much weight
     * has actually been scored — reported together, never separately.
     */
    summarise(kpis) {
        let weighted = 0, scoredWeight = 0, scored = 0;
        const totalWeight = kpis.reduce((s, k) => s + (k.weight || 0), 0);

        for (const k of kpis) {
            const value = this.latest(k.id);
            if (value == null) continue;
            weighted += value * (k.weight || 0);
            scoredWeight += (k.weight || 0);
            scored += 1;
        }

        return {
            weighted: scoredWeight > 0 ? weighted / scoredWeight : 0,
            scored,
            total: kpis.length,
            scoredWeight,
            totalWeight
        };
    },

    coverageNote(summary, kpis) {
        if (summary.scored === summary.total) {
            return `<div class="weight-note">
                        <span>All ${summary.total} measures scored for ${esc(CONFIG.quarterLabel)}.</span>
                        <span class="num">Weights total ${summary.totalWeight}</span>
                    </div>`;
        }
        return `<div class="weight-note">
                    <span><strong>${summary.scored} of ${summary.total}</strong> measures scored so far${summary.scored ? ` — the ${summary.weighted.toFixed(2)} above covers ${summary.scoredWeight} of ${summary.totalWeight} weight` : ''}.</span>
                    <span class="num">Target ${CONFIG.scoreTarget}.0</span>
                </div>`;
    },

    /* ---------- Areas --------------------------------------- */

    areaBlock(kpis) {
        const areas = store.kras.map(kra => {
            const inArea = kpis.filter(k => k.kra_id === kra.id);
            if (inArea.length === 0) return null;

            const scored = inArea.map(k => this.latest(k.id)).filter(v => v != null);
            const avg = scored.length
                ? scored.reduce((a, b) => a + b, 0) / scored.length
                : null;

            return { kra, count: inArea.length, scoredCount: scored.length, avg };
        }).filter(Boolean);

        if (areas.length === 0) return '';

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Responsibility areas</h3>
                <span class="eyebrow">Marker shows the target of ${CONFIG.scoreTarget}</span>
            </div>
            <div class="block-body block-body--flush">
                ${areas.map(a => `
                    <div class="kra-band">
                        <span class="kra-rank num">${esc(a.kra.kra_code.replace('kra', ''))}</span>
                        <div class="kra-name">
                            ${esc(a.kra.name)}
                            <div class="meta">${a.scoredCount} of ${a.count} measures scored</div>
                        </div>
                        <div class="kra-track">
                            ${a.avg == null
                                ? ui.measure({ value: 0, max: CONFIG.scoreMax, target: CONFIG.scoreTarget, size: 'sm', tone: 'idle' })
                                : ui.measure({ value: a.avg, max: CONFIG.scoreMax, target: CONFIG.scoreTarget, size: 'sm' })}
                        </div>
                        <span class="kra-score">${a.avg == null ? '—' : a.avg.toFixed(1) + ' / 5'}</span>
                    </div>`).join('')}
            </div>
        </div>`;
    },

    /* ---------- Measures ------------------------------------ */

    measuresBlock(kpis) {
        const months = this.months();

        const rows = store.kras.map(kra => {
            const inArea = kpis.filter(k => k.kra_id === kra.id);
            if (inArea.length === 0) return '';

            return `<tr class="ledger-group">
                        <td colspan="${3 + months.length}">
                            <span class="eyebrow">${esc(kra.name)}</span>
                        </td>
                    </tr>`
                + inArea.map(k => `
                    <tr>
                        <td>
                            <div class="h-row">${esc(k.name)}</div>
                            ${k.measure ? `<div class="meta">${esc(k.measure)}</div>` : ''}
                        </td>
                        <td class="col-num">${k.weight || 0}</td>
                        ${months.map(m => {
                            const s = this.scoreFor(k.id, m.num);
                            const v = s?.score;
                            const band = v == null ? 'none'
                                       : v >= CONFIG.scoreTarget ? 'high'
                                       : v >= 3 ? 'mid' : 'low';
                            return `<td class="col-num">
                                        <button class="score-cell v-${band}" data-score="${k.id}" data-month="${m.num}"
                                                title="${esc(k.name)} — ${esc(m.label)}. Click to score.">
                                            ${v == null ? '·' : v}
                                        </button>
                                    </td>`;
                        }).join('')}
                        <td class="col-num muted">${CONFIG.scoreTarget}.0</td>
                    </tr>`).join('');
        }).join('');

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Monthly scores</h3>
                <span class="eyebrow">Click any month to score against the standard</span>
            </div>
            <div class="table-scroll">
                <table class="ledger">
                    <thead>
                        <tr>
                            <th>Measure</th>
                            <th style="text-align:right">Weight</th>
                            ${months.map(m => `<th style="text-align:right">${esc(m.label)}</th>`).join('')}
                            <th style="text-align:right">Target</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    },

    /* ---------- Scoring ------------------------------------- */

    wire() {
        const view = document.getElementById('view-scorecard');

        view.querySelectorAll('[data-person]').forEach(btn =>
            btn.addEventListener('click', () => {
                this.person = btn.dataset.person;
                this.render();
            }));

        view.querySelectorAll('[data-score]').forEach(btn =>
            btn.addEventListener('click', () =>
                this.openScorer(btn.dataset.score, parseInt(btn.dataset.month, 10))));

        view.querySelectorAll('[data-kpi-open]').forEach(el =>
            el.addEventListener('click', () => this.openKpi(el.dataset.kpiOpen)));

        view.querySelectorAll('[data-update]').forEach(btn =>
            btn.addEventListener('click', () =>
                this.openUpdate(btn.dataset.update, btn.dataset.period, btn.dataset.start)));

        view.querySelectorAll('[data-log-work]').forEach(btn =>
            btn.addEventListener('click', () => this.openLogWork(btn.dataset.logWork)));
    },

    openScorer(kpiId, month) {
        const kpi = store.kpis.find(k => k.id === kpiId);
        if (!kpi) return;

        const existing = this.scoreFor(kpiId, month);
        const monthName = new Date(CONFIG.year, month - 1, 1)
            .toLocaleDateString('en-IN', { month: 'long' });

        // The rubric is an array of five statements, one per score.
        const rubric = Array.isArray(kpi.rubric) ? kpi.rubric : null;

        const steps = rubric
            ? rubric.map((text, i) => {
                const value = i + 1;
                return `<button type="button" class="rubric-step ${existing?.score === value ? 'selected' : ''}" data-pick="${value}">
                            <span class="rubric-n">${value}</span>
                            <span>${esc(text)}</span>
                        </button>`;
              }).join('')
            : [1, 2, 3, 4, 5].map(value =>
                `<button type="button" class="rubric-step ${existing?.score === value ? 'selected' : ''}" data-pick="${value}">
                     <span class="rubric-n">${value}</span>
                     <span>${value === 5 ? 'Well above the standard' : value === 4 ? 'Meets the standard' : value === 3 ? 'Close, with gaps' : value === 2 ? 'Below the standard' : 'Not happening'}</span>
                 </button>`).join('');

        ui.modal({
            title: `${kpi.name} — ${monthName}`,
            wide: true,
            body: `
                ${kpi.definition ? `<p class="meta" style="margin-bottom:var(--s4)">${esc(kpi.definition)}</p>` : ''}
                ${kpi.measure ? `<p style="margin-bottom:var(--s5);font-size:13px"><span class="eyebrow">Measured by</span><br>${esc(kpi.measure)}</p>` : ''}

                <input type="hidden" name="score" id="picked-score" value="${existing?.score ?? ''}" required>
                <div class="field">
                    <label>Pick the statement that describes the month</label>
                    <div class="rubric" id="rubric">${steps}</div>
                    ${!rubric ? `<p class="field-hint">No written standard recorded for this measure — these are the generic bands.</p>` : ''}
                </div>

                ${ui.textarea('notes', 'Why this score', {
                    value: existing?.notes || '',
                    placeholder: 'The evidence behind it. Worth writing — this is what you\'ll read at review time.' })}`,
            submitLabel: existing ? 'Update score' : 'Save score',
            onSubmit: async (form) => {
                const score = parseInt(form.get('score'), 10);
                if (!score) throw new Error('Pick a score from the list above.');

                await data.saveScore({
                    kpi_id: kpiId,
                    month,
                    year: CONFIG.year,
                    score,
                    notes: form.get('notes') || null,
                    created_by: auth.userId
                });
                await data.log('scored', 'kpi', kpiId, `${kpi.name} — ${monthName}: ${score}`);
                toast(existing ? 'Score updated' : 'Score saved');
                await store.reload();
            }
        });

        // Wire the rubric picker after the modal is in the DOM.
        const holder = document.getElementById('rubric');
        holder.querySelectorAll('[data-pick]').forEach(step => {
            step.addEventListener('click', () => {
                holder.querySelectorAll('.rubric-step').forEach(s => s.classList.remove('selected'));
                step.classList.add('selected');
                document.getElementById('picked-score').value = step.dataset.pick;
            });
        });
    },

    /* ---------- Work log and updates ------------------------ */

    /** The last four Mondays, oldest first, so the row reads left to right. */
    weekStarts(n = 4) {
        const now = dates.weekStart();
        return Array.from({ length: n }, (_, i) => dates.addDays(now, -(n - 1 - i) * 7));
    },

    updateFor(kpiId, period, start) {
        return store.kpiUpdates.find(u =>
            u.kpi_id === kpiId && u.period === period && u.period_start === start);
    },

    workFor(kpiId) {
        return store.workItems.filter(w => w.kpi_id === kpiId);
    },

    canWrite(kpi) {
        return auth.isAdmin || kpi.member === auth.key;
    },

    /** Start of the current quarter, YYYY-MM-DD. */
    quarterStart() {
        return `${CONFIG.year}-${String((CONFIG.quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
    },

    logBlock(kpis) {
        const weeks = this.weekStarts();
        const month = dates.monthStart();
        const qStart = this.quarterStart();
        const monthLabel = new Date(month + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' });

        const dot = (kpi, period, start, label) => {
            const u = this.updateFor(kpi.id, period, start);
            const tone = u ? (VOCAB.healthTone[u.health] || 'none') : '';
            const can = this.canWrite(kpi);
            const title = u
                ? `${VOCAB.period[period]}, ${label}: ${u.summary.slice(0, 140)}`
                : can ? `Add the ${period === 'week' ? 'weekly update' : 'monthly summary'} for ${label}` : 'No update';
            return `<button type="button" class="upd-dot ${u ? 'has t-' + tone : ''}"
                        data-update="${kpi.id}" data-period="${period}" data-start="${start}"
                        title="${escAttr(title)}" ${!u && !can ? 'disabled' : ''}>${u ? '&#10003;' : '+'}</button>`;
        };

        const row = (k) => {
            const work = this.workFor(k.id);
            const doneQ = work.filter(w => w.status === 'done' && w.completed_at && dates.iso(w.completed_at) >= qStart).length;
            const open = work.filter(w => w.status !== 'done').length;
            return `<div class="kpi-log-row" style="--weeks:${weeks.length}">
                <div>
                    <a href="#scorecard" class="h-row" data-kpi-open="${k.id}">${esc(k.name)}</a>
                    <div class="meta">${work.length ? `${work.length} item${work.length === 1 ? '' : 's'} logged in total` : 'Nothing logged yet'}</div>
                </div>
                <div class="kpi-log-count" title="Finished this quarter · still open"><b>${doneQ}</b>${open ? ` <span class="muted">+${open}</span>` : ''}</div>
                ${weeks.map(w => `<div class="upd-week">${dot(k, 'week', w, 'week of ' + dates.short(w))}</div>`).join('')}
                <div>${dot(k, 'month', month, monthLabel)}</div>
                <div style="text-align:right">${this.canWrite(k)
                    ? `<button class="btn btn-sm" data-log-work="${k.id}">Log work</button>` : ''}</div>
            </div>`;
        };

        const groups = store.kras.map(kra => {
            const inArea = kpis.filter(k => k.kra_id === kra.id);
            if (!inArea.length) return '';
            return `<div class="ledger-group" style="padding:var(--s2) var(--s4);background:var(--surface-sunk);border-bottom:1px solid var(--line)">
                        <span class="eyebrow">${esc(kra.name)}</span></div>`
                + inArea.map(row).join('');
        }).join('');

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Work log and updates</h3>
                <span class="eyebrow">Weekly update by Saturday · monthly summary by the 3rd working day</span>
            </div>
            <div class="kpi-log-row kpi-log-head" style="--weeks:${weeks.length}">
                <span>Measure</span><span title="Finished this quarter, plus still open">Work (qtr)</span>
                ${weeks.map(w => `<span class="upd-week">${esc(dates.short(w))}</span>`).join('')}
                <span>${esc(monthLabel)}</span><span></span>
            </div>
            ${groups}
        </div>`;
    },

    /** Everything recorded under one KPI, newest first. */
    openKpi(kpiId) {
        const kpi = store.kpis.find(k => k.id === kpiId);
        if (!kpi) return;
        const parent = kpi.supports_kpi_id ? store.kpis.find(k => k.id === kpi.supports_kpi_id) : null;

        const items = [
            ...this.workFor(kpiId).map(w => ({
                when: w.status === 'done' ? (w.completed_at ? dates.iso(w.completed_at) : '') : (w.due_date || ''),
                html: `<div class="timeline-title">${w.output_link
                            ? `<a href="${escAttr(w.output_link)}" target="_blank" rel="noopener">${esc(w.title)} &#8599;</a>`
                            : esc(w.title)} ${ui.statusChip(w.status)}</div>
                       ${w.description ? `<div class="timeline-body">${esc(w.description)}</div>` : ''}`
            })),
            ...store.kpiUpdates.filter(u => u.kpi_id === kpiId).map(u => ({
                when: u.period_start,
                html: `<div class="timeline-title">${esc(VOCAB.period[u.period])}${u.period === 'week' ? `, week of ${esc(dates.short(u.period_start))}` : `, ${esc(new Date(u.period_start + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }))}`}
                            ${u.health ? ui.chip(VOCAB.health[u.health], VOCAB.healthTone[u.health]) : ''}</div>
                       <div class="timeline-body">${esc(u.summary)}</div>
                       ${u.links ? `<div class="meta" style="margin-top:4px">${u.links.split(/\s+/).filter(Boolean).map(l =>
                            `<a href="${escAttr(l)}" target="_blank" rel="noopener">${esc(l.replace(/^https?:\/\//, '').slice(0, 60))}</a>`).join(' · ')}</div>` : ''}`
            })),
            ...store.scores.filter(s => s.kpi_id === kpiId && s.score != null).map(s => ({
                when: `${s.year}-${String(s.month).padStart(2, '0')}-28`,
                html: `<div class="timeline-title">Scored ${esc(s.score)} for ${esc(new Date(s.year, s.month - 1, 1).toLocaleDateString('en-IN', { month: 'long' }))}</div>
                       ${s.notes ? `<div class="timeline-body">${esc(s.notes)}</div>` : ''}`
            }))
        ].sort((a, b) => (b.when || '').localeCompare(a.when || ''));

        const can = this.canWrite(kpi);
        ui.modal({
            title: kpi.name,
            wide: true,
            body: `
                <p class="meta">${esc(personName(kpi.member))} · ${esc(store.kraById(kpi.kra_id)?.name || '')} · weight ${kpi.weight || 0}</p>
                ${kpi.definition ? `<p style="margin:var(--s3) 0;font-size:13px">${esc(kpi.definition)}</p>` : ''}
                ${kpi.measure ? `<p style="margin-bottom:var(--s3);font-size:13px"><span class="eyebrow">Measured by</span><br>${esc(kpi.measure)}</p>` : ''}
                ${parent ? `<p style="margin-bottom:var(--s3);font-size:13px"><span class="eyebrow">Supports</span><br>${esc(personName(parent.member))}'s ${esc(parent.name)}</p>` : ''}
                ${can ? `<div class="filters" style="margin:var(--s4) 0">
                    <button type="button" class="btn btn-sm btn-primary" id="kpi-log-work">Log work</button>
                    <button type="button" class="btn btn-sm" id="kpi-week">This week's update</button>
                    <button type="button" class="btn btn-sm" id="kpi-month">This month's summary</button>
                </div>` : ''}
                <div class="timeline">
                    ${items.length ? items.map(i => `<div class="timeline-item">
                        <div class="timeline-when">${esc(i.when ? dates.short(i.when) : 'No date')}</div>
                        <div>${i.html}</div></div>`).join('')
                    : ui.empty('Nothing recorded yet', 'Work logged under this KPI and the weekly and monthly updates appear here, newest first.')}
                </div>`
        });

        document.getElementById('kpi-log-work')?.addEventListener('click', () => this.openLogWork(kpiId));
        document.getElementById('kpi-week')?.addEventListener('click', () => this.openUpdate(kpiId, 'week', dates.weekStart()));
        document.getElementById('kpi-month')?.addEventListener('click', () => this.openUpdate(kpiId, 'month', dates.monthStart()));
    },

    openUpdate(kpiId, period, start) {
        const kpi = store.kpis.find(k => k.id === kpiId);
        if (!kpi) return;
        const u = this.updateFor(kpiId, period, start);
        const can = this.canWrite(kpi);
        const label = period === 'week'
            ? `week of ${dates.short(start)}`
            : new Date(start + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

        const doneInPeriod = this.workFor(kpiId).filter(w => {
            if (w.status !== 'done' || !w.completed_at) return false;
            const on = dates.iso(w.completed_at);
            const end = period === 'week' ? dates.addDays(start, 6) : dates.monthDays(+start.slice(0, 4), +start.slice(5, 7)).pop();
            return on >= start && on <= end;
        });

        ui.modal({
            title: `${kpi.name} · ${label}`,
            wide: true,
            body: `
                ${doneInPeriod.length ? `<div class="notice" style="margin-bottom:var(--s4)">
                    <strong>Logged in this period:</strong> ${doneInPeriod.map(w => esc(w.title)).join('; ')}</div>` : ''}
                ${ui.textarea('summary', period === 'week' ? 'What happened this week' : 'The month in summary', {
                    value: u?.summary || '',
                    placeholder: period === 'week'
                        ? 'What was done, what moved, anything stuck and who it is waiting on.'
                        : 'Where this KPI stands against its target, with the evidence. This is what the score is based on.' })}
                ${ui.textarea('links', 'Links to the work', { value: u?.links || '', placeholder: 'One link per line' })}
                ${ui.select('health', 'Against the target', [
                    { value: '', label: 'Not saying' },
                    ...Object.entries(VOCAB.health).map(([value, label]) => ({ value, label }))
                ], { value: u?.health || '' })}`,
            submitLabel: can ? (u ? 'Save changes' : 'Save update') : 'Close',
            danger: u && (auth.isAdmin || u.created_by === auth.userId) ? {
                label: 'Delete',
                confirm: 'Delete this update?',
                run: async () => {
                    await data.deleteKpiUpdate(u.id);
                    toast('Update deleted');
                    await store.reload();
                }
            } : null,
            onSubmit: can ? async (form) => {
                const summary = (form.get('summary') || '').trim();
                if (!summary) throw new Error('Write a line or two first.');
                await data.saveKpiUpdate({
                    kpi_id: kpiId,
                    member: kpi.member,
                    period,
                    period_start: start,
                    summary,
                    links: (form.get('links') || '').trim() || null,
                    health: form.get('health') || null
                });
                await data.log('updated', 'kpi', kpiId, `${kpi.name}: ${VOCAB.period[period].toLowerCase()}, ${label}`);
                toast(u ? 'Update saved' : 'Update added');
                await store.reload();
            } : null
        });
    },

    /** Quick capture of a finished (or running) piece of work under a KPI. */
    openLogWork(kpiId) {
        const kpi = store.kpis.find(k => k.id === kpiId);
        if (!kpi) return;

        ui.modal({
            title: `Log work · ${kpi.name}`,
            wide: true,
            body: `
                ${ui.field('title', 'What was done', { required: true, placeholder: 'Built the webinar follow-up journey in LeadSquared' })}
                <div class="field-pair">
                    ${ui.select('status', 'Status', [
                        { value: 'done', label: VOCAB.status.done },
                        { value: 'in_progress', label: VOCAB.status.in_progress }
                    ], { value: 'done' })}
                    ${ui.field('when', 'Finished on', { type: 'date', value: dates.today(), hint: 'For work still running, this is left empty.' })}
                </div>
                ${ui.field('output_link', 'Link to the output', { type: 'url', placeholder: 'https://' })}
                ${ui.textarea('description', 'Detail', { placeholder: 'What it is, and the result if there is one.' })}`,
            submitLabel: 'Log it',
            onSubmit: async (form) => {
                const title = (form.get('title') || '').trim();
                if (!title) throw new Error('Say what was done.');
                const status = form.get('status');
                const when = form.get('when');
                if (status === 'done' && when && when > dates.today()) {
                    throw new Error('A finished date can\'t be in the future.');
                }

                const row = await data.createWorkItem({
                    action_id: `w-${Date.now()}`,
                    title,
                    description: form.get('description') || null,
                    status,
                    percent_done: status === 'done' ? 100 : 25,
                    owner_name: kpi.member,
                    kpi_id: kpi.id,
                    kra_id: kpi.kra_id,
                    output_link: form.get('output_link') || null,
                    completed_at: status === 'done' && when ? new Date(`${when}T18:00:00+05:30`).toISOString() : null,
                    assigned_by: auth.userId,
                    assigned_by_name: auth.name,
                    assigned_at: new Date().toISOString()
                });
                await data.log('logged', 'work_item', row.id, `${title} (${kpi.name})`);
                toast('Logged');
                await store.reload();
            }
        });
    }
};
