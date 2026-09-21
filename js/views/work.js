/**
 * Tasks: what is on each person's plate.
 *
 * This module also owns every write to a work item. Today, Plan,
 * Projects and the Calendar call into these methods rather than
 * duplicating them, so "mark done" behaves the same wherever it is.
 */

const workView = {
    lens: null,            // 'mine' | 'team' | 'all'
    status: 'open',        // 'open' | 'done' | 'all'

    render() {
        const body = document.getElementById('work-body');
        if (!this.lens) this.lens = auth.isAdmin ? 'team' : 'mine';
        document.getElementById('work-actions').innerHTML =
            auth.isLeader ? '' : `<button class="btn btn-primary btn-sm" id="work-new">Add a task</button>`;

        const items = this.visible();
        body.innerHTML = `
            ${this.controls()}
            ${auth.isLeader ? '' : this.capture()}
            ${this.lens === 'team' ? this.grouped(items) : this.flat(items)}`;
        this.wire();
    },

    visible() {
        let items = auth.isAdmin ? store.workItems : store.mine();
        if (this.lens === 'mine') items = items.filter(w => auth.keys.includes(w.owner_name));
        if (this.lens === 'team') items = items.filter(w => !auth.keys.includes(w.owner_name));
        if (this.status === 'open') items = items.filter(w => store.isOpen(w));
        else if (this.status === 'done') items = items.filter(w => w.status === 'done');

        const today = dates.today();
        const rank = (w) => !store.isOpen(w) ? 4 : (w.due_date && w.due_date < today) ? 0 : w.status === 'blocked' ? 1 : w.due_date ? 2 : 3;
        return [...items].sort((a, b) => rank(a) - rank(b)
            || (rank(a) === 4 ? (b.completed_at || '').localeCompare(a.completed_at || '') : (a.due_date || '9999').localeCompare(b.due_date || '9999')));
    },

    controls() {
        const lenses = auth.isAdmin
            ? [{ key: 'team', label: 'Handed out' }, { key: 'mine', label: 'Mine' }, { key: 'all', label: 'Everyone' }]
            : [{ key: 'mine', label: 'Mine' }].concat(store.mine().some(w => !auth.keys.includes(w.owner_name)) ? [{ key: 'team', label: 'Handed out' }] : []);
        return `<div class="bar">
            <div class="segments">${lenses.map(l => `<button class="segment ${this.lens === l.key ? 'active' : ''}" data-lens="${l.key}">${esc(l.label)}</button>`).join('')}</div>
            <div class="segments">
                <button class="segment ${this.status === 'open' ? 'active' : ''}" data-status="open">Open</button>
                <button class="segment ${this.status === 'done' ? 'active' : ''}" data-status="done">Done</button>
                <button class="segment ${this.status === 'all' ? 'active' : ''}" data-status="all">Everything</button>
            </div>
        </div>`;
    },

    /** Type a task, pick who, press Enter. Everything else can be set later. */
    capture() {
        return `<form class="capture" id="capture" autocomplete="off" style="margin-bottom:var(--s5)">
            <select name="owner" aria-label="Assign to">
                ${ui.peopleOptions().map(o => `<option value="${escAttr(o.value)}" ${o.value === (auth.isAdmin ? 'riya' : auth.key) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
            </select>
            <input type="text" name="title" placeholder="Add a task and press Enter" required maxlength="200">
            <input type="date" name="due" aria-label="Due" style="width:auto;border:none;background:var(--surface-sunk)">
            <button type="submit" class="btn btn-sm">Add</button>
        </form>`;
    },

    flat(items) {
        return `<div class="list">${items.length ? items.map(w => ui.taskRow(w, { who: this.lens !== 'mine', when: this.status === 'done' ? 'done' : 'due' })).join('')
            : `<div class="task"><span></span><div class="task-main"><div class="task-meta">${this.status === 'open' ? 'Nothing open here.' : 'Nothing here.'}</div></div></div>`}</div>`;
    },

    grouped(items) {
        const order = CONFIG.team.map(m => m.key).concat([CONFIG.internKey]);
        const keys = [...new Set(items.map(w => w.owner_name))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
        if (!keys.length) return this.flat([]);
        return keys.map(k => `<div class="sec">
            <div class="sec-head"><h3 class="sec-title">${esc(personName(k))}</h3><span class="sec-note">${items.filter(w => w.owner_name === k).length}</span></div>
            <div class="list">${items.filter(w => w.owner_name === k).map(w => ui.taskRow(w, { who: false, when: this.status === 'done' ? 'done' : 'due' })).join('')}</div>
        </div>`).join('');
    },

    wire() {
        const body = document.getElementById('work-body');
        body.querySelectorAll('[data-lens]').forEach(b => b.addEventListener('click', () => { this.lens = b.dataset.lens; this.render(); }));
        body.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => { this.status = b.dataset.status; this.render(); }));
        document.getElementById('work-new')?.addEventListener('click', () => this.openEditor());
        document.getElementById('capture')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = new FormData(e.target);
            const title = (form.get('title') || '').trim();
            if (!title) return;
            await this.create({ title, owner_name: form.get('owner'), due_date: form.get('due') || null });
            e.target.reset();
        });
    },

    /* ---------- Writes -------------------------------------- */

    item(id) { return store.workItems.find(w => w.id === id); },

    async create(fields) {
        try {
            const row = await data.createWorkItem({
                action_id: `w-${Date.now()}`, status: 'not_started', percent_done: 0,
                assigned_by: auth.userId, assigned_by_name: auth.name, assigned_at: new Date().toISOString(),
                ...fields
            });
            await data.log('added', 'work_item', row.id, row.title);
            toast('Added');
            await store.reload();
        } catch (err) { toast(this.explain(err), 'bad'); }
    },

    async cycleStatus(id) {
        const w = this.item(id);
        if (!w || !store.isOpen(w)) return;
        if (w.status === 'blocked') return this.toggleBlocked(id);
        const cycle = VOCAB.statusCycle;
        const next = cycle[(cycle.indexOf(w.status) + 1) % cycle.length];
        await this.save(id, { status: next, percent_done: next === 'done' ? 100 : next === 'not_started' ? 0 : (w.percent_done || 25) },
                        next === 'done' ? 'Marked done' : `Moved to ${VOCAB.status[next].toLowerCase()}`);
        if (next === 'done') await data.log('finished', 'work_item', id, w.title);
    },

    async markDone(id) {
        const w = this.item(id);
        if (!w) return;
        await this.save(id, { status: 'done', percent_done: 100 }, 'Marked done');
        await data.log('finished', 'work_item', id, w.title);
    },

    async toggleBlocked(id) {
        const w = this.item(id);
        if (!w) return;
        if (w.status === 'blocked') {
            await this.save(id, { status: 'in_progress' }, 'Unblocked');
            await data.log('unblocked', 'work_item', id, w.title);
            return;
        }
        ui.modal({
            title: 'What is blocking this?',
            body: ui.textarea('reason', 'Blocker', { placeholder: 'What has to happen before this can move?', value: w.rm_remarks || '' }),
            submitLabel: 'Mark blocked',
            onSubmit: async (form) => {
                await this.save(id, { status: 'blocked', rm_remarks: form.get('reason') || null }, 'Marked blocked');
                await data.log('blocked', 'work_item', id, w.title);
            }
        });
    },

    /**
     * The one form for a task. `preset` fills fields for a new task
     * (a project, a goal, a due date) from wherever it was opened.
     */
    openEditor(id = null, preset = {}) {
        const w = id ? this.item(id) : null;
        const readOnly = auth.isLeader || (w && !auth.isAdmin && !auth.keys.includes(w.owner_name) && w.assigned_by !== auth.userId);
        const v = (f, d = '') => w ? (w[f] ?? d) : (preset[f] ?? d);

        const projectOptions = [{ value: '', label: 'No project' }].concat(store.projects.map(p => ({ value: p.id, label: p.name })));
        const kpiOptions = [{ value: '', label: 'Not under a measure' }].concat(
            store.kras.flatMap(kra => store.kpis.filter(k => k.kra_id === kra.id).map(k =>
                ({ value: k.id, label: `${personName(k.member)} · ${kra.short_name || kra.name}: ${k.name}` }))));
        const goalOptions = [{ value: '', label: 'Not part of a quarter goal' }].concat(store.quarterGoals().map(g => ({ value: g.id, label: g.title })));
        const statusOptions = ['not_started', 'in_progress', 'blocked', 'done'].map(s => ({ value: s, label: VOCAB.status[s] }));
        const closed = w && ['carried', 'dropped'].includes(w.status);

        ui.modal({
            title: w ? 'Task' : 'Add a task',
            wide: true,
            body: readOnly || closed ? `
                <p style="font-size:15px;font-weight:600;margin-bottom:8px">${esc(v('title'))}</p>
                ${v('description') ? `<p style="margin-bottom:10px">${esc(v('description'))}</p>` : ''}
                <p class="meta">${esc(personName(v('owner_name')))}${w?.projects?.name ? ` · ${esc(w.projects.name)}` : ''}${w?.kpis?.name ? ` · ${esc(w.kpis.name)}` : ''}
                    · ${esc(VOCAB.status[v('status')] || v('status'))}${v('due_date') ? ` · due ${esc(dates.short(v('due_date')))}` : ''}${w?.completed_at ? ` · finished ${esc(dates.short(dates.iso(w.completed_at)))}` : ''}</p>
                ${v('rm_remarks') ? `<p class="task-note" style="margin-top:10px">${esc(v('rm_remarks'))}</p>` : ''}
                ${v('output_link') ? `<p style="margin-top:10px"><a href="${escAttr(v('output_link'))}" target="_blank" rel="noopener">Open the output &#8599;</a></p>` : ''}
                ${closed && auth.isAdmin ? `<p class="field-hint" style="margin-top:12px">This item was closed out of the April plan. To reopen it, change its status below.</p>
                    ${ui.select('status', 'Status', statusOptions.concat([{ value: w.status, label: VOCAB.status[w.status] }]), { value: w.status })}` : ''}`
            : `
                ${ui.field('title', 'What needs doing', { value: v('title'), required: true })}
                ${ui.textarea('description', 'What it involves', { value: v('description'), placeholder: 'Anything the person picking this up would need to know.' })}
                <div class="field-pair">
                    ${ui.select('owner_name', 'Who', ui.peopleOptions(), { value: v('owner_name', auth.key) })}
                    ${ui.field('due_date', 'Due', { type: 'date', value: v('due_date') })}
                </div>
                <div class="field-pair">
                    ${ui.select('project_id', 'Project', projectOptions, { value: v('project_id') })}
                    ${ui.select('status', 'Status', statusOptions, { value: v('status', 'not_started') })}
                </div>
                ${ui.select('kpi_id', 'Measure it counts towards', kpiOptions, { value: v('kpi_id') })}
                ${auth.isAdmin ? ui.select('goal_id', 'Quarter goal', goalOptions, { value: v('goal_id') }) : ''}
                ${ui.field('output_link', 'Link', { type: 'url', value: v('output_link'), placeholder: 'https://', hint: 'The report, sheet, page or folder this produced.' })}
                ${ui.textarea('rm_remarks', 'Notes', { value: v('rm_remarks'), placeholder: 'What was agreed, what is pending, who is waiting.' })}`,
            submitLabel: w ? 'Save' : 'Add task',
            danger: w && auth.isAdmin && !readOnly ? { label: 'Delete', confirm: `Delete "${w.title}"? This can't be undone.`,
                run: async () => { await data.deleteWorkItem(w.id); toast('Deleted'); await store.reload(); } } : null,
            onSubmit: readOnly ? null : async (form) => {
                if (closed) {
                    const status = form.get('status');
                    if (status !== w.status) { await data.updateWorkItem(w.id, { status }); toast('Reopened'); await store.reload(); }
                    return;
                }
                const kpi = store.kpis.find(k => k.id === form.get('kpi_id'));
                const fields = {
                    title: (form.get('title') || '').trim(),
                    description: form.get('description') || null,
                    owner_name: form.get('owner_name'),
                    due_date: form.get('due_date') || null,
                    project_id: form.get('project_id') || null,
                    status: form.get('status'),
                    kpi_id: kpi?.id || null,
                    kra_id: kpi?.kra_id || store.projectById(form.get('project_id'))?.kra_id || null,
                    output_link: form.get('output_link') || null,
                    rm_remarks: form.get('rm_remarks') || null
                };
                if (auth.isAdmin) fields.goal_id = form.get('goal_id') || null;
                if (preset.plan_tag && !w) fields.plan_tag = preset.plan_tag;
                if (fields.status === 'done') fields.percent_done = 100;
                if (!fields.title) throw new Error('Say what needs doing.');
                if (w) { await data.updateWorkItem(w.id, fields); toast('Saved'); await store.reload(); }
                else await this.create(fields);
            }
        });
    },

    async save(id, fields, message) {
        try { await data.updateWorkItem(id, fields); toast(message); await store.reload(); }
        catch (err) { toast(this.explain(err), 'bad'); }
    },

    explain(err) {
        const msg = err?.message || '';
        if (/row-level security|permission/i.test(msg)) return 'You can\'t change this item. It belongs to someone else; ask Kavya if you need access.';
        if (/violates check constraint/i.test(msg)) return 'That value isn\'t allowed here. Check the person and status fields.';
        return msg || 'Something went wrong. Try again.';
    }
};
