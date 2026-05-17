/**
 * Master Sheets Module
 *
 * Leadership hub: curated list of important Google Sheets across all SSEI
 * verticals, grouped by vertical. Read-only for members; admins can add/edit.
 * Lives inside the Documents tab.
 */

const masterSheetsModule = {
    sheets: [],

    VERTICALS: [
        { key: 'growth',    label: 'Growth Ops' },
        { key: 'sales',     label: 'Sales' },
        { key: 'academics', label: 'Academics' },
        { key: 'tech',      label: 'Tech' },
        { key: 'hiring',    label: 'Hiring' },
        { key: 'finance',   label: 'Finance' },
        { key: 'other',     label: 'Other' }
    ],

    async init() {
        await this.loadData();
        this.render();
        this.setupEventListeners();
    },

    async loadData() {
        try {
            this.sheets = await db.getMasterSheets();
        } catch (error) {
            console.error('Failed to load master sheets:', error);
            this.sheets = [];
        }
    },

    render() {
        const container = document.getElementById('master-sheets-list');
        if (!container) return;

        const isAdmin = auth.currentProfile?.role === 'admin';

        // Show/hide Add button based on role
        const addBtn = document.getElementById('add-sheet-btn');
        if (addBtn) addBtn.style.display = isAdmin ? '' : 'none';

        if (this.sheets.length === 0) {
            container.innerHTML = `
                <div class="master-sheets-empty">
                    <p>No sheets yet.</p>
                    ${isAdmin ? '<p class="muted">Click "+ Add Sheet" to add the first one — paste the Google Sheet URL, name it, pick a vertical.</p>' : '<p class="muted">Ask Kavya or Vidyut to add the master sheets here.</p>'}
                </div>
            `;
            return;
        }

        // Group by vertical
        const byVertical = {};
        this.sheets.forEach(s => {
            if (!byVertical[s.vertical]) byVertical[s.vertical] = [];
            byVertical[s.vertical].push(s);
        });

        const html = this.VERTICALS
            .filter(v => byVertical[v.key]?.length)
            .map(v => {
                const rows = byVertical[v.key].map(s => `
                    <div class="sheet-row" data-id="${s.id}">
                        <div class="sheet-row-main">
                            <a href="${this.escapeAttr(s.url)}" target="_blank" rel="noopener" class="sheet-name">${this.escapeHtml(s.name)}</a>
                            ${s.description ? `<div class="sheet-desc">${this.escapeHtml(s.description)}</div>` : ''}
                        </div>
                        <div class="sheet-row-meta">
                            ${s.owner ? `<span class="sheet-owner">${this.escapeHtml(s.owner)}</span>` : ''}
                            <a href="${this.escapeAttr(s.url)}" target="_blank" rel="noopener" class="sheet-open-btn" title="Open in new tab">Open ↗</a>
                            ${isAdmin ? `
                                <button class="sheet-icon-btn sheet-edit" data-id="${s.id}" title="Edit">✎</button>
                                <button class="sheet-icon-btn sheet-delete" data-id="${s.id}" title="Delete">×</button>
                            ` : ''}
                        </div>
                    </div>
                `).join('');

                return `
                    <div class="sheet-vertical-group">
                        <h4 class="sheet-vertical-title">${v.label} <span class="sheet-count">${byVertical[v.key].length}</span></h4>
                        <div class="sheet-rows">${rows}</div>
                    </div>
                `;
            })
            .join('');

        container.innerHTML = html;

        if (isAdmin) {
            container.querySelectorAll('.sheet-edit').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showEditModal(btn.dataset.id);
                });
            });
            container.querySelectorAll('.sheet-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteSheet(btn.dataset.id);
                });
            });
        }
    },

    showAddModal() {
        this.showModal(null);
    },

    showEditModal(id) {
        const sheet = this.sheets.find(s => s.id === id);
        if (!sheet) return;
        this.showModal(sheet);
    },

    showModal(sheet) {
        const isEdit = !!sheet;
        const verticalOpts = this.VERTICALS
            .map(v => `<option value="${v.key}" ${sheet?.vertical === v.key ? 'selected' : ''}>${v.label}</option>`)
            .join('');

        const content = `
            <form id="sheet-form">
                <div class="form-group">
                    <label for="sheet-name">Name</label>
                    <input type="text" id="sheet-name" name="name" required value="${this.escapeAttr(sheet?.name || '')}" placeholder="e.g. Performance Tracker">
                </div>
                <div class="form-group">
                    <label for="sheet-url">Google Sheet URL</label>
                    <input type="url" id="sheet-url" name="url" required value="${this.escapeAttr(sheet?.url || '')}" placeholder="https://docs.google.com/spreadsheets/d/...">
                </div>
                <div class="form-group">
                    <label for="sheet-vertical">Vertical</label>
                    <select id="sheet-vertical" name="vertical" required>${verticalOpts}</select>
                </div>
                <div class="form-group">
                    <label for="sheet-owner">Owner (optional)</label>
                    <input type="text" id="sheet-owner" name="owner" value="${this.escapeAttr(sheet?.owner || '')}" placeholder="e.g. Kavya, Riya, Vidyut">
                </div>
                <div class="form-group">
                    <label for="sheet-desc">Description (optional)</label>
                    <textarea id="sheet-desc" name="description" rows="2" placeholder="One line about what's in this sheet">${this.escapeHtml(sheet?.description || '')}</textarea>
                </div>
            </form>
        `;

        modal.show({
            title: isEdit ? 'Edit Sheet' : 'Add Sheet',
            content,
            onSave: async () => {
                const form = document.getElementById('sheet-form');
                const formData = new FormData(form);
                const payload = {
                    name: formData.get('name').trim(),
                    url: formData.get('url').trim(),
                    vertical: formData.get('vertical'),
                    owner: formData.get('owner').trim() || null,
                    description: formData.get('description').trim() || null
                };

                if (!payload.name || !payload.url) {
                    toast.error('Name and URL are required');
                    return false;
                }

                try {
                    if (isEdit) {
                        await db.updateMasterSheet(sheet.id, payload);
                        toast.success('Sheet updated');
                    } else {
                        await db.createMasterSheet(payload);
                        toast.success('Sheet added');
                    }
                    await this.loadData();
                    this.render();
                } catch (err) {
                    console.error('Save sheet failed:', err);
                    toast.error('Could not save. Check console.');
                    return false;
                }
            }
        });
    },

    async deleteSheet(id) {
        const sheet = this.sheets.find(s => s.id === id);
        if (!sheet) return;
        if (!confirm(`Remove "${sheet.name}" from the hub? (The Google Sheet itself is not deleted.)`)) return;
        try {
            await db.deleteMasterSheet(id);
            await this.loadData();
            this.render();
            toast.success('Sheet removed');
        } catch (err) {
            console.error('Delete sheet failed:', err);
            toast.error('Could not delete');
        }
    },

    setupEventListeners() {
        const addBtn = document.getElementById('add-sheet-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddModal());
        }
    },

    refresh() {
        this.loadData().then(() => this.render());
    },

    escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    },

    escapeAttr(s) {
        return String(s ?? '').replace(/["'<>&]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }
};
