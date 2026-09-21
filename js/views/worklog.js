/**
 * Work log: what was actually done, under each measure.
 *
 * KRAs & KPIs answers "how are we doing". This answers "what did we do
 * about it". Same work items as Delegations, read the other way round:
 * Delegations is sorted by what is still open, this is sorted by the
 * measure the work counts towards, newest first.
 *
 * Anything added here is a normal work item, so it shows up in
 * Delegations, in the Calendar, and against the KPI when it is scored.
 */

const worklogView = {
    person: null,
    range: 'quarter',      // 'quarter' | 'year' | 'all'
    open: {},              // kpi id -> showing every item rather than the last few

    ranges: [
        { key: 'quarter', label: 'This quarter' },
        { key: 'year',    label: 'This year' },
        { key: 'all',     label: 'Everything' }
    ],

    render() {
        const body = document.getElementById('worklog-body');

        const people = (auth.isAdmin ? CONFIG.team : CONFIG.team.filter(m => m.key === auth.key))
            .filter(m => store.kpis.some(k => k.member === m.key) ||
                         store.workItems.some(w => w.owner_name === m.key));

        if (!this.person || !people.some(p => p.key === this.person)) {
            this.person = people.some(p => p.key === auth.key) ? auth.key : (people[0]?.key || auth.key);
        }

        const items = this.visible();
        document.getElementById('worklog-figure').textContent = items.length;
        document.getElementById('worklog-figure-label').textContent =
            this.range === 'all' ? 'Logged in total' : 'Logged in this period';

        body.innerHTML = `
            ${this.controls(people)}
            ${this.areas(items)}
            ${this.loose(items)}`;

        this.wire();
    },

    /* ---------- Which rows ---------------------------------- */

    from() {
        if (this.range === 'all') return '0000-01-01';
        if (this.range === 'year') return `${CONFIG.year}-01-01`;
        return `${CONFIG.year}-${String((CONFIG.quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
    },

    /** The date a piece of work counts against: finished, else due, else created. */
    when(w) {
        if (w.completed_at) return dates.iso(w.completed_at);
        return w.due_date || (w.created_at ? dates.iso(w.created_at) : '');
    },

    visible() {
        const from = this.from();
        return store.workItems
            .filter(w => w.owner_name === this.person)
            .filter(w => this.when(w) >= from || (!w.completed_at && w.status !== 'done'))
            .sort((a, b) => (this.when(b) || '').localeCompare(this.when(a) || ''));
    },

    controls(people) {
        return `<div class="bar">
            ${people.length > 1 ? `
                <div class="segments">
                    ${people.map(p =>
                        `<button class="segment ${this.person === p.key ? 'active' : ''}" data-person="${p.key}">${esc(p.name)}</button>`
                    ).join('')}
                </div>` : ''}
            <div class="segments">
                ${this.ranges.map(r =>
                    `<button class="segment ${this.range === r.key ? 'active' : ''}" data-range="${r.key}">${esc(r.label)}</button>`
                ).join('')}
            </div>
            <button class="btn btn-primary btn-sm" id="worklog-add">Add work</button>
        </div>`;
    },

    /* ---------- One block per area -------------------------- */

    areas(items) {
        const blocks = store.kras.map(kra => {
            const kpis = store.kpis.filter(k => k.member === this.person && k.kra_id === kra.id);
            if (!kpis.length) return '';

            const count = items.filter(w => kpis.some(k => k.id === w.kpi_id)).length;

            return `<div class="block">
                <div class="block-head">
                    <h3 class="h-block">${esc(kra.name)}</h3>
                    <span class="eyebrow">${count} logged</span>
                </div>
                <div class="block-body block-body--flush">
                    ${kpis.map(k => this.kpiRow(k, items.filter(w => w.kpi_id === k.id))).join('')}
                </div>
            </div>`;
        });

        return blocks.join('') || ui.empty('Nothing set up yet',
            'There are no measures for this person, so there is nothing to log work against.');
    },

    kpiRow(kpi, items) {
        const showAll = this.open[kpi.id];
        const shown = showAll ? items : items.slice(0, 4);
        const last = items[0] ? this.when(items[0]) : null;

        return `<div class="log-kpi">
            <div class="log-kpi-head">
                <div>
                    <div class="h-row">${esc(kpi.name)}</div>
                    <div class="meta">${kpi.weight || 0}% of the score${
                        last ? ` · last entry ${esc(dates.short(last))}` : ' · nothing logged yet'}</div>
                </div>
                <div class="row-end">
                    <span class="num muted">${items.length}</span>
                    <button class="btn btn-sm" data-add="${kpi.id}">Add work</button>
                </div>
            </div>

            ${items.length === 0 ? '' : `
            <div class="log-items">
                ${shown.map(w => this.item(w)).join('')}
                ${items.length > shown.length
                    ? `<button class="btn btn-quiet btn-sm" data-more="${kpi.id}">Show all ${items.length}</button>`
                    : items.length > 4 ? `<button class="btn btn-quiet btn-sm" data-more="${kpi.id}">Show fewer</button>` : ''}
            </div>`}
        </div>`;
    },

    item(w) {
        const when = this.when(w);
        const note = w.description || w.rm_remarks;
        return `<div class="log-item" data-edit="${w.id}">
            <span class="log-when num">${esc(when ? dates.short(when) : '')}</span>
            <div class="log-body">
                <div class="log-title">${esc(w.title)}</div>
                ${note ? `<div class="meta clamp">${esc(note.replace(/\s*\n+\s*/g, ' '))}</div>` : ''}
            </div>
            <div class="row-end">
                ${w.output_link
                    ? `<a href="${escAttr(w.output_link)}" target="_blank" rel="noopener" class="chip" data-stop="1">Open &#8599;</a>`
                    : ''}
                ${w.status === 'done' ? '' : ui.statusChip(w.status)}
            </div>
        </div>`;
    },

    /** Work with no measure against it. Visible, so it can be filed or dropped. */
    loose(items) {
        const rows = items.filter(w => !w.kpi_id);
        if (!rows.length) return '';

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Not under a measure</h3>
                <span class="eyebrow">${rows.length}</span>
            </div>
            <div class="log-items">
                ${rows.map(w => this.item(w)).join('')}
            </div>
            <div class="weight-note">
                <span>Open any of these to file it under a KPI, or leave it as a record.</span>
            </div>
        </div>`;
    },

    /* ---------- Interaction --------------------------------- */

    wire() {
        const view = document.getElementById('view-worklog');

        view.querySelectorAll('[data-person]').forEach(btn =>
            btn.addEventListener('click', () => { this.person = btn.dataset.person; this.render(); }));

        view.querySelectorAll('[data-range]').forEach(btn =>
            btn.addEventListener('click', () => { this.range = btn.dataset.range; this.render(); }));

        view.querySelectorAll('[data-more]').forEach(btn =>
            btn.addEventListener('click', () => {
                this.open[btn.dataset.more] = !this.open[btn.dataset.more];
                this.render();
            }));

        view.querySelectorAll('[data-add]').forEach(btn =>
            btn.addEventListener('click', () => this.addWork(btn.dataset.add)));

        document.getElementById('worklog-add')?.addEventListener('click', () => this.addWork(null));

        view.querySelectorAll('[data-edit]').forEach(row =>
            row.addEventListener('click', (e) => {
                if (e.target.closest('[data-stop]')) return;      // the link opens instead
                workView.openEditor(row.dataset.edit);
            }));
    },

    /**
     * Add a piece of work under a measure. Short on purpose: title, when,
     * where it lives, and a note. Everything else is on the full form in
     * Delegations, which this opens into when you save.
     */
    addWork(kpiId) {
        const mine = store.kpis.filter(k => k.member === this.person);
        const options = [{ value: '', label: 'No measure' }].concat(
            store.kras.flatMap(kra => mine.filter(k => k.kra_id === kra.id)
                .map(k => ({ value: k.id, label: `${kra.short_name || kra.name} · ${k.name}` }))));

        ui.modal({
            title: 'Add work',
            wide: true,
            body: `
                ${ui.field('title', 'What was done', { required: true,
                    placeholder: 'Built the webinar follow-up journey in LeadSquared' })}
                ${ui.select('kpi_id', 'Which measure it counts towards', options, { value: kpiId || '' })}
                <div class="field-pair">
                    ${ui.select('status', 'Where it stands', [
                        { value: 'done', label: VOCAB.status.done },
                        { value: 'in_progress', label: VOCAB.status.in_progress },
                        { value: 'not_started', label: VOCAB.status.not_started }
                    ], { value: 'done' })}
                    ${ui.field('when', 'Date finished', { type: 'date', value: dates.today(),
                        hint: 'Leave the date as it is for work still running.' })}
                </div>
                ${ui.field('output_link', 'Link', { type: 'url', placeholder: 'https://',
                    hint: 'The report, sheet, page or folder this produced.' })}
                ${ui.textarea('description', 'Notes', {
                    placeholder: 'What it is, what came out of it, anything worth remembering.' })}`,
            submitLabel: 'Add to the log',
            onSubmit: async (form) => {
                const title = (form.get('title') || '').trim();
                if (!title) throw new Error('Say what was done.');
                const status = form.get('status');
                const when = form.get('when');
                if (status === 'done' && when && when > dates.today()) {
                    throw new Error('A finished date cannot be in the future.');
                }
                const kpi = store.kpis.find(k => k.id === form.get('kpi_id'));

                const row = await data.createWorkItem({
                    action_id: `w-${Date.now()}`,
                    title,
                    description: form.get('description') || null,
                    status,
                    percent_done: status === 'done' ? 100 : status === 'in_progress' ? 50 : 0,
                    owner_name: this.person,
                    kpi_id: kpi?.id || null,
                    kra_id: kpi?.kra_id || null,
                    output_link: form.get('output_link') || null,
                    completed_at: status === 'done' && when ? new Date(`${when}T18:00:00+05:30`).toISOString() : null,
                    assigned_by: auth.userId,
                    assigned_by_name: auth.name,
                    assigned_at: new Date().toISOString()
                });
                await data.log('logged', 'work_item', row.id, title);
                toast('Added to the log');
                await store.reload();
            }
        });
    }
};
