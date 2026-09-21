/**
 * Documents: the sheets the team works in, and the reports it has produced.
 *
 * Two lists, because they are two different things. A sheet is live and
 * gets edited; a report is finished and gets read. Both answer "can I
 * trust this", which is what the review date is for.
 */

const documentsView = {
    tab: 'sheets',
    vertical: 'all',
    query: '',

    render() {
        const body = document.getElementById('documents-body');
        const stale = store.staleDocs().length;

        document.getElementById('documents-figure').textContent = stale || '0';

        body.innerHTML = `
            <div class="bar">
                <div class="segments">
                    <button class="segment ${this.tab === 'sheets' ? 'active' : ''}" data-tab="sheets">
                        Sheets and docs <span class="num muted">${store.sheets.length}</span>
                    </button>
                    <button class="segment ${this.tab === 'reports' ? 'active' : ''}" data-tab="reports">
                        Reports we made <span class="num muted">${store.documents.length}</span>
                    </button>
                </div>
                <input type="search" id="doc-search" placeholder="Search by name" value="${escAttr(this.query)}"
                       style="min-width:200px">
                ${auth.isAdmin ? `<button class="btn btn-primary btn-sm" id="doc-add">Add ${this.tab === 'sheets' ? 'a sheet' : 'a report'}</button>` : ''}
            </div>
            ${this.tab === 'sheets' ? this.sheets() : this.reports()}`;

        this.wire();
    },

    match(row) {
        const q = this.query.trim().toLowerCase();
        if (!q) return true;
        return `${row.name} ${row.description || ''}`.toLowerCase().includes(q);
    },

    /* ---------- Sheets, grouped by the team that uses them --- */

    sheets() {
        const rows = store.sheets.filter(s => this.match(s));
        if (!rows.length) return ui.empty('Nothing here', 'No sheet matches that search.');

        const groups = Object.keys(VOCAB.vertical)
            .map(v => ({ v, rows: rows.filter(r => r.vertical === v) }))
            .filter(g => g.rows.length);

        return groups.map(g => `
            <div class="block">
                <div class="block-head">
                    <h3 class="h-block">${esc(VOCAB.vertical[g.v])}</h3>
                    <span class="eyebrow">${g.rows.length}</span>
                </div>
                <div class="block-body block-body--flush">
                    ${g.rows.map(r => this.row(r, 'sheet')).join('')}
                </div>
            </div>`).join('');
    },

    /* ---------- Reports, newest first ------------------------ */

    reports() {
        const rows = store.documents
            .filter(d => this.match(d))
            .sort((a, b) => (b.last_reviewed_at || '').localeCompare(a.last_reviewed_at || ''));

        if (!rows.length) return ui.empty('Nothing here', 'No report matches that search.');

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Reports, decks and pages</h3>
                <span class="eyebrow">Newest first</span>
            </div>
            <div class="block-body block-body--flush">
                ${rows.map(r => this.row(r, 'report')).join('')}
            </div>
        </div>`;
    },

    row(r, kind) {
        const since = dates.daysSince(r.last_reviewed_at);
        const stale = r.status === 'needs_review' ||
            (r.review_every_days && (since === null || since > r.review_every_days));

        return `<div class="row-item" data-open="${r.id}" data-kind="${kind}">
            <div class="row-main">
                <div class="row-title">
                    ${r.url ? `<a href="${escAttr(r.url)}" target="_blank" rel="noopener" class="doc-link" data-stop="1">${esc(r.name)} &#8599;</a>`
                            : esc(r.name)}
                </div>
                ${r.description ? `<div class="meta clamp">${esc(r.description)}</div>` : ''}
            </div>
            <div class="row-end">
                ${stale ? ui.chip('Needs a check', 'warn') : ''}
                ${r.last_reviewed_at ? `<span class="meta">${esc(dates.short(r.last_reviewed_at))}</span>` : ''}
                ${kind === 'report' && r.type ? ui.chip(VOCAB.docType[r.type] || r.type) : ''}
            </div>
        </div>`;
    },

    /* ---------- Interaction ---------------------------------- */

    wire() {
        const view = document.getElementById('view-documents');

        view.querySelectorAll('[data-tab]').forEach(btn =>
            btn.addEventListener('click', () => { this.tab = btn.dataset.tab; this.render(); }));

        const search = document.getElementById('doc-search');
        search?.addEventListener('input', () => {
            this.query = search.value;
            this.render();
            const again = document.getElementById('doc-search');
            again.focus();
            again.setSelectionRange(again.value.length, again.value.length);
        });

        document.getElementById('doc-add')?.addEventListener('click', () => this.openEditor(null));

        if (!auth.isAdmin) return;
        view.querySelectorAll('[data-open]').forEach(row =>
            row.addEventListener('click', (e) => {
                if (e.target.closest('[data-stop]')) return;
                this.openEditor(row.dataset.open, row.dataset.kind);
            }));
    },

    openEditor(id, kind = this.tab === 'sheets' ? 'sheet' : 'report') {
        const isSheet = kind === 'sheet';
        const r = id ? (isSheet ? store.sheets : store.documents).find(x => x.id === id) : null;

        ui.modal({
            title: r ? r.name : (isSheet ? 'Add a sheet or doc' : 'Add a report'),
            wide: true,
            body: `
                ${ui.field('name', 'Name', { value: r?.name || '', required: true })}
                ${ui.field('url', 'Link', { type: 'url', value: r?.url || '', required: true, placeholder: 'https://' })}
                ${ui.textarea('description', 'What it is for', { value: r?.description || '',
                    placeholder: 'One line, so anyone knows whether to open it.' })}
                <div class="field-pair">
                    ${isSheet
                        ? ui.select('vertical', 'Which team uses it',
                            Object.entries(VOCAB.vertical).map(([value, label]) => ({ value, label })),
                            { value: r?.vertical || 'growth' })
                        : ui.select('type', 'Kind',
                            Object.entries(VOCAB.docType).map(([value, label]) => ({ value, label })),
                            { value: r?.type || 'report' })}
                    ${ui.field('last_reviewed_at', 'Last checked', { type: 'date',
                        value: r?.last_reviewed_at || dates.today() })}
                </div>
                ${ui.field('review_every_days', 'Check it every (days)', { type: 'number',
                    value: r?.review_every_days ?? '', hint: 'Leave empty if it never goes stale.' })}`,
            submitLabel: r ? 'Save' : 'Add',
            danger: r ? {
                label: 'Remove',
                confirm: `Remove "${r.name}" from the list?`,
                run: async () => {
                    isSheet ? await data.deleteSheet(r.id) : await data.deleteDocument(r.id);
                    toast('Removed');
                    await store.reload();
                }
            } : null,
            onSubmit: async (form) => {
                const fields = {
                    name: (form.get('name') || '').trim(),
                    url: (form.get('url') || '').trim(),
                    description: form.get('description') || null,
                    last_reviewed_at: form.get('last_reviewed_at') || null,
                    review_every_days: form.get('review_every_days') ? parseInt(form.get('review_every_days'), 10) : null,
                    status: 'current'
                };
                if (isSheet) fields.vertical = form.get('vertical');
                else fields.type = form.get('type');
                if (!fields.name || !fields.url) throw new Error('A name and a link, please.');

                if (r) {
                    isSheet ? await data.updateSheet(r.id, fields) : await data.updateDocument(r.id, fields);
                    toast('Saved');
                } else {
                    isSheet ? await data.createSheet(fields)
                            : await data.createDocument({ ...fields, owner_id: auth.userId, owner_label: auth.name });
                    toast('Added');
                }
                await store.reload();
            }
        });
    }
};
