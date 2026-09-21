/**
 * KPIs: every measure, the score for the period, and the work behind it.
 *
 * One list grouped by responsibility area. Open a measure to read what
 * it means, how it is measured, what is planned under it and what was
 * finished in the period. Scoring shows the written standard, because
 * you score honestly by reading what a 3 versus a 4 actually means.
 */

const scorecardView = {
    person: null,
    period: 'week',        // 'week' or 'quarter'
    anchor: null,          // first day of the period being shown
    opened: {},            // kpi id -> details open

    render() {
        const body = document.getElementById('scorecard-body');

        const people = (auth.isAdmin || auth.isLeader ? CONFIG.team : CONFIG.team.filter(m => m.key === auth.key))
            .filter(m => store.kpis.some(k => k.member === m.key));
        if (!this.person || !people.some(p => p.key === this.person)) this.person = people[0]?.key || auth.key;
        if (!this.anchor) this.anchor = this.periodStart();

        const kpis = store.kpis.filter(k => k.member === this.person);
        if (!kpis.length) {
            body.innerHTML = `<div class="list">${ui.empty('No measures set up', `There are no KPIs recorded for ${personName(this.person)}.`)}</div>`;
            return;
        }

        const s = this.summarise(kpis);
        body.innerHTML = `
            ${this.controls(people)}
            <p class="score-line">
                ${s.scored ? `<b>${s.scored} of ${s.total}</b> scored for ${esc(this.periodLabel())}, weighted <b>${s.weighted.toFixed(1)}</b> of 5 over ${s.scoredWeight}% of the weight.`
                           : `Nothing scored yet for ${esc(this.periodLabel())}. Open a measure and pick the line that describes it.`}
                Target is ${CONFIG.scoreTarget}.
            </p>
            <div class="list">${this.rows(kpis)}</div>`;

        this.wire();
    },

    /* ---------- Periods ------------------------------------- */

    periodStart(iso = dates.today()) {
        if (this.period === 'week') return dates.weekStart(iso);
        const q = Math.floor((+iso.slice(5, 7) - 1) / 3);
        return `${iso.slice(0, 4)}-${String(q * 3 + 1).padStart(2, '0')}-01`;
    },

    periodEnd(anchor = this.anchor) {
        return this.period === 'week' ? dates.addDays(anchor, 6)
            : dates.addDays(this.periodStart(dates.addDays(anchor, 95)), -1);
    },

    shift(step) {
        this.anchor = this.period === 'week' ? dates.addDays(this.anchor, 7 * step)
            : this.periodStart(dates.addDays(this.anchor, step > 0 ? 95 : -1));
        this.render();
    },

    periodLabel(anchor = this.anchor) {
        if (this.period === 'week') return `${dates.short(anchor)} to ${dates.short(dates.addDays(anchor, 5))}`;
        const q = Math.floor((+anchor.slice(5, 7) - 1) / 3) + 1;
        return `Q${q} ${anchor.slice(0, 4)}`;
    },

    isCurrent() { return this.anchor === this.periodStart(); },

    scoreFor(kpiId) {
        return store.scores.find(s => s.kpi_id === kpiId && s.period === this.period && s.period_start === this.anchor);
    },

    lastScore(kpiId) {
        return store.scores.filter(s => s.kpi_id === kpiId).sort((a, b) => (b.period_start || '').localeCompare(a.period_start || ''))[0];
    },

    summarise(kpis) {
        let weighted = 0, scoredWeight = 0, scored = 0;
        const totalWeight = kpis.reduce((s, k) => s + (k.weight || 0), 0);
        for (const k of kpis) {
            const v = this.scoreFor(k.id)?.score;
            if (v == null) continue;
            weighted += v * (k.weight || 0); scoredWeight += (k.weight || 0); scored += 1;
        }
        return { weighted: scoredWeight ? weighted / scoredWeight : 0, scored, total: kpis.length, scoredWeight, totalWeight };
    },

    /* ---------- Markup -------------------------------------- */

    controls(people) {
        return `<div class="bar">
            ${people.length > 1 ? `<div class="segments">${people.map(p =>
                `<button class="segment ${this.person === p.key ? 'active' : ''}" data-person="${p.key}">${esc(p.name)}</button>`).join('')}</div>` : ''}
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

    rows(kpis) {
        return store.kras.map(kra => {
            const inArea = kpis.filter(k => k.kra_id === kra.id);
            if (!inArea.length) return '';
            const weight = inArea.reduce((s, k) => s + (k.weight || 0), 0);
            const got = inArea.map(k => this.scoreFor(k.id)?.score).filter(v => v != null);
            const avg = got.length ? (got.reduce((a, b) => a + b, 0) / got.length).toFixed(1) : null;
            return `<div class="kpi-area"><span>${esc(kra.name)}</span><span>${weight}% of the score${avg ? ` · averaging ${avg}` : ''}</span></div>`
                 + inArea.map(k => this.kpiRow(k)).join('');
        }).join('');
    },

    kpiRow(k) {
        const s = this.scoreFor(k.id);
        const v = s?.score;
        const band = v == null ? 'none' : v >= CONFIG.scoreTarget ? 'high' : v >= 3 ? 'mid' : 'low';
        const last = this.lastScore(k.id);
        const canScore = !auth.isLeader && (auth.isAdmin || k.member === auth.key);
        const sub = v != null ? (s.notes ? s.notes : 'Scored')
                  : last ? `Last scored ${last.score} for ${last.period === 'week' ? 'the week of ' : ''}${dates.short(last.period_start)}`
                  : 'Not scored yet';

        return `<details class="kpi" data-kpi="${k.id}" ${this.opened[k.id] ? 'open' : ''}>
            <summary>
                <div>
                    <div class="kpi-name">${esc(k.name)}</div>
                    <div class="kpi-sub">${esc(sub)}</div>
                </div>
                <div class="kpi-w">${k.weight || 0}%</div>
                <div class="kpi-score">
                    ${canScore ? `<button class="score-btn v-${band}" data-score="${k.id}" title="Score this measure">${v == null ? 'Score' : v}</button>`
                               : `<span class="score-btn v-${band}" style="cursor:default">${v == null ? '·' : v}</span>`}
                </div>
            </summary>
            ${this.kpiDetail(k)}
        </details>`;
    },

    kpiDetail(k) {
        const from = this.anchor, to = this.periodEnd();
        const items = store.workItems.filter(w => w.kpi_id === k.id);
        const planned = store.open(items).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
        const finished = items.filter(w => w.status === 'done' && w.completed_at && dates.iso(w.completed_at) >= from && dates.iso(w.completed_at) <= to)
            .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
        const projects = [...new Set(items.map(w => w.project_id).filter(Boolean))].map(id => store.projectById(id)).filter(Boolean);
        const support = auth.isAdmin ? store.kpis.filter(x => x.supports_kpi_id === k.id) : [];

        return `<div class="kpi-detail">
            ${k.definition ? `<p>${esc(k.definition)}</p>` : ''}
            ${k.measure ? `<p class="meta" style="margin-top:6px">Measured by: ${esc(k.measure)}</p>` : ''}
            ${support.length ? `<p class="meta" style="margin-top:6px">Riya's measures under this one: ${support.map(x => esc(x.name)).join(', ')}</p>` : ''}

            <h4>Planned</h4>
            ${planned.length ? `<div class="list">${planned.map(w => ui.taskRow(w)).join('')}</div>`
                             : `<p class="meta">Nothing planned under this measure yet.</p>`}

            <h4>Finished in ${esc(this.periodLabel())}</h4>
            ${finished.length ? `<div class="list">${finished.map(w => ui.taskRow(w, { when: 'done' })).join('')}</div>`
                              : `<p class="meta">Nothing finished in this period.</p>`}

            ${projects.length ? `<h4>Projects</h4><p>${projects.map(p => `<a href="#projects/${escAttr(p.slug)}" data-project="${escAttr(p.slug)}">${esc(p.name)}</a>`).join(' · ')}</p>` : ''}
        </div>`;
    },

    /* ---------- Interaction --------------------------------- */

    wire() {
        const view = document.getElementById('view-scorecard');
        view.querySelectorAll('[data-person]').forEach(b => b.addEventListener('click', () => { this.person = b.dataset.person; this.render(); }));
        view.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => { this.period = b.dataset.period; this.anchor = this.periodStart(); this.render(); }));
        view.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => this.shift(parseInt(b.dataset.step, 10))));
        view.querySelectorAll('[data-score]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.openScorer(b.dataset.score); }));
        view.querySelectorAll('details.kpi').forEach(d => d.addEventListener('toggle', () => { this.opened[d.dataset.kpi] = d.open; }));
    },

    /** The written standard, then the score, then why. In that order. */
    openScorer(kpiId) {
        const kpi = store.kpis.find(k => k.id === kpiId);
        if (!kpi) return;
        const existing = this.scoreFor(kpiId);
        const rubric = Array.isArray(kpi.rubric) ? kpi.rubric : null;
        const from = this.anchor, to = this.periodEnd();
        const done = store.workItems.filter(w => w.kpi_id === kpiId && w.status === 'done' && w.completed_at &&
            dates.iso(w.completed_at) >= from && dates.iso(w.completed_at) <= to);

        const steps = (rubric || ['Not happening', 'Below the standard', 'Close, with gaps', 'Meets the standard', 'Above the standard'])
            .map((text, i) => `<button type="button" class="rubric-step ${existing?.score === i + 1 ? 'selected' : ''}" data-pick="${i + 1}">
                    <span class="rubric-n">${i + 1}</span><span>${esc(text)}</span></button>`).join('');

        ui.modal({
            title: `${kpi.name} · ${this.periodLabel()}`,
            wide: true,
            body: `
                ${kpi.definition ? `<p class="meta" style="margin-bottom:var(--s3)">${esc(kpi.definition)}</p>` : ''}
                ${done.length ? `<div class="notice" style="margin-bottom:var(--s4)"><strong>Finished in this period:</strong> ${done.map(w => esc(w.title)).join('; ')}</div>` : ''}
                <input type="hidden" name="score" id="picked-score" value="${existing?.score ?? ''}" required>
                <div class="field"><label>Pick the line that describes it</label><div class="rubric" id="rubric">${steps}</div></div>
                ${ui.textarea('notes', 'Why this score', { value: existing?.notes || '', placeholder: 'The evidence behind it. This is what you will read at review time.' })}`,
            submitLabel: existing ? 'Update score' : 'Save score',
            danger: existing ? { label: 'Clear score', confirm: `Remove the ${this.periodLabel()} score for ${kpi.name}?`,
                run: async () => { await data.deleteScore(existing.id); toast('Score cleared'); await store.reload(); } } : null,
            onSubmit: async (form) => {
                const score = parseInt(form.get('score'), 10);
                if (!score) throw new Error('Pick a score from the list above.');
                await data.saveScore({ kpi_id: kpiId, period: this.period, period_start: this.anchor, score, notes: form.get('notes') || null, created_by: auth.userId });
                await data.log('scored', 'kpi', kpiId, `${kpi.name} · ${this.periodLabel()}: ${score}`);
                toast(existing ? 'Score updated' : 'Score saved');
                await store.reload();
            }
        });

        const holder = document.getElementById('rubric');
        holder.querySelectorAll('[data-pick]').forEach(step => step.addEventListener('click', () => {
            holder.querySelectorAll('.rubric-step').forEach(s => s.classList.remove('selected'));
            step.classList.add('selected');
            document.getElementById('picked-score').value = step.dataset.pick;
        }));
    }
};
