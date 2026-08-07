/**
 * Delegations — the single work tracker.
 *
 * Replaces three overlapping surfaces from the old build (Actions,
 * Delegations, and the Team tab's daily work log). They all read the
 * same `actions` table, so they are one list here with four filters.
 * Anything you could do in any of those places, you can do here.
 *
 * This module also owns every write to a work item. Home calls into
 * these methods rather than duplicating them, so "mark done" behaves
 * identically wherever you press it.
 */

const workView = {
    lens: 'mine',
    filters: { person: 'all', kra: 'all', status: 'open' },

    lenses: [
        { key: 'mine',     label: 'Mine' },
        { key: 'assigned', label: 'I assigned' },
        { key: 'everyone', label: 'Everyone' },
        { key: 'by-kra',   label: 'By area' }
    ],

    render() {
        const body = document.getElementById('work-body');
        const items = this.visible();

        document.getElementById('work-figure').textContent = items.length;
        document.getElementById('work-figure-label').textContent =
            this.filters.status === 'open' ? 'Open items' : 'Items shown';

        body.innerHTML = `
            ${this.controls()}
            ${this.capture()}
            <div class="block">
                ${items.length === 0 ? this.emptyFor() : this.list(items)}
            </div>`;

        this.wire();
    },

    /* ---------- Which rows ---------------------------------- */

    visible() {
        let items = store.workItems;

        if (this.lens === 'mine') {
            items = items.filter(w => w.owner_name === auth.key);
        } else if (this.lens === 'assigned') {
            items = items.filter(w => w.assigned_by === auth.userId && w.owner_name !== auth.key);
        }

        if (this.filters.person !== 'all') {
            items = items.filter(w => w.owner_name === this.filters.person);
        }

        if (this.filters.kra !== 'all') {
            items = items.filter(w => w.kras?.kra_code === this.filters.kra);
        }

        if (this.filters.status === 'open') {
            items = items.filter(w => w.status !== 'done');
        } else if (this.filters.status !== 'all') {
            items = items.filter(w => w.status === this.filters.status);
        }

        const today = dates.today();
        const urgency = (w) => {
            if (w.status === 'done') return 4;
            if (w.due_date && w.due_date < today) return 0;
            if (w.status === 'blocked') return 1;
            if (w.due_date) return 2;
            return 3;
        };

        return [...items].sort((a, b) =>
            urgency(a) - urgency(b) ||
            (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    },

    /* ---------- Chrome -------------------------------------- */

    controls() {
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:var(--s4);flex-wrap:wrap;margin-bottom:var(--s4)">
                    <div class="segments">
                        ${this.lenses.map(l =>
                            `<button class="segment ${this.lens === l.key ? 'active' : ''}" data-lens="${l.key}">${esc(l.label)}</button>`
                        ).join('')}
                    </div>
                    <div class="filters">
                        <select id="f-person">
                            <option value="all">Anyone</option>
                            ${ui.peopleOptions().map(o =>
                                `<option value="${escAttr(o.value)}" ${this.filters.person === o.value ? 'selected' : ''}>${esc(o.label)}</option>`
                            ).join('')}
                        </select>
                        <select id="f-kra">
                            <option value="all">All areas</option>
                            ${store.kras.map(k =>
                                `<option value="${escAttr(k.kra_code)}" ${this.filters.kra === k.kra_code ? 'selected' : ''}>${esc(k.short_name || k.name)}</option>`
                            ).join('')}
                        </select>
                        <select id="f-status">
                            <option value="open" ${this.filters.status === 'open' ? 'selected' : ''}>Open</option>
                            <option value="all"  ${this.filters.status === 'all' ? 'selected' : ''}>Everything</option>
                            ${ui.statusOptions().map(o =>
                                `<option value="${escAttr(o.value)}" ${this.filters.status === o.value ? 'selected' : ''}>${esc(o.label)}</option>`
                            ).join('')}
                        </select>
                        <button class="btn btn-primary btn-sm" id="work-new">Add work item</button>
                    </div>
                </div>`;
    },

    /** Type a task, pick who, press Enter. Anything else is set later. */
    capture() {
        return `<form class="capture" id="capture" autocomplete="off" style="margin-bottom:var(--s4)">
                    <select name="owner" aria-label="Assign to">
                        ${ui.peopleOptions().map(o =>
                            `<option value="${escAttr(o.value)}" ${o.value === auth.key ? 'selected' : ''}>${esc(o.label)}</option>`
                        ).join('')}
                    </select>
                    <input type="text" name="title" placeholder="Add a task and press Enter" required maxlength="200">
                    <button type="submit" class="btn btn-sm">Add</button>
                </form>`;
    },

    emptyFor() {
        const messages = {
            mine:     ['Nothing assigned to you', 'Add a task above, or switch to Everyone to see what the team is carrying.'],
            assigned: ['You haven\'t handed anything out', 'Pick a person in the bar above, type the task, and press Enter.'],
            everyone: ['No work matches these filters', 'Widen the filters, or set Status to Everything to include finished work.'],
            'by-kra': ['No work in these areas yet', 'Work shows up here once it\'s linked to a responsibility area.']
        };
        const [title, body] = messages[this.lens] || messages.everyone;
        return ui.empty(title, body);
    },

    /* ---------- The list ------------------------------------ */

    list(items) {
        if (this.lens !== 'by-kra') {
            return `<div class="block-body block-body--flush">
                        ${items.map(w => this.row(w)).join('')}
                    </div>`;
        }

        // Grouped by responsibility area, with unlinked work last —
        // an honest bucket beats forcing everything under a KRA.
        const groups = store.kras.map(kra => ({
            name: kra.name,
            code: kra.kra_code,
            items: items.filter(w => w.kras?.kra_code === kra.kra_code)
        })).filter(g => g.items.length);

        const loose = items.filter(w => !w.kras?.kra_code);
        if (loose.length) groups.push({ name: 'Not linked to an area', code: null, items: loose });

        return groups.map(g => `
            <div class="block-head">
                <h3 class="h-block">${esc(g.name)}</h3>
                <span class="eyebrow">${g.items.filter(w => w.status === 'done').length} of ${g.items.length} done</span>
            </div>
            <div class="block-body block-body--flush">
                ${g.items.map(w => this.row(w)).join('')}
            </div>`).join('');
    },

    row(w) {
        const due  = dates.relativeDue(w.due_date);
        const late = w.status !== 'done' && w.due_date && w.due_date < dates.today();

        return `<div class="row-item ${w.status === 'done' ? 'is-done' : ''}" data-row="${w.id}">
                    <button class="dot s-${w.status}" data-cycle="${w.id}"
                            title="${esc(VOCAB.status[w.status])} — click to advance"></button>

                    <div class="row-main">
                        <div class="row-title row-editable" data-title="${w.id}" title="Click to rename">${esc(w.title)}</div>
                        <div class="row-sub">
                            ${ui.who(w.owner_name)}
                            <span class="row-editable ${late ? 'doc-stale' : ''}" data-due="${w.id}" title="Click to change the date">${esc(due.text)}</span>
                            ${w.kras?.short_name ? `<span>${esc(w.kras.short_name)}</span>` : ''}
                            ${w.status === 'blocked' ? ui.chip('Blocked', 'bad') : ''}
                            ${w.output_link ? `<a href="${escAttr(w.output_link)}" target="_blank" rel="noopener">Output &#8599;</a>` : ''}
                        </div>
                    </div>

                    <div class="row-measure">
                        ${ui.measure({ value: w.percent_done || 0, max: 100, size: 'xs',
                                       tone: w.status === 'done' ? 'good' : 'accent' })}
                    </div>

                    <div class="row-end">
                        <button class="btn btn-quiet btn-sm" data-edit="${w.id}" title="Open details">Details</button>
                    </div>
                </div>`;
    },

    /* ---------- Interactions -------------------------------- */

    wire() {
        const body = document.getElementById('work-body');

        body.querySelectorAll('[data-lens]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.lens = btn.dataset.lens;
                this.render();
            });
        });

        const bind = (id, key) => {
            document.getElementById(id)?.addEventListener('change', (e) => {
                this.filters[key] = e.target.value;
                this.render();
            });
        };
        bind('f-person', 'person');
        bind('f-kra', 'kra');
        bind('f-status', 'status');

        document.getElementById('work-new')?.addEventListener('click', () => this.openEditor());

        document.getElementById('capture')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = new FormData(e.target);
            const title = (form.get('title') || '').trim();
            if (!title) return;
            await this.create({ title, owner_name: form.get('owner') });
            e.target.reset();
        });

        body.querySelectorAll('[data-cycle]').forEach(el =>
            el.addEventListener('click', () => this.cycleStatus(el.dataset.cycle)));

        body.querySelectorAll('[data-edit]').forEach(el =>
            el.addEventListener('click', () => this.openEditor(el.dataset.edit)));

        body.querySelectorAll('[data-title]').forEach(el =>
            el.addEventListener('click', () => this.renameInline(el, el.dataset.title)));

        body.querySelectorAll('[data-due]').forEach(el =>
            el.addEventListener('click', () => this.editDueDate(el.dataset.due)));
    },

    /* ---------- Writes (shared with Home) ------------------- */

    item(id) {
        return store.workItems.find(w => w.id === id);
    },

    async create(fields) {
        try {
            const row = await data.createWorkItem({
                action_id: `w-${Date.now()}`,
                status: 'not_started',
                percent_done: 0,
                assigned_by: auth.userId,
                assigned_by_name: auth.name,
                assigned_at: new Date().toISOString(),
                ...fields
            });
            await data.log('added', 'work_item', row.id, row.title);
            toast('Added');
            await store.reload();
        } catch (err) {
            toast(this.explain(err), 'bad');
        }
    },

    async cycleStatus(id) {
        const w = this.item(id);
        if (!w) return;

        // Blocked is a side state, not a step: clicking a blocked item
        // returns it to in progress rather than advancing to done.
        if (w.status === 'blocked') return this.toggleBlocked(id);

        const cycle = VOCAB.statusCycle;
        const next  = cycle[(cycle.indexOf(w.status) + 1) % cycle.length];

        await this.save(id, {
            status: next,
            percent_done: next === 'done' ? 100 : next === 'not_started' ? 0 : (w.percent_done || 25)
        }, next === 'done' ? 'Marked done' : `Moved to ${VOCAB.status[next].toLowerCase()}`);

        if (next === 'done') await data.log('finished', 'work_item', id, w.title);
    },

    async setProgress(id, pct) {
        const w = this.item(id);
        if (!w) return;

        const status = pct >= 100 ? 'done'
                     : pct > 0 && w.status === 'not_started' ? 'in_progress'
                     : w.status;

        await this.save(id, { percent_done: pct, status },
                        pct >= 100 ? 'Marked done' : `Set to ${pct}%`);

        if (pct >= 100) await data.log('finished', 'work_item', id, w.title);
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
            title: 'What\'s blocking this?',
            body: ui.textarea('reason', 'Blocker',
                { placeholder: 'What has to happen before this can move?', value: w.rm_remarks || '' })
                + `<p class="field-hint">This shows on the item until it's unblocked.</p>`,
            submitLabel: 'Mark blocked',
            onSubmit: async (form) => {
                await this.save(id, { status: 'blocked', rm_remarks: form.get('reason') || null }, 'Marked blocked');
                await data.log('blocked', 'work_item', id, w.title);
            }
        });
    },

    async addOutputLink(id) {
        ui.modal({
            title: 'Link the output',
            body: ui.field('link', 'Where the work lives',
                { type: 'url', placeholder: 'https://docs.google.com/…', required: true,
                  hint: 'A Google Doc, Sheet, folder, or anywhere the finished work can be seen.' }),
            submitLabel: 'Save link',
            onSubmit: async (form) => {
                await this.save(id, { output_link: form.get('link').trim() }, 'Link saved');
            }
        });
    },

    async editDueDate(id) {
        const w = this.item(id);
        if (!w) return;

        ui.modal({
            title: 'Due date',
            body: ui.field('due', 'When it\'s needed', { type: 'date', value: w.due_date || '' })
                + `<p class="field-hint">Leave it empty to clear the date.</p>`,
            submitLabel: 'Save date',
            onSubmit: async (form) => {
                await this.save(id, { due_date: form.get('due') || null }, 'Date updated');
            }
        });
    },

    /** Rename in place — the fastest edit, and the most common one. */
    renameInline(el, id) {
        const w = this.item(id);
        if (!w || el.querySelector('input')) return;

        const original = w.title;
        el.innerHTML = `<input type="text" value="${escAttr(original)}" style="width:100%;padding:2px 4px;font-size:13.5px">`;
        const input = el.querySelector('input');
        input.focus();
        input.select();

        const commit = async () => {
            const title = input.value.trim();
            if (!title || title === original) { this.render(); return; }
            await this.save(id, { title }, 'Renamed');
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') this.render();
        });
    },

    openEditor(id = null) {
        const w = id ? this.item(id) : null;

        const goalOptions = [{ value: '', label: 'Not linked to a goal' }].concat(
            store.goals
                .filter(g => g.scope === 'team')
                .map(g => ({ value: g.id, label: g.title })));

        const kraOptions = [{ value: '', label: 'No area' }].concat(
            store.kras.map(k => ({ value: k.id, label: k.name })));

        ui.modal({
            title: w ? 'Work item' : 'Add work item',
            wide: true,
            body: `
                ${ui.field('title', 'What needs doing', { value: w?.title || '', required: true })}
                ${ui.textarea('description', 'Detail', {
                    value: w?.description || '',
                    placeholder: 'Anything the person picking this up would need to know.' })}
                <div class="field-pair">
                    ${ui.select('owner_name', 'Who owns it', ui.peopleOptions(), { value: w?.owner_name || auth.key })}
                    ${ui.select('status', 'Status', ui.statusOptions(), { value: w?.status || 'not_started' })}
                </div>
                <div class="field-pair">
                    ${ui.field('due_date', 'Due', { type: 'date', value: w?.due_date || '' })}
                    ${ui.field('percent_done', 'Progress %', { type: 'number', value: w?.percent_done ?? 0 })}
                </div>
                <div class="field-pair">
                    ${ui.select('kra_id', 'Responsibility area', kraOptions, { value: w?.kra_id || '' })}
                    ${ui.select('goal_id', 'Goal it serves', goalOptions, { value: w?.goal_id || '' })}
                </div>
                <div class="field-pair">
                    ${ui.field('project_tag', 'Project tag', {
                        value: w?.project_tag || '',
                        placeholder: 'samadhan-website',
                        hint: 'For work that doesn\'t belong to a KPI.' })}
                    ${ui.field('hours_spent', 'Hours spent', { type: 'number', value: w?.hours_spent ?? '' })}
                </div>
                ${ui.field('output_link', 'Link to the output', { type: 'url', value: w?.output_link || '' })}
                ${ui.textarea('rm_remarks', 'Notes', { value: w?.rm_remarks || '' })}`,
            submitLabel: w ? 'Save changes' : 'Add work item',
            danger: w && auth.isAdmin ? {
                label: 'Delete',
                confirm: `Delete "${w.title}"? This can't be undone.`,
                run: async () => {
                    await data.deleteWorkItem(w.id);
                    toast('Deleted');
                    await store.reload();
                }
            } : null,
            onSubmit: async (form) => {
                const fields = {
                    title:        (form.get('title') || '').trim(),
                    description:  form.get('description') || null,
                    owner_name:   form.get('owner_name'),
                    status:       form.get('status'),
                    due_date:     form.get('due_date') || null,
                    percent_done: parseInt(form.get('percent_done'), 10) || 0,
                    kra_id:       form.get('kra_id') || null,
                    goal_id:      form.get('goal_id') || null,
                    project_tag:  form.get('project_tag') || null,
                    hours_spent:  form.get('hours_spent') ? parseFloat(form.get('hours_spent')) : null,
                    output_link:  form.get('output_link') || null,
                    rm_remarks:   form.get('rm_remarks') || null
                };

                if (w) {
                    await data.updateWorkItem(w.id, fields);
                    toast('Saved');
                } else {
                    await this.create(fields);
                    return;
                }
                await store.reload();
            }
        });
    },

    async save(id, fields, message) {
        try {
            await data.updateWorkItem(id, fields);
            toast(message);
            await store.reload();
        } catch (err) {
            toast(this.explain(err), 'bad');
        }
    },

    /**
     * Turn a Postgres error into something actionable. RLS denials are
     * the common case and read as nothing happening otherwise.
     */
    explain(err) {
        const msg = err?.message || '';
        if (/row-level security|permission/i.test(msg)) {
            return 'You can\'t change this item — it belongs to someone else. Ask Kavya if you need access.';
        }
        if (/violates check constraint/i.test(msg)) {
            return 'That value isn\'t allowed here. Check the person and status fields.';
        }
        return msg || 'Something went wrong. Try again.';
    }
};
