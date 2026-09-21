/**
 * Projects: the streams of work.
 *
 * A project is something the team would name in conversation: the
 * LeadSquared rebuild, the new website, PR for sir. Each one holds the
 * record of what was produced and what is still open, so the history
 * lives one click deep instead of on a single endless list.
 */

const projectsView = {
    slug: null,
    filter: 'running',
    kpi: 'all',

    setArg(arg) { this.slug = arg || null; },

    render() {
        const head = document.getElementById('projects-head');
        const body = document.getElementById('projects-body');
        const p = this.slug ? store.projectBySlug(this.slug) : null;
        if (this.slug && !p) { this.slug = null; }

        head.style.display = p ? 'none' : '';
        document.getElementById('projects-actions').innerHTML =
            auth.isAdmin && !p ? `<button class="btn btn-primary btn-sm" id="proj-new">Add a project</button>` : '';

        body.innerHTML = p ? this.detail(p) : this.list();
        this.wire(p);
    },

    /* ---------- The list ------------------------------------ */

    filtered() {
        const byStatus = {
            running: (x) => ['live', 'in_progress'].includes(x.status),
            finished: (x) => x.status === 'done',
            parked: (x) => x.status === 'parked',
            all: () => true
        }[this.filter] || (() => true);

        return store.projects.filter(byStatus).filter(x =>
            this.kpi === 'all' || store.itemsOf(x.id).some(w => w.kpi_id === this.kpi));
    },

    list() {
        const rows = this.filtered();
        const mine = store.kpis.filter(k => auth.isAdmin ? k.member === 'kavya' : k.member === auth.key);
        const counts = {
            running: store.projects.filter(x => ['live', 'in_progress'].includes(x.status)).length,
            finished: store.projects.filter(x => x.status === 'done').length,
            parked: store.projects.filter(x => x.status === 'parked').length
        };

        return `
            <div class="bar">
                <div class="segments">
                    <button class="segment ${this.filter === 'running' ? 'active' : ''}" data-filter="running">Running <span class="muted num">${counts.running}</span></button>
                    <button class="segment ${this.filter === 'finished' ? 'active' : ''}" data-filter="finished">Finished <span class="muted num">${counts.finished}</span></button>
                    <button class="segment ${this.filter === 'parked' ? 'active' : ''}" data-filter="parked">Parked <span class="muted num">${counts.parked}</span></button>
                    <button class="segment ${this.filter === 'all' ? 'active' : ''}" data-filter="all">All</button>
                </div>
                ${mine.length ? `<select id="proj-kpi" aria-label="Show projects serving a measure">
                    <option value="all">Any measure</option>
                    ${store.kras.map(kra => mine.filter(k => k.kra_id === kra.id).map(k =>
                        `<option value="${k.id}" ${this.kpi === k.id ? 'selected' : ''}>${esc(kra.short_name || kra.name)}: ${esc(k.name)}</option>`).join('')).join('')}
                </select>` : ''}
            </div>
            <div class="list">
                ${rows.length ? rows.map(x => this.row(x)).join('')
                    : `<div class="task"><span></span><div class="task-main"><div class="task-meta">No projects here.</div></div></div>`}
            </div>`;
    },

    row(p) {
        const items = store.itemsOf(p.id);
        const done = items.filter(w => w.status === 'done').length;
        const open = store.open(items).length;
        const last = store.lastActivity(p.id);
        return `<div class="proj" data-project="${escAttr(p.slug)}">
            <div>
                <div class="proj-name">${esc(p.name)}</div>
                ${p.summary ? `<div class="proj-sum">${esc(p.summary)}</div>` : ''}
            </div>
            <div class="proj-side">
                ${ui.projectWord(p.status)}
                <span>${done} done${open ? ` · ${open} open` : ''}</span>
                ${last ? `<span>Last finished ${esc(dates.short(last))}</span>` : p.started_on ? `<span>Started ${esc(dates.short(p.started_on))}</span>` : ''}
            </div>
        </div>`;
    },

    /* ---------- One project --------------------------------- */

    detail(p) {
        const items = store.itemsOf(p.id);
        const open = store.open(items).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
        const done = items.filter(w => w.status === 'done').sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
        const closed = items.filter(w => ['carried', 'dropped'].includes(w.status));
        const kra = store.kraById(p.kra_id);
        const measures = [...new Set(items.map(w => w.kpis?.name).filter(Boolean))];
        const showAll = this.showAll === p.id;
        const shown = showAll ? done : done.slice(0, 8);
        const canWrite = !auth.isLeader;

        return `
            <div class="proj-head">
                <a href="#projects" class="proj-back" data-goto="projects">&#8592; All projects</a>
                <div class="proj-title">${esc(p.name)}</div>
                <div class="proj-facts">
                    ${ui.projectWord(p.status)}
                    ${kra ? `<span><b>Area</b> ${esc(kra.name)}</span>` : ''}
                    ${p.owner_name ? `<span><b>Owner</b> ${esc(personName(p.owner_name))}</span>` : ''}
                    ${p.started_on ? `<span><b>Since</b> ${esc(dates.short(p.started_on))}${p.started_on.slice(0, 4) !== String(CONFIG.year) ? ' ' + p.started_on.slice(0, 4) : ''}</span>` : ''}
                    ${p.finished_on ? `<span><b>Finished</b> ${esc(dates.short(p.finished_on))}</span>` : ''}
                    ${p.link ? `<a href="${escAttr(p.link)}" target="_blank" rel="noopener">Open the latest output &#8599;</a>` : ''}
                    ${auth.isAdmin ? `<a href="#" id="proj-edit">Edit</a>` : ''}
                </div>
                ${p.summary ? `<p class="proj-text">${esc(p.summary)}</p>` : ''}
                ${p.next_step ? `<div class="proj-next"><b>Next:</b> ${esc(p.next_step)}</div>` : ''}
                ${measures.length ? `<p class="meta" style="margin-top:12px">Counts towards: ${measures.map(esc).join(' · ')}</p>` : ''}
            </div>

            <div class="sec">
                <div class="sec-head">
                    <h3 class="sec-title">Still open</h3>
                    ${canWrite ? `<button class="btn btn-sm" id="proj-add">Add work</button>` : `<span class="sec-note">${open.length}</span>`}
                </div>
                <div class="list">
                    ${open.length ? open.map(w => ui.taskRow(w, { project: false, note: true })).join('')
                        : `<div class="task"><span></span><div class="task-main"><div class="task-meta">Nothing open.</div></div></div>`}
                </div>
            </div>

            <div class="sec">
                <div class="sec-head"><h3 class="sec-title">Done</h3><span class="sec-note">${done.length}, newest first</span></div>
                <div class="list">
                    ${shown.length ? shown.map(w => ui.taskRow(w, { project: false, when: 'done' })).join('')
                        : `<div class="task"><span></span><div class="task-main"><div class="task-meta">Nothing finished yet.</div></div></div>`}
                    ${done.length > shown.length ? `<div class="list-foot"><button class="btn btn-quiet btn-sm" id="proj-more">Show all ${done.length}</button></div>` : ''}
                </div>
            </div>

            ${closed.length ? `<div class="sec">
                <details class="fold">
                    <summary class="sec-note" style="cursor:pointer">${closed.length} item${closed.length === 1 ? '' : 's'} carried forward or dropped from the April plan</summary>
                    <div class="list" style="margin-top:10px">${closed.map(w => ui.taskRow(w, { project: false, when: 'done', note: true })).join('')}</div>
                </details>
            </div>` : ''}`;
    },

    /* ---------- Interaction --------------------------------- */

    wire(p) {
        const view = document.getElementById('view-projects');

        view.querySelectorAll('[data-filter]').forEach(b =>
            b.addEventListener('click', () => { this.filter = b.dataset.filter; this.render(); }));
        document.getElementById('proj-kpi')?.addEventListener('change', (e) => { this.kpi = e.target.value; this.render(); });
        document.getElementById('proj-new')?.addEventListener('click', () => this.editProject(null));
        document.getElementById('proj-edit')?.addEventListener('click', (e) => { e.preventDefault(); this.editProject(p); });
        document.getElementById('proj-more')?.addEventListener('click', () => { this.showAll = p.id; this.render(); });
        document.getElementById('proj-add')?.addEventListener('click', () =>
            workView.openEditor(null, { project_id: p.id, owner_name: auth.isAdmin ? (p.owner_name || auth.key) : auth.key }));
    },

    editProject(p) {
        const kraOptions = [{ value: '', label: 'No area' }].concat(store.kras.map(k => ({ value: k.id, label: k.name })));
        const statusOptions = Object.entries(VOCAB.projectStatus).map(([value, label]) => ({ value, label }));

        ui.modal({
            title: p ? p.name : 'Add a project',
            wide: true,
            body: `
                ${ui.field('name', 'Name', { value: p?.name || '', required: true, placeholder: 'What the team calls it' })}
                ${ui.textarea('summary', 'What it is', { value: p?.summary || '', placeholder: 'One or two lines anyone could read.' })}
                <div class="field-pair">
                    ${ui.select('status', 'Where it stands', statusOptions, { value: p?.status || 'in_progress' })}
                    ${ui.select('kra_id', 'Responsibility area', kraOptions, { value: p?.kra_id || '' })}
                </div>
                <div class="field-pair">
                    ${ui.select('owner_name', 'Owner', ui.peopleOptions(), { value: p?.owner_name || 'kavya' })}
                    ${ui.field('started_on', 'Started', { type: 'date', value: p?.started_on || dates.today() })}
                </div>
                ${ui.textarea('next_step', 'Next step', { value: p?.next_step || '' })}
                ${ui.field('link', 'Link to the latest output', { type: 'url', value: p?.link || '', placeholder: 'https://' })}
                ${p ? ui.field('finished_on', 'Finished on', { type: 'date', value: p?.finished_on || '', hint: 'Leave empty while it runs.' }) : ''}`,
            submitLabel: p ? 'Save' : 'Add project',
            danger: p ? { label: 'Archive', confirm: `Archive "${p.name}"? Its work items stay in the record.`,
                run: async () => { await data.updateProject(p.id, { archived_at: new Date().toISOString() }); toast('Archived'); this.slug = null; await store.reload(); app.go('projects'); } } : null,
            onSubmit: async (form) => {
                const name = (form.get('name') || '').trim();
                if (!name) throw new Error('Give the project a name.');
                const fields = {
                    name, summary: form.get('summary') || null, status: form.get('status'), kra_id: form.get('kra_id') || null,
                    owner_name: form.get('owner_name') || null, started_on: form.get('started_on') || null,
                    next_step: form.get('next_step') || null, link: form.get('link') || null
                };
                if (p) { fields.finished_on = form.get('finished_on') || null; await data.updateProject(p.id, fields); toast('Saved'); }
                else {
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || `p-${Date.now()}`;
                    await data.createProject({ ...fields, slug, sort_order: store.projects.length + 1 });
                    toast('Project added');
                    this.slug = slug;
                }
                await store.reload();
                if (this.slug) app.go('projects', this.slug);
            }
        });
    }
};
