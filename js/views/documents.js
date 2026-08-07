/**
 * Documents — a tracker, not a link list.
 *
 * The old tab was two unrelated link lists stacked on one page. A link
 * list can't answer the question people actually have, which is "can I
 * trust this sheet?" So every row carries an owner, when it was last
 * checked, and whether it's due for review — and the view opens on the
 * ones that have gone stale.
 *
 * Sheets and documents live in different tables but behave identically
 * here, so they share one renderer.
 */

const documentsView = {
    tab: 'sheets',

    render() {
        const body = document.getElementById('documents-body');
        const stale = store.staleDocs();

        document.getElementById('documents-figure').textContent = stale.length || '0';

        body.innerHTML = `
            ${stale.length ? this.staleBlock(stale) : ''}

            <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--s4);flex-wrap:wrap;margin-bottom:var(--s4)">
                <div class="segments">
                    <button class="segment ${this.tab === 'sheets' ? 'active' : ''}" data-tab="sheets">
                        Sheets <span class="num muted">${store.sheets.length}</span>
                    </button>
                    <button class="segment ${this.tab === 'docs' ? 'active' : ''}" data-tab="docs">
                        Documents <span class="num muted">${store.documents.length}</span>
                    </button>
                </div>
                <button class="btn btn-primary btn-sm" id="doc-new">
                    ${this.tab === 'sheets' ? 'Add sheet' : 'Add document'}
                </button>
            </div>

            ${this.tab === 'sheets' ? this.sheetsBlock() : this.docsBlock()}`;

        this.wire();
    },

    /* ---------- Freshness ----------------------------------- */

    /**
     * A row is stale if someone marked it so, or if its review cycle has
     * elapsed. Rows with no cycle set are never stale — an unreviewed
     * reference doc isn't a problem unless someone said it should be.
     */
    freshness(row) {
        if (row.status === 'retired') return { label: 'Retired', tone: 'idle', stale: false };
        if (row.status === 'draft')   return { label: 'Draft', tone: 'warn', stale: false };
        if (row.status === 'needs_review') return { label: 'Needs review', tone: 'bad', stale: true };

        if (!row.review_every_days) {
            return row.last_reviewed_at
                ? { label: `Checked ${dates.short(row.last_reviewed_at)}`, tone: '', stale: false }
                : { label: 'No review cycle', tone: '', stale: false };
        }

        const since = dates.daysSince(row.last_reviewed_at);
        if (since === null) return { label: 'Never reviewed', tone: 'bad', stale: true };
        if (since > row.review_every_days) {
            return { label: `${since - row.review_every_days} days overdue`, tone: 'bad', stale: true };
        }
        const left = row.review_every_days - since;
        return left <= 7
            ? { label: `Review in ${left} days`, tone: 'warn', stale: false }
            : { label: `Checked ${dates.short(row.last_reviewed_at)}`, tone: '', stale: false };
    },

    staleBlock(stale) {
        return `<div class="block" style="border-color:var(--bad)">
            <div class="block-head">
                <div>
                    <h3 class="h-block">${stale.length} need${stale.length === 1 ? 's' : ''} a review</h3>
                    <p class="meta">Past its review cycle, or flagged by hand. Open it, check it still holds, then mark it reviewed.</p>
                </div>
            </div>
            <div class="block-body block-body--flush">
                ${stale.map(row => {
                    const fresh = this.freshness(row);
                    const isSheet = 'vertical' in row;
                    return `<div class="row-item">
                        <div class="row-main">
                            <a href="${escAttr(row.url)}" target="_blank" rel="noopener" class="doc-link">${esc(row.name)}</a>
                            <div class="row-sub">
                                ${ui.chip(isSheet ? 'Sheet' : (VOCAB.docType[row.type] || row.type))}
                                ${row.owner?.full_name || row.owner_label
                                    ? ui.who(null, row.owner?.full_name || row.owner_label) : ''}
                                <span class="doc-stale">${esc(fresh.label)}</span>
                            </div>
                        </div>
                        <div class="row-end">
                            <button class="btn btn-sm" data-reviewed="${row.id}" data-kind="${isSheet ? 'sheet' : 'doc'}">Mark reviewed</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    },

    /* ---------- Sheets -------------------------------------- */

    sheetsBlock() {
        if (store.sheets.length === 0) {
            return `<div class="block">${ui.empty(
                'No sheets tracked yet',
                'Add the Google Sheets the team runs on — leads, enrolments, attendance — so anyone can find the current one instead of asking.',
                `<button class="btn btn-primary" id="doc-empty-new">Add the first sheet</button>`
            )}</div>`;
        }

        const groups = {};
        store.sheets.forEach(s => {
            const key = s.vertical || 'other';
            (groups[key] = groups[key] || []).push(s);
        });

        return `<div class="block">
            <div class="table-scroll">
                <table class="ledger">
                    <thead>
                        <tr>
                            <th>Sheet</th>
                            <th>Owner</th>
                            <th>Last checked</th>
                            <th style="text-align:right">&nbsp;</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(groups).map(([vertical, rows]) => `
                            <tr class="ledger-group">
                                <td colspan="4"><span class="eyebrow">${esc(VOCAB.vertical[vertical] || vertical)}</span></td>
                            </tr>
                            ${rows.map(s => this.row(s, 'sheet')).join('')}`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    },

    /* ---------- Documents ----------------------------------- */

    docsBlock() {
        if (store.documents.length === 0) {
            return `<div class="block">${ui.empty(
                'No documents tracked yet',
                'Add the process notes, references and reports the team relies on, so they have an owner and a review date instead of drifting out of date quietly.',
                `<button class="btn btn-primary" id="doc-empty-new">Add the first document</button>`
            )}</div>`;
        }

        const groups = {};
        store.documents.forEach(d => {
            const key = d.type || 'reference';
            (groups[key] = groups[key] || []).push(d);
        });

        // Process notes first — they're the ones people need mid-task.
        const order = ['sop', 'reference', 'report', 'data'];

        return `<div class="block">
            <div class="table-scroll">
                <table class="ledger">
                    <thead>
                        <tr>
                            <th>Document</th>
                            <th>Owner</th>
                            <th>Last checked</th>
                            <th style="text-align:right">&nbsp;</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${order.filter(t => groups[t]).map(type => `
                            <tr class="ledger-group">
                                <td colspan="4"><span class="eyebrow">${esc(VOCAB.docType[type] || type)}</span></td>
                            </tr>
                            ${groups[type].map(d => this.row(d, 'doc')).join('')}`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    },

    row(item, kind) {
        const fresh = this.freshness(item);
        const owner = item.owner?.full_name || item.owner_label || item.owner;

        return `<tr>
            <td>
                <a href="${escAttr(item.url)}" target="_blank" rel="noopener" class="doc-link">${esc(item.name)}</a>
                ${item.description ? `<div class="meta">${esc(item.description)}</div>` : ''}
            </td>
            <td>${owner ? ui.who(null, owner) : '<span class="muted">Unassigned</span>'}</td>
            <td>
                <span class="${fresh.tone === 'bad' ? 'doc-stale' : fresh.tone === 'warn' ? 'doc-stale' : 'meta'}">${esc(fresh.label)}</span>
            </td>
            <td style="text-align:right;white-space:nowrap">
                <button class="btn btn-quiet btn-sm" data-reviewed="${item.id}" data-kind="${kind}" title="Set last checked to today">Reviewed</button>
                <button class="btn btn-quiet btn-sm" data-edit="${item.id}" data-kind="${kind}">Edit</button>
            </td>
        </tr>`;
    },

    /* ---------- Interactions -------------------------------- */

    wire() {
        // Scoped to this view. `data-edit` is also used by Delegations, so an
        // unscoped query here would wire document handlers onto work items.
        const view = document.getElementById('view-documents');

        view.querySelectorAll('[data-tab]').forEach(btn =>
            btn.addEventListener('click', () => {
                this.tab = btn.dataset.tab;
                this.render();
            }));

        const openNew = () => this.tab === 'sheets' ? this.editSheet() : this.editDoc();
        document.getElementById('doc-new')?.addEventListener('click', openNew);
        document.getElementById('doc-empty-new')?.addEventListener('click', openNew);

        view.querySelectorAll('[data-reviewed]').forEach(btn =>
            btn.addEventListener('click', () => this.markReviewed(btn.dataset.reviewed, btn.dataset.kind)));

        view.querySelectorAll('[data-edit]').forEach(btn =>
            btn.addEventListener('click', () => btn.dataset.kind === 'sheet'
                ? this.editSheet(btn.dataset.edit)
                : this.editDoc(btn.dataset.edit)));
    },

    async markReviewed(id, kind) {
        try {
            const fields = { last_reviewed_at: dates.today(), status: 'current' };
            if (kind === 'sheet') await data.updateSheet(id, fields);
            else                  await data.updateDocument(id, fields);
            toast('Marked reviewed');
            await store.reload();
        } catch (err) {
            toast(err.message || 'Could not save that.', 'bad');
        }
    },

    ownerOptions() {
        return [{ value: '', label: 'Unassigned' }].concat(
            store.profiles.filter(p => p.role !== 'intern')
                .map(p => ({ value: p.id, label: p.full_name || p.email })));
    },

    cycleOptions() {
        return [
            { value: '', label: 'No set cycle' },
            { value: '7', label: 'Every week' },
            { value: '30', label: 'Every month' },
            { value: '90', label: 'Every quarter' },
            { value: '180', label: 'Twice a year' },
            { value: '365', label: 'Every year' }
        ];
    },

    statusOptions() {
        return Object.entries(VOCAB.docStatus).map(([value, label]) => ({ value, label }));
    },

    editSheet(id = null) {
        const s = id ? store.sheets.find(x => x.id === id) : null;

        ui.modal({
            title: s ? 'Sheet' : 'Add a sheet',
            body: `
                ${ui.field('name', 'What it\'s called', { value: s?.name || '', required: true })}
                ${ui.field('url', 'Link', { type: 'url', value: s?.url || '', required: true })}
                ${ui.field('description', 'What it holds', {
                    value: s?.description || '',
                    placeholder: 'One line, so nobody has to open it to find out.' })}
                <div class="field-pair">
                    ${ui.select('vertical', 'Part of the business',
                        Object.entries(VOCAB.vertical).map(([value, label]) => ({ value, label })),
                        { value: s?.vertical || 'growth' })}
                    ${ui.select('owner_id', 'Owner', this.ownerOptions(), { value: s?.owner_id || '' })}
                </div>
                <div class="field-pair">
                    ${ui.select('review_every_days', 'Review it', this.cycleOptions(), {
                        value: s?.review_every_days || '',
                        hint: 'How often someone should check it\'s still right.' })}
                    ${ui.field('last_reviewed_at', 'Last checked', { type: 'date', value: s?.last_reviewed_at || '' })}
                </div>
                ${ui.select('status', 'Status', this.statusOptions(), { value: s?.status || 'current' })}`,
            submitLabel: s ? 'Save sheet' : 'Add sheet',
            danger: s && auth.isAdmin ? {
                label: 'Remove',
                confirm: `Remove "${s.name}" from the tracker? The sheet itself isn't touched.`,
                run: async () => { await data.deleteSheet(s.id); toast('Removed'); await store.reload(); }
            } : null,
            onSubmit: async (form) => {
                const fields = {
                    name: (form.get('name') || '').trim(),
                    url: form.get('url'),
                    description: form.get('description') || null,
                    vertical: form.get('vertical'),
                    owner_id: form.get('owner_id') || null,
                    review_every_days: form.get('review_every_days') ? parseInt(form.get('review_every_days'), 10) : null,
                    last_reviewed_at: form.get('last_reviewed_at') || null,
                    status: form.get('status')
                };
                if (s) await data.updateSheet(s.id, fields);
                else   await data.createSheet(fields);
                toast(s ? 'Saved' : 'Sheet added');
                await store.reload();
            }
        });
    },

    editDoc(id = null) {
        const d = id ? store.documents.find(x => x.id === id) : null;

        ui.modal({
            title: d ? 'Document' : 'Add a document',
            body: `
                ${ui.field('name', 'What it\'s called', { value: d?.name || '', required: true })}
                ${ui.field('url', 'Link', { type: 'url', value: d?.url || '', required: true })}
                ${ui.field('description', 'What it covers', { value: d?.description || '' })}
                <div class="field-pair">
                    ${ui.select('type', 'Kind',
                        Object.entries(VOCAB.docType).map(([value, label]) => ({ value, label })),
                        { value: d?.type || 'reference' })}
                    ${ui.select('owner_id', 'Owner', this.ownerOptions(), { value: d?.owner_id || '' })}
                </div>
                <div class="field-pair">
                    ${ui.select('review_every_days', 'Review it', this.cycleOptions(), { value: d?.review_every_days || '' })}
                    ${ui.field('last_reviewed_at', 'Last checked', { type: 'date', value: d?.last_reviewed_at || '' })}
                </div>
                ${ui.select('status', 'Status', this.statusOptions(), { value: d?.status || 'current' })}`,
            submitLabel: d ? 'Save document' : 'Add document',
            danger: d && auth.isAdmin ? {
                label: 'Remove',
                confirm: `Remove "${d.name}" from the tracker? The file itself isn't touched.`,
                run: async () => { await data.deleteDocument(d.id); toast('Removed'); await store.reload(); }
            } : null,
            onSubmit: async (form) => {
                const fields = {
                    name: (form.get('name') || '').trim(),
                    url: form.get('url'),
                    description: form.get('description') || null,
                    type: form.get('type'),
                    owner_id: form.get('owner_id') || null,
                    review_every_days: form.get('review_every_days') ? parseInt(form.get('review_every_days'), 10) : null,
                    last_reviewed_at: form.get('last_reviewed_at') || null,
                    status: form.get('status')
                };
                if (d) await data.updateDocument(d.id, fields);
                else   await data.createDocument({ ...fields, uploaded_by: auth.userId });
                toast(d ? 'Saved' : 'Document added');
                await store.reload();
            }
        });
    }
};
