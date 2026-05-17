/**
 * Actions Module — Year 2 KRA framework
 *
 * Actions are grouped by KRA (kra1..kra5) and can be filtered by KRA, owner
 * (kavya/riya), and status. Double-click a row to edit; click the
 * status pill to cycle not_started → in_progress → done.
 */

const actionsModule = {
    actions: [],
    kras: [],
    kpis: [],
    profiles: [],
    currentFilter: { kra: 'all', owner: 'all', status: 'all' },

    async init() {
        await this.loadData();
        this.render();
        this.setupEventListeners();
        this.setupRealtimeUpdates();
    },

    async loadData() {
        try {
            const [actions, kras, kpis, profiles] = await Promise.all([
                db.getActions(),
                db.getKRAs(),
                db.getKPIs(),
                db.getProfiles()
            ]);

            this.actions = actions || [];
            this.kras = kras || [];
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

        // Group by KRA (using kra_code from joined kras row, fall back to kra_id lookup)
        const kraList = this.kras.slice().sort((a, b) => a.sort_order - b.sort_order);
        let html = '';

        for (const kra of kraList) {
            // Skip if KRA filter is set to a specific KRA and doesn't match
            if (this.currentFilter.kra !== 'all' && this.currentFilter.kra !== kra.kra_code) {
                continue;
            }

            const kraActions = filteredActions.filter(a => {
                const code = a.kras?.kra_code;
                return code === kra.kra_code;
            });

            if (kraActions.length === 0) continue;

            const doneCount = kraActions.filter(a => a.status === 'done').length;

            html += `
                <div class="kra-section" data-kra="${kra.kra_code}">
                    <div class="kra-header">
                        <h3>
                            <span class="kra-num">${kra.kra_code.replace('kra','')}</span>
                            ${kra.name}
                        </h3>
                        <span class="kra-meta">${doneCount} / ${kraActions.length} done</span>
                    </div>
                    <div class="actions-list">
                        ${kraActions.map(action => this.renderAction(action)).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html || '<div class="empty">No actions match the current filter</div>';

        // Status pill click → cycle status
        container.querySelectorAll('.action-status').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleStatus(e);
            });
        });

        // Double-click row → edit modal
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
        const owner = action.owner_name || 'unassigned';
        const ownerLabel = memberName(owner);
        const dueDate = action.due_date
            ? new Date(action.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
            : '';

        // Audit trail: who assigned this and when
        let assignedTrail = '';
        if (action.assigned_by_name) {
            const date = action.assigned_at
                ? new Date(action.assigned_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
                : '';
            const label = `Assigned by ${action.assigned_by_name}${date ? ' · ' + date : ''}`;
            assignedTrail = `<div class="action-assigned-trail" title="${this.escape(label)}">↳ ${this.escape(label)}</div>`;
        }

        return `
            <div class="action-item" data-id="${action.id}" data-status="${action.status}">
                <span class="action-id">${action.action_id}</span>
                <span class="action-title" title="${this.escape(action.notes || '')}">
                    ${this.escape(action.title)}
                    ${assignedTrail}
                </span>
                <span class="action-kpi">${this.escape(kpiName)}</span>
                <span class="owner-badge badge-${owner}">${ownerLabel}</span>
                <span class="action-due">${dueDate}</span>
                <button class="action-status ${action.status}" data-id="${action.id}">
                    ${this.formatStatus(action.status)}
                </button>
            </div>
        `;
    },

    escape(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
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
            const kraMatch = this.currentFilter.kra === 'all' ||
                action.kras?.kra_code === this.currentFilter.kra;
            const ownerMatch = this.currentFilter.owner === 'all' ||
                action.owner_name === this.currentFilter.owner;
            const statusMatch = this.currentFilter.status === 'all' ||
                action.status === this.currentFilter.status;
            return kraMatch && ownerMatch && statusMatch;
        });
    },

    async toggleStatus(e) {
        const btn = e.target;
        const actionId = btn.dataset.id;
        const action = this.actions.find(a => a.id === actionId);

        if (!action) return;

        const statuses = ['not_started', 'in_progress', 'done'];
        const currentIndex = statuses.indexOf(action.status);
        const newStatus = statuses[(currentIndex + 1) % statuses.length];

        // Optimistic update
        btn.className = `action-status ${newStatus}`;
        btn.textContent = this.formatStatus(newStatus);

        try {
            await db.updateAction(actionId, { status: newStatus });

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
            toast.success(`Action ${action.action_id}: ${this.formatStatus(newStatus)}`);

            if (typeof dashboardModule !== 'undefined') {
                dashboardModule.refresh();
            }
        } catch (error) {
            btn.className = `action-status ${action.status}`;
            btn.textContent = this.formatStatus(action.status);
            toast.error('Failed to update action');
        }
    },

    showEditModal(actionId) {
        const action = this.actions.find(a => a.id === actionId);
        if (!action) return;

        const ownerOptions = APP_CONFIG.team.map(m =>
            `<option value="${m.id}" ${action.owner_name === m.id ? 'selected' : ''}>${m.name}</option>`
        ).join('');

        const content = `
            <form id="edit-action-form">
                <div class="form-group">
                    <label>Action ID</label>
                    <input type="text" value="${this.escape(action.action_id)}" disabled>
                </div>
                <div class="form-group">
                    <label for="action-title">Title</label>
                    <input type="text" id="action-title" name="title" value="${this.escape(action.title)}" required>
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
                    <label for="action-owner">Owner</label>
                    <select id="action-owner" name="owner_name">
                        <option value="">Unassigned</option>
                        ${ownerOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label for="action-due">Due Date</label>
                    <input type="date" id="action-due" name="due_date" value="${action.due_date || ''}">
                </div>
                <div class="form-group">
                    <label for="action-notes">Notes</label>
                    <textarea id="action-notes" name="notes">${this.escape(action.notes || '')}</textarea>
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
                    owner_name: formData.get('owner_name') || null,
                    due_date: formData.get('due_date') || null,
                    notes: formData.get('notes')
                };

                await db.updateAction(actionId, updates);

                await db.logActivity(
                    auth.currentUser.id,
                    auth.currentProfile?.full_name || 'Unknown',
                    'updated',
                    'action',
                    actionId,
                    updates.title
                );

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
        const kraFilter = document.getElementById('filter-kra');
        const ownerFilter = document.getElementById('filter-owner');
        const statusFilter = document.getElementById('filter-status');
        const addBtn = document.getElementById('add-action-btn');

        if (kraFilter) {
            kraFilter.addEventListener('change', (e) => {
                this.currentFilter.kra = e.target.value;
                this.render();
            });
        }

        if (ownerFilter) {
            ownerFilter.addEventListener('change', (e) => {
                this.currentFilter.owner = e.target.value;
                this.render();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.currentFilter.status = e.target.value;
                this.render();
            });
        }

        if (addBtn && !addBtn._wired) {
            addBtn._wired = true;
            addBtn.addEventListener('click', () => this.openAddActionModal());
        }
    },

    /**
     * "+ Add Action" modal. Admin sees full options (assign to Kavya / Riya /
     * any intern). Members (Riya) can only assign to themselves or an intern.
     * Interns can't open this dialog at all (the button is .admin-only, hidden
     * by CSS for body.role-intern).
     */
    async openAddActionModal(presetOwner = null) {
        const role = auth.currentProfile?.role;
        const myMemberKey = auth.currentProfile?.member_key;

        // Load interns list for the assign dropdown
        const interns = await db.getInterns().catch(() => []);

        // Owner options based on role
        let ownerOptions = '';
        if (role === 'admin') {
            ownerOptions = `
                <option value="kavya">Kavya</option>
                <option value="riya">Riya</option>
                ${interns.map(i => `<option value="intern1" data-intern-id="${i.id}">Intern: ${this.escape(i.name)}</option>`).join('')}
            `;
        } else if (role === 'member') {
            ownerOptions = `
                <option value="${myMemberKey}">Myself (${this.escape(auth.currentProfile.full_name || myMemberKey)})</option>
                ${interns.map(i => `<option value="intern1" data-intern-id="${i.id}">Intern: ${this.escape(i.name)}</option>`).join('')}
            `;
        }

        const kpis = this.kpis.filter(k =>
            role === 'admin' || k.member === myMemberKey || k.member === 'intern1'
        );

        const kpiOptions = kpis.map(k =>
            `<option value="${k.id}" data-kra-id="${k.kra_id}" data-kpi-code="${k.kpi_code}" data-member="${k.member}">${this.escape(k.name)} (${k.member})</option>`
        ).join('');

        const content = `
            <form id="add-action-form" class="form">
                <div class="form-group">
                    <label>Title *</label>
                    <input type="text" name="title" required placeholder="What needs to be done?">
                </div>

                <div class="form-group">
                    <label>Assign to *</label>
                    <select name="owner_name" id="add-action-owner" required>
                        <option value="">-- pick owner --</option>
                        ${ownerOptions}
                    </select>
                </div>

                <div class="form-group">
                    <label>KPI bucket *</label>
                    <select name="kpi_id" required>
                        <option value="">-- pick KPI --</option>
                        ${kpiOptions}
                    </select>
                </div>

                <div class="form-group">
                    <label>Due date</label>
                    <input type="date" name="due_date">
                </div>

                <div class="form-group">
                    <label>Notes</label>
                    <textarea name="notes" rows="3" placeholder="Context, deliverables, dependencies..."></textarea>
                </div>
            </form>
        `;

        modal.show({
            title: 'Add Action',
            content,
            saveText: 'Create Action',
            onSave: async () => {
                const form = document.getElementById('add-action-form');
                const fd = new FormData(form);

                if (!fd.get('title') || !fd.get('owner_name') || !fd.get('kpi_id')) {
                    toast.show('Please fill all required fields.', 'error');
                    return false;
                }

                // Look up KPI metadata (kra_id, kpi_code)
                const kpiSelect = form.querySelector('select[name="kpi_id"]');
                const selectedOpt = kpiSelect.options[kpiSelect.selectedIndex];
                const kraId = selectedOpt.dataset.kraId;
                const kpiCode = selectedOpt.dataset.kpiCode;

                // Look up intern_id if the selected owner is an intern
                const ownerSelect = form.querySelector('select[name="owner_name"]');
                const selectedOwnerOpt = ownerSelect.options[ownerSelect.selectedIndex];
                const internId = selectedOwnerOpt.dataset.internId || null;

                // Generate next action_id based on the KRA
                const kraNum = (selectedOpt.dataset.kpiCode || '_X_X').split('_')[1];
                const existingInKra = this.actions.filter(a => a.kpi_code?.startsWith('_' + kraNum + '_') || a.action_id?.startsWith(kraNum + '.'));
                const nextIdx = existingInKra.length + 1;
                const actionCode = `${kraNum}.${100 + nextIdx}`;  // safe non-colliding number

                const newAction = {
                    action_id: actionCode,
                    title: fd.get('title'),
                    notes: fd.get('notes') || null,
                    kpi_id: fd.get('kpi_id'),
                    kpi_code: kpiCode,
                    kra_id: kraId,
                    owner_name: fd.get('owner_name'),
                    intern_id: internId,
                    status: 'not_started',
                    due_date: fd.get('due_date') || null,
                    assigned_by: auth.currentUser.id,
                    assigned_by_name: auth.currentProfile?.full_name || 'Unknown',
                    assigned_at: new Date().toISOString()
                };

                try {
                    const created = await db.createAction(newAction);
                    toast.show('Action created.', 'success');
                    await db.logActivity(
                        auth.currentUser.id,
                        auth.currentProfile?.full_name || 'Unknown',
                        'created',
                        'action',
                        created.id,
                        newAction.title
                    );
                    // If assigned to an intern, write notifications for Kavya + Riya
                    if (internId) {
                        await db.notifySupervisors({
                            event_type: 'action_assigned',
                            entity_type: 'action',
                            entity_id: created.id,
                            entity_title: newAction.title,
                            intern_id: internId,
                            message: `New action assigned to intern`,
                            link: '#actions'
                        });
                    }
                    await this.loadData();
                    this.render();
                    return true;
                } catch (err) {
                    console.error('createAction failed:', err);
                    toast.show('Failed to create action: ' + (err.message || err), 'error');
                    return false;
                }
            }
        });
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
