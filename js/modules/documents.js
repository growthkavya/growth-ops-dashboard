/**
 * Documents Module
 */

const documentsModule = {
    documents: [],

    async init() {
        await this.loadData();
        this.render();
        this.setupEventListeners();
    },

    async loadData() {
        try {
            this.documents = await db.getDocuments();
        } catch (error) {
            console.error('Failed to load documents:', error);
            toast.error('Failed to load documents');
        }
    },

    render() {
        const types = ['sop', 'reference', 'report', 'data'];
        const containers = {
            sop: document.getElementById('sops-list'),
            reference: document.getElementById('refs-list'),
            report: document.getElementById('reports-list'),
            data: document.getElementById('data-list')
        };

        types.forEach(type => {
            const container = containers[type];
            if (!container) return;

            const docs = this.documents.filter(d => d.type === type);

            if (docs.length === 0) {
                container.innerHTML = '<li class="empty">No documents</li>';
                return;
            }

            container.innerHTML = docs.map(doc => `
                <li>
                    <a href="${doc.url}" target="_blank">${doc.name}</a>
                    <button class="btn-small btn-delete" data-id="${doc.id}" title="Delete">&times;</button>
                </li>
            `).join('');

            // Attach delete handlers
            container.querySelectorAll('.btn-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.deleteDocument(btn.dataset.id);
                });
            });
        });
    },

    showAddModal() {
        const content = `
            <form id="doc-form">
                <div class="form-group">
                    <label for="doc-name">Document Name</label>
                    <input type="text" id="doc-name" name="name" required>
                </div>
                <div class="form-group">
                    <label for="doc-type">Type</label>
                    <select id="doc-type" name="type" required>
                        <option value="sop">SOP</option>
                        <option value="reference">Reference</option>
                        <option value="report">Report</option>
                        <option value="data">Data</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="doc-url">URL/Path</label>
                    <input type="text" id="doc-url" name="url" placeholder="https://... or /path/to/file.pdf" required>
                </div>
                <div class="form-group">
                    <label for="doc-desc">Description</label>
                    <textarea id="doc-desc" name="description"></textarea>
                </div>
            </form>
        `;

        modal.show({
            title: 'Add Document',
            content,
            onSave: async () => {
                const form = document.getElementById('doc-form');
                const formData = new FormData(form);

                const doc = {
                    name: formData.get('name'),
                    type: formData.get('type'),
                    url: formData.get('url'),
                    description: formData.get('description'),
                    uploaded_by: auth.currentUser.id
                };

                const created = await db.createDocument(doc);

                await db.logActivity(
                    auth.currentUser.id,
                    auth.currentProfile?.full_name || 'Unknown',
                    'created',
                    'document',
                    created.id,
                    doc.name
                );

                await this.loadData();
                this.render();
                toast.success('Document added');
            }
        });
    },

    async deleteDocument(docId) {
        const doc = this.documents.find(d => d.id === docId);
        if (!doc) return;

        if (!confirm(`Delete "${doc.name}"?`)) return;

        try {
            await db.deleteDocument(docId);

            await db.logActivity(
                auth.currentUser.id,
                auth.currentProfile?.full_name || 'Unknown',
                'deleted',
                'document',
                docId,
                doc.name
            );

            await this.loadData();
            this.render();
            toast.success('Document deleted');
        } catch (error) {
            toast.error('Failed to delete document');
        }
    },

    setupEventListeners() {
        const addBtn = document.getElementById('add-doc-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddModal());
        }
    },

    refresh() {
        this.loadData().then(() => this.render());
    }
};
