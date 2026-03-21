/**
 * Ideas Module (Ideation Tab)
 */

const ideasModule = {
    ideas: [],
    currentFilter: 'all',
    searchTerm: '',

    async init() {
        await this.loadData();
        this.render();
        this.setupEventListeners();
        this.setupRealtimeUpdates();
    },

    async loadData() {
        try {
            this.ideas = await db.getIdeas();
        } catch (error) {
            console.error('Failed to load ideas:', error);
            toast.error('Failed to load ideas');
        }
    },

    render() {
        const container = document.getElementById('ideas-grid');
        if (!container) return;

        const filteredIdeas = this.getFilteredIdeas();

        if (filteredIdeas.length === 0) {
            container.innerHTML = '<div class="empty">No ideas yet. Click "New Idea" to create one.</div>';
            return;
        }

        container.innerHTML = filteredIdeas.map(idea => {
            const preview = idea.content
                ? idea.content.substring(0, 150) + (idea.content.length > 150 ? '...' : '')
                : 'No content';
            const author = idea.profiles?.full_name || 'Unknown';
            const date = new Date(idea.updated_at).toLocaleDateString();

            return `
                <div class="idea-card" data-id="${idea.id}">
                    <div class="idea-title">${idea.title}</div>
                    <div class="idea-preview">${preview}</div>
                    <div class="idea-tags">
                        ${(idea.tags || []).map(tag => `<span class="idea-tag">${tag}</span>`).join('')}
                    </div>
                    <div class="idea-meta">${author} | ${date}</div>
                </div>
            `;
        }).join('');

        // Attach click handlers
        container.querySelectorAll('.idea-card').forEach(card => {
            card.addEventListener('click', () => this.showEditModal(card.dataset.id));
        });
    },

    getFilteredIdeas() {
        return this.ideas.filter(idea => {
            const statusMatch = this.currentFilter === 'all' || idea.status === this.currentFilter;
            const searchMatch = !this.searchTerm ||
                idea.title.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
                (idea.content && idea.content.toLowerCase().includes(this.searchTerm.toLowerCase())) ||
                (idea.tags && idea.tags.some(t => t.toLowerCase().includes(this.searchTerm.toLowerCase())));
            return statusMatch && searchMatch;
        });
    },

    showAddModal() {
        const content = `
            <form id="idea-form">
                <div class="form-group">
                    <label for="idea-title">Title</label>
                    <input type="text" id="idea-title" name="title" required>
                </div>
                <div class="form-group">
                    <label for="idea-content">Content</label>
                    <textarea id="idea-content" name="content" rows="8"></textarea>
                </div>
                <div class="form-group">
                    <label for="idea-tags">Tags (comma-separated)</label>
                    <input type="text" id="idea-tags" name="tags" placeholder="growth, automation, process">
                </div>
                <div class="form-group">
                    <label for="idea-status">Status</label>
                    <select id="idea-status" name="status">
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                    </select>
                </div>
            </form>
        `;

        modal.show({
            title: 'New Idea',
            content,
            onSave: async () => {
                const form = document.getElementById('idea-form');
                const formData = new FormData(form);

                const tagsStr = formData.get('tags');
                const tags = tagsStr
                    ? tagsStr.split(',').map(t => t.trim()).filter(t => t)
                    : [];

                const idea = {
                    title: formData.get('title'),
                    content: formData.get('content'),
                    tags: tags,
                    status: formData.get('status'),
                    author_id: auth.currentUser.id
                };

                const created = await db.createIdea(idea);

                await db.logActivity(
                    auth.currentUser.id,
                    auth.currentProfile?.full_name || 'Unknown',
                    'created',
                    'idea',
                    created.id,
                    idea.title
                );

                await this.loadData();
                this.render();
                toast.success('Idea created');
            }
        });
    },

    showEditModal(ideaId) {
        const idea = this.ideas.find(i => i.id === ideaId);
        if (!idea) return;

        const content = `
            <form id="idea-form">
                <div class="form-group">
                    <label for="idea-title">Title</label>
                    <input type="text" id="idea-title" name="title" value="${idea.title}" required>
                </div>
                <div class="form-group">
                    <label for="idea-content">Content</label>
                    <textarea id="idea-content" name="content" rows="8">${idea.content || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="idea-tags">Tags (comma-separated)</label>
                    <input type="text" id="idea-tags" name="tags" value="${(idea.tags || []).join(', ')}">
                </div>
                <div class="form-group">
                    <label for="idea-status">Status</label>
                    <select id="idea-status" name="status">
                        <option value="active" ${idea.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="draft" ${idea.status === 'draft' ? 'selected' : ''}>Draft</option>
                        <option value="archived" ${idea.status === 'archived' ? 'selected' : ''}>Archived</option>
                    </select>
                </div>
            </form>
        `;

        modal.show({
            title: 'Edit Idea',
            content,
            onSave: async () => {
                const form = document.getElementById('idea-form');
                const formData = new FormData(form);

                const tagsStr = formData.get('tags');
                const tags = tagsStr
                    ? tagsStr.split(',').map(t => t.trim()).filter(t => t)
                    : [];

                const updates = {
                    title: formData.get('title'),
                    content: formData.get('content'),
                    tags: tags,
                    status: formData.get('status')
                };

                await db.updateIdea(ideaId, updates);

                await db.logActivity(
                    auth.currentUser.id,
                    auth.currentProfile?.full_name || 'Unknown',
                    'updated',
                    'idea',
                    ideaId,
                    updates.title
                );

                await this.loadData();
                this.render();
                toast.success('Idea updated');
            },
            onDelete: async () => {
                await db.deleteIdea(ideaId);

                await db.logActivity(
                    auth.currentUser.id,
                    auth.currentProfile?.full_name || 'Unknown',
                    'deleted',
                    'idea',
                    ideaId,
                    idea.title
                );

                await this.loadData();
                this.render();
                toast.success('Idea deleted');
            }
        });
    },

    setupEventListeners() {
        const addBtn = document.getElementById('add-idea-btn');
        const searchInput = document.getElementById('ideas-search');
        const statusFilter = document.getElementById('ideas-status-filter');

        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddModal());
        }

        if (searchInput) {
            let timeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.searchTerm = e.target.value;
                    this.render();
                }, 300);
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.render();
            });
        }
    },

    setupRealtimeUpdates() {
        realtime.subscribeToIdeas(() => {
            this.loadData().then(() => this.render());
        });
    },

    refresh() {
        this.loadData().then(() => this.render());
    }
};
