/**
 * Goals — two levels.
 *
 *   Company goal (annual)   what SSEI is trying to achieve this year
 *     └─ Team goal (quarterly)   what Growth & Ops is doing about it
 *
 * The nesting is load-bearing: a team goal is shown under the company
 * goal it serves. A team goal with no parent is shown separately and
 * called out, because unattached work is the thing worth noticing.
 *
 * Work items link up to team goals (work.goal_id), so each goal shows
 * how much work sits behind it and how much of that is finished.
 */

const goalsView = {
    showing: 'current',

    render() {
        const body = document.getElementById('goals-body');

        const company = store.goals
            .filter(g => g.scope === 'company')
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        const team = this.teamGoals();

        document.getElementById('goals-figure').innerHTML = team.length
            ? `${Math.round(team.reduce((s, g) => s + (g.progress_pct || 0), 0) / team.length)}<small>%</small>`
            : '—';

        document.getElementById('goals-actions').innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;gap:var(--s4);flex-wrap:wrap">
                <div class="segments">
                    <button class="segment ${this.showing === 'current' ? 'active' : ''}" data-showing="current">This quarter</button>
                    <button class="segment ${this.showing === 'all' ? 'active' : ''}" data-showing="all">All quarters</button>
                </div>
                ${auth.isAdmin ? `
                    <div style="display:flex;gap:var(--s2)">
                        <button class="btn btn-sm" id="new-company">Add company goal</button>
                        <button class="btn btn-primary btn-sm" id="new-team">Add team goal</button>
                    </div>` : `
                    <button class="btn btn-primary btn-sm" id="new-team">Add team goal</button>`}
            </div>`;

        if (company.length === 0 && team.length === 0) {
            body.innerHTML = `<div class="block">${ui.empty(
                'No goals yet',
                'Start with a company goal — what SSEI is trying to achieve this year. Then add the quarterly goals that get you there.',
                auth.isAdmin ? `<button class="btn btn-primary" id="empty-new">Add the first company goal</button>` : ''
            )}</div>`;
            this.wire();
            return;
        }

        const attached = new Set();
        let html = company.map(c => {
            const children = team.filter(t => t.parent_id === c.id);
            children.forEach(t => attached.add(t.id));
            return this.companyBlock(c, children);
        }).join('');

        const orphans = team.filter(t => !attached.has(t.id));
        if (orphans.length) html += this.orphanBlock(orphans);

        body.innerHTML = html;
        this.wire();
    },

    teamGoals() {
        return store.goals
            .filter(g => g.scope === 'team')
            .filter(g => this.showing === 'all' ||
                (g.period_year === CONFIG.year && g.period_quarter === CONFIG.quarter))
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },

    /**
     * A company goal's progress is the average of the quarterly goals
     * under it — not a number someone types. If nothing is under it,
     * that is itself the finding, and the block says so.
     */
    companyBlock(goal, children) {
        const rolled = children.length
            ? Math.round(children.reduce((s, g) => s + (g.progress_pct || 0), 0) / children.length)
            : null;

        return `<section class="goal-company">
            <div class="goal-company-head">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--s4)">
                    <div style="flex:1;min-width:0">
                        <span class="eyebrow">Company goal · ${goal.period_year || CONFIG.year}</span>
                        <h3 class="goal-company-title">${esc(goal.title)}</h3>
                        ${goal.metric ? `
                            <p class="meta">
                                ${esc(goal.metric)}
                                ${goal.baseline ? ` · from <span class="num">${esc(goal.baseline)}</span>` : ''}
                                ${goal.target ? ` to <span class="num">${esc(goal.target)}</span>` : ''}
                            </p>` : ''}
                    </div>
                    ${auth.isAdmin ? `<button class="btn btn-quiet btn-sm" data-edit-company="${goal.id}">Edit</button>` : ''}
                </div>

                <div style="margin-top:var(--s4)">
                    ${rolled === null
                        ? `<p class="meta">Nothing scheduled against this yet. Add a quarterly goal to move it.</p>`
                        : ui.measureRow({ value: rolled, max: 100, target: 100, size: '',
                                          label: rolled + '%',
                                          tone: rolled >= 100 ? 'good' : 'accent' })}
                </div>
                ${rolled !== null ? `<p class="meta" style="margin-top:6px">Rolled up from ${children.length} quarterly goal${children.length === 1 ? '' : 's'}</p>` : ''}
            </div>

            <div class="goal-children">
                ${children.length === 0
                    ? `<p class="meta" style="padding:var(--s3) var(--s5)">No quarterly goals under this one.</p>`
                    : children.map(c => this.teamRow(c)).join('')}
            </div>
        </section>`;
    },

    orphanBlock(orphans) {
        return `<section class="block goal-orphans">
            <div class="block-head">
                <div>
                    <h3 class="h-block">Not tied to a company goal</h3>
                    <p class="meta">Worth a look — either these serve a company goal that isn't written down, or they shouldn't be this quarter's priority.</p>
                </div>
            </div>
            <div class="goal-children">
                ${orphans.map(g => this.teamRow(g)).join('')}
            </div>
        </section>`;
    },

    teamRow(goal) {
        const behind = store.workItems.filter(w => w.goal_id === goal.id);
        const done   = behind.filter(w => w.status === 'done').length;
        const pct    = goal.progress_pct || 0;
        const due    = dates.relativeDue(goal.due_date);

        return `<div class="goal-child" data-goal="${goal.id}">
            <div style="min-width:0">
                <div class="goal-child-title">${esc(goal.title)}</div>
                <div class="goal-child-meta">
                    ${ui.who(null, goal.owner?.full_name || 'Unassigned')}
                    ${goal.kras?.short_name ? ui.chip(goal.kras.short_name) : ''}
                    ${goal.status === 'blocked' ? ui.chip('Blocked', 'bad') : ''}
                </div>
            </div>

            <div>
                ${ui.measure({ value: pct, max: 100, size: 'sm', tone: pct >= 100 ? 'good' : 'accent' })}
                <span class="meta num" style="display:block;margin-top:4px">${pct}%</span>
            </div>

            <div class="goal-child-when meta">
                ${behind.length
                    ? `<a href="#work">${done} of ${behind.length} tasks done</a>`
                    : `<span class="muted">No tasks yet</span>`}
                <div class="num" style="margin-top:2px">Q${goal.period_quarter || '?'} · ${esc(due.text)}</div>
            </div>

            <div style="text-align:right">
                <button class="btn btn-quiet btn-sm" data-edit-team="${goal.id}">Update</button>
            </div>
        </div>`;
    },

    /* ---------- Interactions -------------------------------- */

    wire() {
        const view = document.getElementById('view-goals');

        view.querySelectorAll('[data-showing]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showing = btn.dataset.showing;
                this.render();
            });
        });

        document.getElementById('new-company')?.addEventListener('click', () => this.editCompany());
        document.getElementById('empty-new')?.addEventListener('click', () => this.editCompany());
        document.getElementById('new-team')?.addEventListener('click', () => this.editTeam());

        view.querySelectorAll('[data-edit-company]').forEach(btn =>
            btn.addEventListener('click', () => this.editCompany(btn.dataset.editCompany)));

        view.querySelectorAll('[data-edit-team]').forEach(btn =>
            btn.addEventListener('click', () => this.editTeam(btn.dataset.editTeam)));
    },

    goal(id) {
        return store.goals.find(g => g.id === id);
    },

    editCompany(id = null) {
        const g = id ? this.goal(id) : null;

        ui.modal({
            title: g ? 'Company goal' : 'Add a company goal',
            body: `
                ${ui.field('title', 'The goal', {
                    value: g?.title || '', required: true,
                    placeholder: 'Grow enrolments 20% over CY2026' })}
                ${ui.textarea('description', 'Why it matters', { value: g?.description || '' })}
                ${ui.field('metric', 'What gets measured', {
                    value: g?.metric || '', placeholder: 'Paid enrolments per quarter' })}
                <div class="field-pair">
                    ${ui.field('baseline', 'Starting point', { value: g?.baseline || '', placeholder: '1,200' })}
                    ${ui.field('target', 'Target', { value: g?.target || '', placeholder: '1,440' })}
                </div>
                <div class="field-pair">
                    ${ui.field('period_year', 'Year', { type: 'number', value: g?.period_year || CONFIG.year })}
                    ${ui.field('sort_order', 'Order shown', { type: 'number', value: g?.sort_order ?? 0 })}
                </div>`,
            submitLabel: g ? 'Save goal' : 'Add goal',
            danger: g && auth.isAdmin ? {
                label: 'Archive',
                confirm: `Archive "${g.title}"? It stays in the database as a record but leaves this view.`,
                run: async () => {
                    await data.archiveGoal(g.id);
                    toast('Archived');
                    await store.reload();
                }
            } : null,
            onSubmit: async (form) => {
                const fields = {
                    scope: 'company',
                    type: 'year',
                    title: (form.get('title') || '').trim(),
                    description: form.get('description') || null,
                    metric: form.get('metric') || null,
                    baseline: form.get('baseline') || null,
                    target: form.get('target') || null,
                    period_year: parseInt(form.get('period_year'), 10) || CONFIG.year,
                    sort_order: parseInt(form.get('sort_order'), 10) || 0
                };
                if (g) await data.updateGoal(g.id, fields);
                else   await data.createGoal({ ...fields, owner_id: auth.userId, status: 'in_progress' });
                toast(g ? 'Saved' : 'Goal added');
                await store.reload();
            }
        });
    },

    editTeam(id = null) {
        const g = id ? this.goal(id) : null;

        const parents = [{ value: '', label: 'Not tied to a company goal' }].concat(
            store.goals.filter(x => x.scope === 'company')
                       .map(x => ({ value: x.id, label: x.title })));

        const kraOptions = [{ value: '', label: 'No area' }].concat(
            store.kras.map(k => ({ value: k.id, label: k.name })));

        const owners = store.profiles
            .filter(p => p.role !== 'intern')
            .map(p => ({ value: p.id, label: p.full_name || p.email }));

        ui.modal({
            title: g ? 'Team goal' : 'Add a team goal',
            body: `
                ${ui.field('title', 'The goal', {
                    value: g?.title || '', required: true,
                    placeholder: 'Cut lead response time to under 2 hours' })}
                ${ui.textarea('description', 'What done looks like', {
                    value: g?.description || '',
                    placeholder: 'Be specific enough that anyone can tell whether it happened.' })}
                ${ui.select('parent_id', 'Company goal it serves', parents, {
                    value: g?.parent_id || '',
                    hint: 'A goal with no parent shows in its own section so it doesn\'t get lost.' })}
                <div class="field-pair">
                    ${ui.select('owner_id', 'Owner', owners, { value: g?.owner_id || auth.userId })}
                    ${ui.select('kra_id', 'Responsibility area', kraOptions, { value: g?.kra_id || '' })}
                </div>
                <div class="field-pair">
                    ${ui.select('period_quarter', 'Quarter',
                        [1, 2, 3, 4].map(q => ({ value: q, label: 'Q' + q })),
                        { value: g?.period_quarter || CONFIG.quarter })}
                    ${ui.field('period_year', 'Year', { type: 'number', value: g?.period_year || CONFIG.year })}
                </div>
                <div class="field-pair">
                    ${ui.field('progress_pct', 'Progress %', { type: 'number', value: g?.progress_pct ?? 0 })}
                    ${ui.field('due_date', 'Due', { type: 'date', value: g?.due_date || '' })}
                </div>
                ${ui.select('status', 'Status', ui.statusOptions(), { value: g?.status || 'in_progress' })}`,
            submitLabel: g ? 'Save goal' : 'Add goal',
            danger: g && auth.isAdmin ? {
                label: 'Archive',
                confirm: `Archive "${g.title}"?`,
                run: async () => {
                    await data.archiveGoal(g.id);
                    toast('Archived');
                    await store.reload();
                }
            } : null,
            onSubmit: async (form) => {
                const pct = Math.max(0, Math.min(100, parseInt(form.get('progress_pct'), 10) || 0));
                const fields = {
                    scope: 'team',
                    type: 'quarter',
                    title: (form.get('title') || '').trim(),
                    description: form.get('description') || null,
                    parent_id: form.get('parent_id') || null,
                    owner_id: form.get('owner_id') || null,
                    kra_id: form.get('kra_id') || null,
                    period_quarter: parseInt(form.get('period_quarter'), 10),
                    period_year: parseInt(form.get('period_year'), 10) || CONFIG.year,
                    progress_pct: pct,
                    due_date: form.get('due_date') || null,
                    // Progress and status shouldn't contradict each other.
                    status: pct >= 100 ? 'done' : form.get('status')
                };
                if (g) await data.updateGoal(g.id, fields);
                else   await data.createGoal(fields);
                toast(g ? 'Saved' : 'Goal added');
                await store.reload();
            }
        });
    }
};
