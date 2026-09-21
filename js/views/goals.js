/**
 * Goals: this week, this month, this year.
 *
 * A goal's progress is not typed in. Point work items at a goal in
 * Delegations and it counts them: three of five done is 60%. The yearly
 * goals are the seven responsibility areas, so the scorecard and the
 * goals are two views of the same commitments, never two lists to keep
 * in step by hand.
 */

const goalsView = {
    period: 'week',

    periods: [
        { key: 'week',  label: 'This week',  noun: 'weekly goal' },
        { key: 'month', label: 'This month', noun: 'monthly goal' },
        { key: 'year',  label: 'This year',  noun: 'yearly goal' }
    ],

    render() {
        const body = document.getElementById('goals-body');
        const goals = store.goalsOfType(this.period);
        const company = store.goals.find(g => g.scope === 'company' && !g.archived_at);

        const overall = goals.length
            ? Math.round(goals.reduce((s, g) => s + store.goalProgress(g).pct, 0) / goals.length)
            : 0;
        document.getElementById('goals-figure').innerHTML = `${overall}<small>%</small>`;

        body.innerHTML = `
            <div class="bar">
                <div class="segments">
                    ${this.periods.map(p =>
                        `<button class="segment ${this.period === p.key ? 'active' : ''}" data-period="${p.key}">${esc(p.label)}</button>`
                    ).join('')}
                </div>
                ${auth.isLeader ? '' : `<button class="btn btn-primary btn-sm" id="goal-add">Add ${esc(this.current().noun)}</button>`}
            </div>

            ${company ? this.companyCard(company) : ''}
            ${goals.length ? this.list(goals) : ui.empty(
                `No ${this.current().noun}s yet`,
                'Add one, then point tasks at it in Delegations. The progress counts itself from the tasks.')}`;

        this.wire();
    },

    current() {
        return this.periods.find(p => p.key === this.period);
    },

    companyCard(company) {
        const p = store.goalProgress(company);
        return `<div class="block">
            <div class="goal-company-head">
                <span class="eyebrow">The year</span>
                <div class="goal-company-title">${esc(company.title)}</div>
                ${company.description ? `<p class="meta">${esc(company.description)}</p>` : ''}
                <div style="margin-top:var(--s3);max-width:520px">
                    ${ui.measureRow({ value: p.pct, max: 100, label: `${p.pct}%` })}
                </div>
            </div>
        </div>`;
    },

    list(goals) {
        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">${esc(this.current().label)}</h3>
                <span class="eyebrow">${goals.length} goal${goals.length === 1 ? '' : 's'} · progress counted from tasks</span>
            </div>
            <div class="block-body block-body--flush">
                ${goals.map(g => this.row(g)).join('')}
            </div>
        </div>`;
    },

    row(goal) {
        const p = store.goalProgress(goal);
        const kra = store.kraById(goal.kra_id);
        const late = goal.due_date && goal.due_date < dates.today() && p.pct < 100;

        return `<div class="goal-row" data-goal="${goal.id}">
            <div class="goal-main">
                <div class="row-title">${esc(goal.title)}</div>
                <div class="row-sub">
                    ${kra ? ui.chip(kra.short_name || kra.name) : ''}
                    ${p.from === 'work' ? ui.chip(`${p.done} of ${p.total} tasks done`, p.pct === 100 ? 'good' : '') : ''}
                    ${p.from === 'manual' && !goal.metric ? ui.chip('Set by hand') : ''}
                    ${goal.target ? ui.chip(`Target: ${goal.target}`) : ''}
                    ${late ? ui.chip('Past its date', 'bad') : ''}
                </div>
            </div>
            <div class="goal-measure">
                ${ui.measureRow({ value: p.pct, max: 100, label: `${p.pct}%`,
                    tone: p.pct === 100 ? 'good' : p.pct === 0 ? 'idle' : 'accent' })}
            </div>
        </div>`;
    },

    /* ---------- Interaction --------------------------------- */

    wire() {
        const view = document.getElementById('view-goals');

        view.querySelectorAll('[data-period]').forEach(btn =>
            btn.addEventListener('click', () => { this.period = btn.dataset.period; this.render(); }));

        document.getElementById('goal-add')?.addEventListener('click', () => this.openEditor(null));

        if (auth.isLeader) return;
        view.querySelectorAll('[data-goal]').forEach(row =>
            row.addEventListener('click', () => this.openEditor(row.dataset.goal)));
    },

    /** The end of the period a new goal belongs to. */
    dueFor(type) {
        const today = dates.today();
        if (type === 'week') return dates.addDays(dates.weekStart(today), 5);
        if (type === 'month') {
            const [y, m] = today.split('-').map(Number);
            return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        }
        return `${CONFIG.year}-12-31`;
    },

    openEditor(id) {
        const g = id ? store.goals.find(x => x.id === id) : null;
        const p = g ? store.goalProgress(g) : null;
        const kraOptions = [{ value: '', label: 'No area' }].concat(
            store.kras.map(k => ({ value: k.id, label: k.name })));
        const linked = g ? store.workItems.filter(w => w.goal_id === g.id) : [];

        ui.modal({
            title: g ? 'Goal' : `Add ${this.current().noun}`,
            wide: true,
            body: `
                ${ui.field('title', 'What are we trying to achieve', { value: g?.title || '', required: true,
                    placeholder: 'Cohortisation live in LeadSquared for the top six cohorts' })}
                <div class="field-pair">
                    ${ui.select('kra_id', 'Responsibility area', kraOptions, { value: g?.kra_id || '' })}
                    ${ui.field('due_date', 'Finish by', { type: 'date',
                        value: g?.due_date || this.dueFor(this.period) })}
                </div>
                <div class="field-pair">
                    ${ui.field('target', 'What good looks like', { value: g?.target || '',
                        placeholder: '95% of leads sorted' })}
                    ${ui.field('progress_pct', 'Progress %', { type: 'number', value: g?.progress_pct ?? 0,
                        hint: linked.length ? 'Ignored: counted from the tasks below.' : 'Used until tasks are linked.' })}
                </div>
                ${linked.length ? `<div class="field">
                    <label>Tasks counted towards this goal</label>
                    <div class="log-items" style="padding:0">
                        ${linked.map(w => `<div class="log-item" style="cursor:default">
                            <span class="log-when num">${esc(w.completed_at ? dates.short(dates.iso(w.completed_at)) : (w.due_date ? dates.short(w.due_date) : ''))}</span>
                            <div class="log-body"><div class="log-title">${esc(w.title)}</div></div>
                            <div class="row-end">${ui.statusChip(w.status)}</div>
                        </div>`).join('')}
                    </div>
                    <p class="field-hint">${p.done} of ${p.total} done, so this goal reads ${p.pct}%.</p>
                </div>` : `<p class="field-hint">No tasks point at this goal yet. Open a task in Delegations and pick this goal to have progress count itself.</p>`}`,
            submitLabel: g ? 'Save goal' : 'Add goal',
            danger: g && auth.isAdmin ? {
                label: 'Remove from the board',
                confirm: `Take "${g.title}" off the board? It stays in the record.`,
                run: async () => {
                    await data.archiveGoal(g.id);
                    toast('Goal archived');
                    await store.reload();
                }
            } : null,
            onSubmit: async (form) => {
                const fields = {
                    title: (form.get('title') || '').trim(),
                    kra_id: form.get('kra_id') || null,
                    due_date: form.get('due_date') || null,
                    target: form.get('target') || null,
                    progress_pct: Math.max(0, Math.min(100, parseInt(form.get('progress_pct'), 10) || 0))
                };
                if (!fields.title) throw new Error('Give the goal a title.');

                if (g) {
                    await data.updateGoal(g.id, fields);
                    toast('Goal saved');
                } else {
                    const company = store.goals.find(x => x.scope === 'company' && !x.archived_at);
                    await data.createGoal({
                        ...fields,
                        type: this.period,
                        scope: 'team',
                        status: 'in_progress',
                        parent_id: company?.id || null,
                        owner_id: auth.userId,
                        period_year: CONFIG.year,
                        period_quarter: this.period === 'year' ? null : CONFIG.quarter,
                        sort_order: store.goalsOfType(this.period).length
                    });
                    toast('Goal added');
                }
                await store.reload();
            }
        });
    }
};
