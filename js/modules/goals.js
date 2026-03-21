/**
 * Goals Module
 */

const goalsModule = {
    goals: [],
    profiles: [],

    async init() {
        await this.loadData();
        this.render();
        this.setupEventListeners();
        this.setupRealtimeUpdates();
    },

    async loadData() {
        try {
            const [goals, profiles] = await Promise.all([
                db.getGoals(),
                db.getProfiles()
            ]);

            this.goals = goals || [];
            this.profiles = profiles || [];
        } catch (error) {
            console.error('Failed to load goals:', error);
            toast.error('Failed to load goals');
        }
    },

    render() {
        const container = document.getElementById('goals-container');
        if (!container) return;

        if (this.goals.length === 0) {
            container.innerHTML = '<div class="empty">No goals yet. Click "Add Goal" to create one.</div>';
            return;
        }

        // Build tree structure
        const tree = this.buildTree();
        container.innerHTML = this.renderTree(tree, 0);

        // Attach event listeners
        container.querySelectorAll('.goal-edit').forEach(btn => {
            btn.addEventListener('click', () => this.showEditModal(btn.dataset.id));
        });

        container.querySelectorAll('.goal-status-btn').forEach(btn => {
            btn.addEventListener('click', () => this.toggleStatus(btn.dataset.id));
        });
    },

    buildTree() {
        const roots = this.goals.filter(g => !g.parent_id);
        const getChildren = (parentId) => {
            return this.goals
                .filter(g => g.parent_id === parentId)
                .map(g => ({
                    ...g,
                    children: getChildren(g.id)
                }));
        };

        return roots.map(g => ({
            ...g,
            children: getChildren(g.id)
        }));
    },

    renderTree(goals, level) {
        return goals.map(goal => {
            const owner = this.profiles.find(p => p.id === goal.owner_id);
            const childClass = level > 0 ? 'child' : '';
            const statusClass = goal.status;

            return `
                <div class="goal-item ${childClass}" data-id="${goal.id}" style="margin-left: ${level * 24}px;">
                    <span class="goal-type">${goal.type}</span>
                    <div class="goal-content">
                        <div class="goal-title">${goal.title}</div>
                        <div class="goal-desc">${goal.description || ''}</div>
                        ${owner ? `<div class="goal-owner">Owner: ${owner.full_name}</div>` : ''}
                    </div>
                    <div class="goal-actions">
                        <button class="btn btn-small goal-status-btn ${statusClass}" data-id="${goal.id}">
                            ${this.formatStatus(goal.status)}
                        </button>
                        <button class="btn btn-small btn-secondary goal-edit" data-id="${goal.id}">Edit</button>
                    </div>
                </div>
                ${goal.children ? this.renderTree(goal.children, level + 1) : ''}
            `;
        }).join('');
    },

    formatStatus(status) {
        const labels = {
            'not_started': 'Not Started',
            'in_progress': 'In Progress',
            'done': 'Done'
        };
        return labels[status] || status;
    },

    async toggleStatus(goalId) {
        const goal = this.goals.find(g => g.id === goalId);
        if (!goal) return;

        const statuses = ['not_started', 'in_progress', 'done'];
        const currentIndex = statuses.indexOf(goal.status);
        const newStatus = statuses[(currentIndex + 1) % statuses.length];

        try {
            await db.updateGoal(goalId, { status: newStatus });

            await db.logActivity(
                auth.currentUser.id,
                auth.currentProfile?.full_name || 'Unknown',
                'updated',
                'goal',
                goalId,
                goal.title,
                { status: { from: goal.status, to: newStatus } }
            );

            goal.status = newStatus;
            this.render();
            toast.success('Goal updated');
        } catch (error) {
            toast.error('Failed to update goal');
        }
    },

    showAddModal(parentId = null) {
        const parentGoal = parentId ? this.goals.find(g => g.id === parentId) : null;
        const typeOptions = parentGoal ? this.getChildTypes(parentGoal.type) : ['year', 'quarter', 'month', 'week'];

        const content = `
            <form id="goal-form">
                <div class="form-group">
                    <label for="goal-type">Type</label>
                    <select id="goal-type" name="type" required>
                        ${typeOptions.map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="goal-title">Title</label>
                    <input type="text" id="goal-title" name="title" required>
                </div>
                <div class="form-group">
                    <label for="goal-desc">Description</label>
                    <textarea id="goal-desc" name="description"></textarea>
                </div>
                <div class="form-group">
                    <label for="goal-owner">Owner</label>
                    <select id="goal-owner" name="owner_id">
                        <option value="">No owner</option>
                        ${this.profiles.map(p => `<option value="${p.id}">${p.full_name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="goal-due">Due Date</label>
                    <input type="date" id="goal-due" name="due_date">
                </div>
            </form>
        `;

        modal.show({
            title: parentGoal ? `Add Sub-Goal to "${parentGoal.title}"` : 'Add Goal',
            content,
            onSave: async () => {
                const form = document.getElementById('goal-form');
                const formData = new FormData(form);

                const goal = {
                    type: formData.get('type'),
                    title: formData.get('title'),
                    description: formData.get('description'),
                    owner_id: formData.get('owner_id') || null,
                    due_date: formData.get('due_date') || null,
                    parent_id: parentId,
                    status: 'not_started'
                };

                const created = await db.createGoal(goal);

                await db.logActivity(
                    auth.currentUser.id,
                    auth.currentProfile?.full_name || 'Unknown',
                    'created',
                    'goal',
                    created.id,
                    goal.title
                );

                await this.loadData();
                this.render();
                toast.success('Goal created');

                if (typeof dashboardModule !== 'undefined') {
                    dashboardModule.refresh();
                }
            }
        });
    },

    showEditModal(goalId) {
        const goal = this.goals.find(g => g.id === goalId);
        if (!goal) return;

        const content = `
            <form id="goal-form">
                <div class="form-group">
                    <label for="goal-type">Type</label>
                    <select id="goal-type" name="type" required>
                        <option value="year" ${goal.type === 'year' ? 'selected' : ''}>Year</option>
                        <option value="quarter" ${goal.type === 'quarter' ? 'selected' : ''}>Quarter</option>
                        <option value="month" ${goal.type === 'month' ? 'selected' : ''}>Month</option>
                        <option value="week" ${goal.type === 'week' ? 'selected' : ''}>Week</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="goal-title">Title</label>
                    <input type="text" id="goal-title" name="title" value="${goal.title}" required>
                </div>
                <div class="form-group">
                    <label for="goal-desc">Description</label>
                    <textarea id="goal-desc" name="description">${goal.description || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="goal-status">Status</label>
                    <select id="goal-status" name="status">
                        <option value="not_started" ${goal.status === 'not_started' ? 'selected' : ''}>Not Started</option>
                        <option value="in_progress" ${goal.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                        <option value="done" ${goal.status === 'done' ? 'selected' : ''}>Done</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="goal-owner">Owner</label>
                    <select id="goal-owner" name="owner_id">
                        <option value="">No owner</option>
                        ${this.profiles.map(p => `
                            <option value="${p.id}" ${goal.owner_id === p.id ? 'selected' : ''}>${p.full_name}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="goal-due">Due Date</label>
                    <input type="date" id="goal-due" name="due_date" value="${goal.due_date || ''}">
                </div>
            </form>
        `;

        modal.show({
            title: 'Edit Goal',
            content,
            onSave: async () => {
                const form = document.getElementById('goal-form');
                const formData = new FormData(form);

                const updates = {
                    type: formData.get('type'),
                    title: formData.get('title'),
                    description: formData.get('description'),
                    status: formData.get('status'),
                    owner_id: formData.get('owner_id') || null,
                    due_date: formData.get('due_date') || null
                };

                await db.updateGoal(goalId, updates);

                await db.logActivity(
                    auth.currentUser.id,
                    auth.currentProfile?.full_name || 'Unknown',
                    'updated',
                    'goal',
                    goalId,
                    updates.title
                );

                await this.loadData();
                this.render();
                toast.success('Goal updated');
            },
            onDelete: async () => {
                await db.deleteGoal(goalId);

                await db.logActivity(
                    auth.currentUser.id,
                    auth.currentProfile?.full_name || 'Unknown',
                    'deleted',
                    'goal',
                    goalId,
                    goal.title
                );

                await this.loadData();
                this.render();
                toast.success('Goal deleted');

                if (typeof dashboardModule !== 'undefined') {
                    dashboardModule.refresh();
                }
            }
        });
    },

    getChildTypes(parentType) {
        const hierarchy = ['year', 'quarter', 'month', 'week'];
        const parentIndex = hierarchy.indexOf(parentType);
        return hierarchy.slice(parentIndex + 1);
    },

    setupEventListeners() {
        const addBtn = document.getElementById('add-goal-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddModal());
        }
    },

    setupRealtimeUpdates() {
        realtime.subscribeToGoals(() => {
            this.loadData().then(() => this.render());
        });
    },

    refresh() {
        this.loadData().then(() => this.render());
    }
};
