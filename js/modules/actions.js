/**
 * Actions Module
 */

const actionsModule = {
    actions: [],
    kpis: [],
    profiles: [],
    currentFilter: { layer: 'all', status: 'all' },

    async init() {
        await this.loadData();
        this.render();
        this.setupEventListeners();
        this.setupRealtimeUpdates();
    },

    async loadData() {
        try {
            const [actions, kpis, profiles] = await Promise.all([
                db.getActions(),
                db.getKPIs(),
                db.getProfiles()
            ]);

            this.actions = actions || [];
            this.kpis = kpis || [];
            this.profiles = profiles || [];
        } catch (error) {
            console.error('Failed to load actions:', error);
            toast.error('Failed to load actions');
        }
    },

    render() {
        const container = document.getElementById('actions-container');
        if (!container) return;

        const filteredActions = this.getFilteredActions();

        if (filteredActions.length === 0) {
            container.innerHTML = '<div class="empty">No actions match the current filter</div>';
            return;
        }

        // Group by layer
        const grouped = {
            1: filteredActions.filter(a => a.layer === 1),
            2: filteredActions.filter(a => a.layer === 2),
            3: filteredActions.filter(a => a.layer === 3)
        };

        let html = '';

        for (let layer = 1; layer <= 3; layer++) {
            if (this.currentFilter.layer !== 'all' && this.currentFilter.layer !== layer.toString()) {
                continue;
            }

            const layerConfig = APP_CONFIG.layers[layer];
            const layerActions = grouped[layer];

            if (layerActions.length === 0) continue;

            html += `
                <div class="layer-section" data-layer="${layer}">
                    <div class="layer-header">
                        <h3><span class="layer-num">${layer}</span> ${layerConfig.name}</h3>
                        <span class="layer-meta">Weeks ${layerConfig.weeks} | ${layerConfig.focus}</span>
                    </div>
                    <div class="actions-list">
                        ${layerActions.map(action => this.renderAction(action)).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

        // Attach event listeners to status buttons
        container.querySelectorAll('.action-status').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleStatus(e));
        });

        // Attach event listeners to action rows for editing
        container.querySelectorAll('.action-item').forEach(row => {
            row.addEventListener('dblclick', (e) => {
                if (!e.target.classList.contains('action-status')) {
                    this.showEditModal(row.dataset.id);
                }
            });
        });
    },

    renderAction(action) {
        const kpiName = action.kpis?.name || '-';
        const assignee = action.profiles?.full_name || 'Unassigned';

        return `
            <div class="action-item" data-id="${action.id}" data-status="${action.status}">
                <span class="action-id">${action.action_id}</span>
                <span class="action-title">${action.title}</span>
                <span class="action-kpi">${kpiName}</span>
                <span class="action-assignee">${assignee}</span>
                <button class="action-status ${action.status}" data-id="${action.id}">
                    ${this.formatStatus(action.status)}
                </button>
            </div>
        `;
    },

    formatStatus(status) {
        const labels = {
            'not_started': 'Not Started',
            'in_progress': 'In Progress',
            'done': 'Done'
        };
        return labels[status] || status;
    },

    getFilteredActions() {
        return this.actions.filter(action => {
            const layerMatch = this.currentFilter.layer === 'all' ||
                action.layer === parseInt(this.currentFilter.layer);
            const statusMatch = this.currentFilter.status === 'all' ||
                action.status === this.currentFilter.status;
            return layerMatch && statusMatch;
        });
    },

    async toggleStatus(e) {
        const btn = e.target;
        const actionId = btn.dataset.id;
        const action = this.actions.find(a => a.id === actionId);

        if (!action) return;

        // Cycle through statuses
        const statuses = ['not_started', 'in_progress', 'done'];
        const currentIndex = statuses.indexOf(action.status);
        const newStatus = statuses[(currentIndex + 1) % statuses.length];

        // Optimistic update
        btn.className = `action-status ${newStatus}`;
        btn.textContent = this.formatStatus(newStatus);

        try {
            await db.updateAction(actionId, { status: newStatus });

            // Log activity
            await db.logActivity(
                auth.currentUser.id,
                auth.currentProfile?.full_name || 'Unknown',
                'updated',
                'action',
                actionId,
                action.title,
                { status: { from: action.status, to: newStatus } }
            );

            action.status = newStatus;
            toast.success(`Action ${action.action_id} updated`);

            // Update dashboard if visible
            if (typeof dashboardModule !== 'undefined') {
                dashboardModule.refresh();
            }
        } catch (error) {
            // Revert on error
            btn.className = `action-status ${action.status}`;
            btn.textContent = this.formatStatus(action.status);
            toast.error('Failed to update action');
        }
    },

    showEditModal(actionId) {
        const action = this.actions.find(a => a.id === actionId);
        if (!action) return;

        const content = `
            <form id="edit-action-form">
                <div class="form-group">
                    <label>Action ID</label>
                    <input type="text" value="${action.action_id}" disabled>
                </div>
                <div class="form-group">
                    <label for="action-title">Title</label>
                    <input type="text" id="action-title" name="title" value="${action.title}" required>
                </div>
                <div class="form-group">
                    <label for="action-status">Status</label>
                    <select id="action-status" name="status">
                        <option value="not_started" ${action.status === 'not_started' ? 'selected' : ''}>Not Started</option>
                        <option value="in_progress" ${action.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                        <option value="done" ${action.status === 'done' ? 'selected' : ''}>Done</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="action-assignee">Assignee</label>
                    <select id="action-assignee" name="assignee_id">
                        <option value="">Unassigned</option>
                        ${this.profiles.map(p => `
                            <option value="${p.id}" ${action.assignee_id === p.id ? 'selected' : ''}>${p.full_name}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="action-due">Due Date</label>
                    <input type="date" id="action-due" name="due_date" value="${action.due_date || ''}">
                </div>
                <div class="form-group">
                    <label for="action-notes">Notes</label>
                    <textarea id="action-notes" name="notes">${action.notes || ''}</textarea>
                </div>
            </form>
        `;

        modal.show({
            title: `Edit Action ${action.action_id}`,
            content,
            onSave: async () => {
                const form = document.getElementById('edit-action-form');
                const formData = new FormData(form);

                const updates = {
                    title: formData.get('title'),
                    status: formData.get('status'),
                    assignee_id: formData.get('assignee_id') || null,
                    due_date: formData.get('due_date') || null,
                    notes: formData.get('notes')
                };

                await db.updateAction(actionId, updates);

                // Log activity
                await db.logActivity(
                    auth.currentUser.id,
                    auth.currentProfile?.full_name || 'Unknown',
                    'updated',
                    'action',
                    actionId,
                    updates.title
                );

                // Refresh
                await this.loadData();
                this.render();
                toast.success('Action updated');

                if (typeof dashboardModule !== 'undefined') {
                    dashboardModule.refresh();
                }
            }
        });
    },

    setupEventListeners() {
        const layerFilter = document.getElementById('filter-layer');
        const statusFilter = document.getElementById('filter-status');

        if (layerFilter) {
            layerFilter.addEventListener('change', (e) => {
                this.currentFilter.layer = e.target.value;
                this.render();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.currentFilter.status = e.target.value;
                this.render();
            });
        }
    },

    setupRealtimeUpdates() {
        realtime.subscribeToActions(() => {
            this.loadData().then(() => this.render());
        });
    },

    refresh() {
        this.loadData().then(() => this.render());
    }
};
