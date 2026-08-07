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
        // a picker that returns an empty screen.
        const people = auth.isAdmin
            ? CONFIG.team
            : CONFIG.team.filter(m => m.key === auth.key);

        if (!this.person || !people.some(p => p.key === this.person)) {
            this.person = people[0]?.key || auth.key;
        }

        const kpis = store.kpis.filter(k => k.member === this.person);

        if (kpis.length === 0) {
            document.getElementById('scorecard-figure').innerHTML = '—';
            body.innerHTML = `<div class="block">${ui.empty(
                'No measures set up',
                `There are no KPIs recorded for ${personName(this.person)}. They're seeded by migration — ask Kavya if this looks wrong.`
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
            ${this.measuresBlock(kpis)}`;

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
    }
};
