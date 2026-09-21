/**
 * Plan: what we are working towards, at every distance.
 *
 * This week and this month are read straight off the tasks' dates, so
 * they update themselves. The quarter is a set of goals built from the
 * KPIs, each moving as its tasks are finished. The year rolls the
 * quarters up. And the plan made in April is closed out item by item,
 * so nothing that was promised quietly disappears.
 */

const planView = {
    seg: null,

    segs() {
        return [
            { key: 'week',    label: 'This week' },
            { key: 'month',   label: 'This month' },
            { key: 'quarter', label: CONFIG.plan.label },
            { key: 'year',    label: 'This year' },
            { key: 'april',   label: `${CONFIG.previousPlan.label} plan` }
        ];
    },

    render() {
        const body = document.getElementById('plan-body');
        // Until the quarter starts, the plan for it is the page worth opening on.
        if (!this.seg) this.seg = (auth.isLeader || dates.today() < CONFIG.plan.from) ? 'quarter' : 'week';

        body.innerHTML = `
            <div class="bar">
                <div class="segments">
                    ${this.segs().map(s => `<button class="segment ${this.seg === s.key ? 'active' : ''}" data-seg="${s.key}">${esc(s.label)}</button>`).join('')}
                </div>
            </div>
            ${this[this.seg]()}`;

        body.querySelectorAll('[data-seg]').forEach(b =>
            b.addEventListener('click', () => { this.seg = b.dataset.seg; this.render(); }));
        body.querySelectorAll('[data-goal-add]').forEach(b =>
            b.addEventListener('click', () => workView.openEditor(null, { goal_id: b.dataset.goalAdd, plan_tag: CONFIG.plan.tag })));
        body.querySelectorAll('[data-goal-edit]').forEach(b =>
            b.addEventListener('click', (e) => { e.preventDefault(); this.editGoal(b.dataset.goalEdit); }));
        body.querySelectorAll('[data-year-add]').forEach(b =>
            b.addEventListener('click', () => this.editGoal(null)));
    },

    list(rows, empty, opts = {}) {
        return `<div class="list">${rows.length ? rows.map(w => ui.taskRow(w, opts)).join('')
            : `<div class="task"><span></span><div class="task-main"><div class="task-meta">${esc(empty)}</div></div></div>`}</div>`;
    },

    /* ---------- This week / this month ---------------------- */

    week() {
        const from = dates.weekStart(), to = dates.weekEnd();
        const due  = store.dueBetween(from, to);
        const late = store.late(store.visibleWork()).filter(w => w.due_date < from)
            .sort((a, b) => a.due_date.localeCompare(b.due_date));
        const done = store.doneBetween(from, to);

        return `
            <div class="sec">
                <div class="sec-head"><h3 class="sec-title">Due this week</h3><span class="sec-note">${esc(dates.short(from))} to ${esc(dates.short(to))}</span></div>
                ${this.list(due, 'Nothing is due this week.')}
            </div>
            ${late.length ? `<div class="sec">
                <div class="sec-head"><h3 class="sec-title">Running late</h3><span class="sec-note">Due before this week, still open</span></div>
                ${this.list(late, '')}
            </div>` : ''}
            <div class="sec">
                <div class="sec-head"><h3 class="sec-title">Finished this week</h3><span class="sec-note">${done.length}</span></div>
                ${this.list(done, 'Nothing finished yet this week.', { when: 'done' })}
            </div>`;
    },

    month() {
        const from = dates.monthStart(), to = dates.monthEnd();
        const due  = store.dueBetween(from, to);
        const done = store.doneBetween(from, to);
        const weeks = {};
        due.forEach(w => { const k = dates.weekStart(w.due_date); (weeks[k] = weeks[k] || []).push(w); });

        return `
            <div class="sec">
                <div class="sec-head"><h3 class="sec-title">Due in ${esc(dates.monthLabel(from))}</h3><span class="sec-note">${due.length} open</span></div>
                ${Object.keys(weeks).length ? Object.keys(weeks).sort().map(k => `
                    <div class="sec-note" style="margin:14px 0 6px">Week of ${esc(dates.short(k))}</div>
                    ${this.list(weeks[k], '')}`).join('')
                  : this.list([], 'Nothing is due this month.')}
            </div>
            <div class="sec">
                <div class="sec-head"><h3 class="sec-title">Finished this month</h3><span class="sec-note">${done.length}</span></div>
                ${this.list(done.slice(0, 20), 'Nothing finished yet this month.', { when: 'done' })}
                ${done.length > 20 ? `<div class="list-foot">and ${done.length - 20} more, in each project</div>` : ''}
            </div>`;
    },

    /* ---------- The quarter --------------------------------- */

    quarter() {
        const goals = store.quarterGoals();
        const undecided = this.aprilItems().filter(w => store.isOpen(w) && !w.due_date).length;
        const tasks = store.planTasks();
        const done = tasks.filter(w => w.status === 'done').length;

        return `
            <p class="plan-intro">
                <b>${esc(CONFIG.plan.label)} ${CONFIG.plan.year}.</b> One goal for each responsibility area, written from the KPIs.
                A goal moves when the tasks under it are finished, so this page reads itself from the work.
                ${tasks.length ? `<b>${done} of ${tasks.length}</b> tasks in the plan are done.` : ''}
            </p>
            ${undecided ? `<div class="nudge"><div class="nudge-line">
                <span><b>${undecided} items from the April plan</b> have had no update since. Each needs a yes or a no.</span>
                <button class="btn btn-sm" data-seg="april">See them</button></div></div>` : ''}
            <div class="list">
                ${goals.length ? goals.map(g => this.goal(g)).join('')
                    : `<div class="task"><span></span><div class="task-main"><div class="task-meta">No goals set for this quarter yet.</div></div></div>`}
            </div>`;
    },

    goal(g) {
        const p = store.goalProgress(g);
        const tasks = store.workItems.filter(w => w.goal_id === g.id && (store.isOpen(w) || w.status === 'done'))
            .sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.due_date || '9999').localeCompare(b.due_date || '9999'));
        const kra = store.kraById(g.kra_id);
        const canAdd = !auth.isLeader;

        return `<details class="goal" ${this.openGoal === g.id ? 'open' : ''} data-goal="${g.id}">
            <summary>
                <div>
                    <div class="goal-title">${esc(g.title)}</div>
                    <div class="goal-sub">${esc(kra?.name || '')}${g.target ? ` · Target: ${esc(g.target)}` : ''}</div>
                </div>
                ${ui.count(p.done || 0, p.total || 0)}
            </summary>
            <div class="goal-tasks">
                ${tasks.map(w => ui.taskRow(w, { project: true })).join('')}
                ${canAdd ? `<div class="goal-add"><button class="btn btn-quiet btn-sm" data-goal-add="${g.id}">Add a task to this goal</button>
                    ${auth.isAdmin ? `<a href="#" data-goal-edit="${g.id}" class="meta" style="margin-left:8px">Edit goal</a>` : ''}</div>` : ''}
            </div>
        </details>`;
    },

    /* ---------- The year ------------------------------------ */

    year() {
        const goals = store.yearGoals();
        return `
            <p class="plan-intro"><b>${CONFIG.year}.</b> One commitment for each responsibility area. Each one is the sum of its quarters.</p>
            <div class="list">
                ${goals.map(g => {
                    const p = store.goalProgress(g);
                    const kra = store.kraById(g.kra_id);
                    const quarters = store.goals.filter(x => x.parent_id === g.id);
                    return `<div class="goal" style="display:grid;grid-template-columns:minmax(0,1fr) 170px;gap:16px;align-items:center">
                        <div>
                            <div class="goal-title">${esc(g.title)}</div>
                            <div class="goal-sub">${esc(kra?.name || '')}${g.target ? ` · Target: ${esc(g.target)}` : ''}${g.baseline ? ` · Started at: ${esc(g.baseline)}` : ''}
                                ${quarters.length ? ` · ${quarters.length} quarter goal${quarters.length === 1 ? '' : 's'}` : ''}
                                ${auth.isAdmin ? ` · <a href="#" data-goal-edit="${g.id}">Edit</a>` : ''}</div>
                        </div>
                        ${ui.measureRow({ value: p.pct, max: 100, label: `${p.pct}%`, tone: p.pct === 100 ? 'good' : p.pct ? 'accent' : 'idle' })}
                    </div>`;
                }).join('')}
                ${auth.isAdmin ? `<div class="list-foot"><button class="btn btn-quiet btn-sm" data-year-add>Add a yearly goal</button></div>` : ''}
            </div>`;
    },

    /* ---------- The April plan, then and now ---------------- */

    aprilItems() {
        return store.workItems.filter(w => w.plan_tag === CONFIG.previousPlan.tag);
    },

    april() {
        const items = this.aprilItems().sort((a, b) => {
            const [a1, a2] = a.action_id.split('.').map(Number), [b1, b2] = b.action_id.split('.').map(Number);
            return a1 - b1 || a2 - b2;
        });
        const areas = { 1: 'Data and databases', 2: 'Lead flow and automation', 3: 'Events and the Scholarship Exam', 4: 'Growth, brand and distribution', 5: 'Coordination and the team' };
        const t = { done: 0, carried: 0, dropped: 0, open: 0 };
        items.forEach(w => { if (w.status === 'done') t.done++; else if (w.status === 'carried') t.carried++; else if (w.status === 'dropped') t.dropped++; else t.open++; });

        const outcome = (w) => {
            if (w.status === 'done') return ui.word(`Done${w.completed_at ? ' ' + dates.short(dates.iso(w.completed_at)) : ''}`, 'good');
            if (w.status === 'carried') return ui.word('Carried into this quarter', 'accent');
            if (w.status === 'dropped') return ui.word('Dropped', 'idle');
            if (!w.due_date) return ui.word('No update since', 'warn');
            return ui.statusWord(w.status);
        };

        return `
            <p class="plan-intro">
                <b>Made in April 2026 for ${esc(CONFIG.previousPlan.period)}:</b> ${items.length} actions under five areas, when the team was Kavya, Ishita and Riya.
                Ishita left in May. This is what happened to each one.
            </p>
            <div class="tally-line">
                <span><b>${t.done}</b> done</span>
                <span><b>${t.carried}</b> carried into ${esc(CONFIG.plan.label)}</span>
                ${t.dropped ? `<span><b>${t.dropped}</b> dropped</span>` : ''}
                <span><b>${t.open}</b> with no update, need a yes or a no</span>
            </div>
            ${Object.entries(areas).map(([n, name]) => {
                const rows = items.filter(w => w.action_id.split('.')[0] === n);
                if (!rows.length) return '';
                return `<div class="sec">
                    <div class="sec-head"><h3 class="sec-title">${esc(name)}</h3><span class="sec-note">${rows.filter(w => w.status === 'done').length} of ${rows.length} done</span></div>
                    <div class="list">
                        ${rows.map(w => `<div class="april">
                            <div class="april-what"><a href="#" data-task="${w.id}" style="color:inherit">${esc(w.title)}</a></div>
                            <div class="april-who">${esc(personName(w.owner_name))}</div>
                            <div class="april-out">${outcome(w)}${w.rm_remarks && !(w.status === 'done' && /^Done\b[^.]{0,14}\.?$/.test(w.rm_remarks)) ? esc(w.rm_remarks) : ''}</div>
                        </div>`).join('')}
                    </div>
                </div>`;
            }).join('')}`;
    },

    /* ---------- Goal editor (admin) ------------------------- */

    editGoal(id) {
        const g = id ? store.goals.find(x => x.id === id) : null;
        const type = g?.type || 'year';
        const kraOptions = [{ value: '', label: 'No area' }].concat(store.kras.map(k => ({ value: k.id, label: k.name })));

        ui.modal({
            title: g ? (type === 'quarter' ? 'Quarter goal' : 'Yearly goal') : 'Add a yearly goal',
            wide: true,
            body: `
                ${ui.field('title', 'The goal, in one line', { value: g?.title || '', required: true })}
                <div class="field-pair">
                    ${ui.select('kra_id', 'Responsibility area', kraOptions, { value: g?.kra_id || '' })}
                    ${ui.field('target', 'What good looks like', { value: g?.target || '' })}
                </div>
                ${type === 'year' ? ui.field('baseline', 'Where it started', { value: g?.baseline || '' }) : ''}`,
            submitLabel: g ? 'Save' : 'Add goal',
            danger: g ? { label: 'Remove from the plan', confirm: `Take "${g.title}" off the plan? It stays in the record.`,
                run: async () => { await data.archiveGoal(g.id); toast('Goal removed'); await store.reload(); } } : null,
            onSubmit: async (form) => {
                const fields = { title: (form.get('title') || '').trim(), kra_id: form.get('kra_id') || null, target: form.get('target') || null };
                if (type === 'year') fields.baseline = form.get('baseline') || null;
                if (!fields.title) throw new Error('Give the goal a title.');
                if (g) await data.updateGoal(g.id, fields);
                else await data.createGoal({ ...fields, type: 'year', scope: 'team', status: 'in_progress',
                    owner_id: auth.userId, period_year: CONFIG.year, due_date: `${CONFIG.year}-12-31`, sort_order: store.yearGoals().length + 1 });
                toast(g ? 'Saved' : 'Goal added');
                await store.reload();
            }
        });
    }
};
