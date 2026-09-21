/**
 * KRAs & KPIs: one table, one job.
 *
 * Every responsibility area, the measures under it, and the score for
 * whichever period you are looking at. Nothing else lives here: the work
 * behind a score is in Work log, and the tasks still open are in
 * Delegations. The first build showed all three at once, which made the
 * page hard to read and the same thing appear three ways.
 *
 * Two things this view refuses to do:
 *  - hide the standard behind a tooltip. You score honestly by reading
 *    what a 3 versus a 4 actually means, so the full standard is shown
 *    at the moment of scoring.
 *  - print a weighted average without saying how much has been scored.
 *    A 4.6 from two of fifteen measures is not a 4.6.
 */

const scorecardView = {
    person: null,
    period: 'week',        // 'week' or 'quarter'
    anchor: null,          // first day of the period being shown

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
        if (!this.anchor) this.anchor = this.periodStart();

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
            summary.scored > 0 ? `${summary.weighted.toFixed(1)}<small>/5</small>` : '—';
        document.getElementById('scorecard-figure-label').textContent =
            summary.scored > 0 ? `Score · ${this.periodLabel()}` : 'Not scored yet';

        body.innerHTML = `
            ${this.controls(people)}
            ${this.table(kpis, summary)}`;

        this.wire();
    },

    /* ---------- The period being looked at ------------------ */

    /** First day of the period containing `iso`. */
    periodStart(iso = dates.today()) {
        if (this.period === 'week') return dates.weekStart(iso);
        const q = Math.floor((+iso.slice(5, 7) - 1) / 3);
        return `${iso.slice(0, 4)}-${String(q * 3 + 1).padStart(2, '0')}-01`;
    },

    shift(step) {
        this.anchor = this.period === 'week'
            ? dates.addDays(this.anchor, 7 * step)
            : this.periodStart(dates.addDays(this.anchor, step > 0 ? 95 : -1));
        this.render();
    },

    periodLabel(anchor = this.anchor) {
        if (this.period === 'week') {
            const end = dates.addDays(anchor, 5);       // Monday to Saturday
            return `${dates.short(anchor)} to ${dates.short(end)}`;
        }
        const q = Math.floor((+anchor.slice(5, 7) - 1) / 3) + 1;
        return `Q${q} ${anchor.slice(0, 4)}`;
    },

    isCurrent() {
        return this.anchor === this.periodStart();
    },

    /* ---------- Scores -------------------------------------- */

    scoreFor(kpiId) {
        return store.scores.find(s =>
            s.kpi_id === kpiId && s.period === this.period && s.period_start === this.anchor);
    },

    /**
     * Weighted average over scored measures only, plus how much weight
     * has actually been scored. Reported together, never separately.
     */
    summarise(kpis) {
        let weighted = 0, scoredWeight = 0, scored = 0;
        const totalWeight = kpis.reduce((s, k) => s + (k.weight || 0), 0);

        for (const k of kpis) {
            const value = this.scoreFor(k.id)?.score;
            if (value == null) continue;
            weighted += value * (k.weight || 0);
            scoredWeight += (k.weight || 0);
            scored += 1;
        }

        return {
            weighted: scoredWeight > 0 ? weighted / scoredWeight : 0,
            scored, total: kpis.length, scoredWeight, totalWeight
        };
    },

    /* ---------- Chrome -------------------------------------- */

    controls(people) {
        return `<div class="bar">
            ${people.length > 1 ? `
                <div class="segments">
                    ${people.map(p =>
                        `<button class="segment ${this.person === p.key ? 'active' : ''}" data-person="${p.key}">${esc(p.name)}</button>`
                    ).join('')}
                </div>` : ''}

            <div class="segments">
                <button class="segment ${this.period === 'week' ? 'active' : ''}" data-period="week">By week</button>
                <button class="segment ${this.period === 'quarter' ? 'active' : ''}" data-period="quarter">By quarter</button>
            </div>

            <div class="stepper">
                <button class="btn btn-sm btn-quiet" data-step="-1" aria-label="Earlier">&#8249;</button>
                <span class="stepper-now num">${esc(this.periodLabel())}${this.isCurrent() ? ' · now' : ''}</span>
                <button class="btn btn-sm btn-quiet" data-step="1" aria-label="Later" ${this.isCurrent() ? 'disabled' : ''}>&#8250;</button>
            </div>
        </div>`;
    },

    /* ---------- The table ----------------------------------- */

    table(kpis, summary) {
        const rows = store.kras.map(kra => {
            const inArea = kpis.filter(k => k.kra_id === kra.id);
            if (!inArea.length) return '';

            const weight = inArea.reduce((s, k) => s + (k.weight || 0), 0);
            const got = inArea.map(k => this.scoreFor(k.id)?.score).filter(v => v != null);
            const avg = got.length ? got.reduce((a, b) => a + b, 0) / got.length : null;

            return `<tr class="ledger-group">
                    <td><span class="eyebrow">${esc(kra.name)}</span></td>
                    <td class="col-num"><span class="eyebrow">${weight}%</span></td>
                    <td class="col-num">${avg == null
                        ? '<span class="muted">not scored</span>'
                        : `<span class="eyebrow">area ${avg.toFixed(1)}</span>`}</td>
                    <td></td>
                </tr>`
                + inArea.map(k => {
                    const s = this.scoreFor(k.id);
                    const v = s?.score;
                    const band = v == null ? 'none' : v >= CONFIG.scoreTarget ? 'high' : v >= 3 ? 'mid' : 'low';
                    return `<tr>
                        <td>
                            <div class="h-row">${esc(k.name)}</div>
                            ${k.definition ? `<div class="meta clamp">${esc(k.definition)}</div>` : ''}
                        </td>
                        <td class="col-num">${k.weight || 0}%</td>
                        <td class="col-num">
                            <button class="score-cell v-${band}" data-score="${k.id}"
                                    title="Score ${esc(k.name)} for ${esc(this.periodLabel())}">${v == null ? '+' : v}</button>
                        </td>
                        <td class="col-num muted">${s?.notes ? esc(s.notes.slice(0, 60)) + (s.notes.length > 60 ? '…' : '') : ''}</td>
                    </tr>`;
                }).join('');
        }).join('');

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">${esc(personName(this.person))}${this.person === auth.key ? '' : "'s"} measures</h3>
                <span class="eyebrow">${summary.scored} of ${summary.total} scored${
                    summary.scored ? ` · ${summary.scoredWeight} of ${summary.totalWeight}% covered` : ''}</span>
            </div>
            <div class="table-scroll">
                <table class="ledger ledger--roomy">
                    <thead>
                        <tr>
                            <th>Measure</th>
                            <th style="text-align:right">Weight</th>
                            <th style="text-align:right">Score</th>
                            <th>Why</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="weight-note">
                <span>Click a score to set it. 4 out of 5 means the target was met.</span>
                <span class="num">Target ${CONFIG.scoreTarget}.0</span>
            </div>
        </div>`;
    },

    /* ---------- Interaction --------------------------------- */

    wire() {
        const view = document.getElementById('view-scorecard');

        view.querySelectorAll('[data-person]').forEach(btn =>
            btn.addEventListener('click', () => { this.person = btn.dataset.person; this.render(); }));

        view.querySelectorAll('[data-period]').forEach(btn =>
            btn.addEventListener('click', () => {
                this.period = btn.dataset.period;
                this.anchor = this.periodStart();
                this.render();
            }));

        view.querySelectorAll('[data-step]').forEach(btn =>
            btn.addEventListener('click', () => this.shift(parseInt(btn.dataset.step, 10))));

        view.querySelectorAll('[data-score]').forEach(btn =>
            btn.addEventListener('click', () => this.openScorer(btn.dataset.score)));
    },

    /** The written standard, then the score, then why. In that order. */
    openScorer(kpiId) {
        const kpi = store.kpis.find(k => k.id === kpiId);
        if (!kpi) return;

        const existing = this.scoreFor(kpiId);
        const rubric = Array.isArray(kpi.rubric) ? kpi.rubric : null;
        const done = store.workItems.filter(w =>
            w.kpi_id === kpiId && w.status === 'done' && w.completed_at &&
            dates.iso(w.completed_at) >= this.anchor &&
            dates.iso(w.completed_at) <= (this.period === 'week'
                ? dates.addDays(this.anchor, 6)
                : dates.addDays(this.periodStart(dates.addDays(this.anchor, 95)), -1)));

        const steps = (rubric || [
            'Not happening', 'Below the standard', 'Close, with gaps',
            'Meets the standard', 'Above the standard'
        ]).map((text, i) => {
            const value = i + 1;
            return `<button type="button" class="rubric-step ${existing?.score === value ? 'selected' : ''}" data-pick="${value}">
                        <span class="rubric-n">${value}</span>
                        <span>${esc(text)}</span>
                    </button>`;
        }).join('');

        ui.modal({
            title: `${kpi.name} · ${this.periodLabel()}`,
            wide: true,
            body: `
                ${kpi.definition ? `<p class="meta" style="margin-bottom:var(--s3)">${esc(kpi.definition)}</p>` : ''}
                ${kpi.measure ? `<p style="margin-bottom:var(--s4);font-size:13px"><span class="eyebrow">How it is measured</span><br>${esc(kpi.measure)}</p>` : ''}
                ${done.length ? `<div class="notice" style="margin-bottom:var(--s4)">
                    <strong>Finished in this period:</strong> ${done.map(w => esc(w.title)).join('; ')}</div>` : ''}

                <input type="hidden" name="score" id="picked-score" value="${existing?.score ?? ''}" required>
                <div class="field">
                    <label>Pick the line that describes it</label>
                    <div class="rubric" id="rubric">${steps}</div>
                </div>

                ${ui.textarea('notes', 'Why this score', {
                    value: existing?.notes || '',
                    placeholder: 'The evidence behind it. This is what you will read at review time.' })}`,
            submitLabel: existing ? 'Update score' : 'Save score',
            danger: existing ? {
                label: 'Clear score',
                confirm: `Remove the ${this.periodLabel()} score for ${kpi.name}?`,
                run: async () => {
                    await data.deleteScore(existing.id);
                    toast('Score cleared');
                    await store.reload();
                }
            } : null,
            onSubmit: async (form) => {
                const score = parseInt(form.get('score'), 10);
                if (!score) throw new Error('Pick a score from the list above.');

                await data.saveScore({
                    kpi_id: kpiId,
                    period: this.period,
                    period_start: this.anchor,
                    score,
                    notes: form.get('notes') || null,
                    created_by: auth.userId
                });
                await data.log('scored', 'kpi', kpiId, `${kpi.name} · ${this.periodLabel()}: ${score}`);
                toast(existing ? 'Score updated' : 'Score saved');
                await store.reload();
            }
        });

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
