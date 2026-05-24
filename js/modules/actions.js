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

        // Pencil button → edit modal
        container.querySelectorAll('.action-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showEditModal(btn.dataset.id);
            });
        });

        // Double-click row also opens edit modal (kept for power users)
        container.querySelectorAll('.action-item').forEach(row => {
            row.addEventListener('dblclick', (e) => {
                if (!e.target.classList.contains('action-status') &&
                    !e.target.closest('.action-edit-btn')) {
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

        const pct = Math.max(0, Math.min(100, action.percent_done || 0));
        const outputBadge = action.output_link
            ? `<a class="action-output-link" href="${this.escape(action.output_link)}" target="_blank" title="Open output ↗" onclick="event.stopPropagation()">↗</a>`
            : '';
        const remarksBadge = action.rm_remarks
            ? `<span class="action-rm-dot" title="Note from RM: ${this.escape(action.rm_remarks)}">●</span>`
            : '';
        const blockedTag = action.status === 'blocked'
            ? `<span class="action-blocked-pill">Blocked</span>`
            : '';
        const tagBadge = action.project_tag
            ? `<span class="action-tag-pill" title="Ad-hoc project tag">#${this.escape(action.project_tag)}</span>`
            : '';
        const hoursBadge = action.hours_spent
            ? `<span class="action-hours-pill" title="Hours spent so far">${action.hours_spent}h</span>`
            : '';
        const kpiCellLabel = action.kpis?.name
            ? this.escape(action.kpis.name)
            : (action.project_tag ? `<em style="color:var(--text-muted);font-style:normal;">Ad-hoc</em>` : '-');

        return `
            <div class="action-item" data-id="${action.id}" data-status="${action.status}">
                <span class="action-id">${action.action_id}</span>
                <span class="action-title" title="${this.escape(action.notes || '')}">
                    ${this.escape(action.title)}
                    ${blockedTag}
                    ${tagBadge}
                    ${hoursBadge}
                    ${outputBadge}
                    ${remarksBadge}
                    ${assignedTrail}
                    ${action.status !== 'done' && action.status !== 'not_started'
                        ? `<div class="action-progress-mini"><div class="bar"><div class="fill" style="width:${pct}%"></div></div><span>${pct}%</span></div>`
                        : ''}
                </span>
                <span class="action-kpi">${kpiCellLabel}</span>
                <span class="owner-badge badge-${owner}">${ownerLabel}</span>
                <span class="action-due">${dueDate}</span>
                <button class="action-status ${action.status}" data-id="${action.id}">
                    ${this.formatStatus(action.status)}
                </button>
                <button class="action-edit-btn" data-id="${action.id}" title="Edit action" aria-label="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
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
            'blocked': 'Blocked',
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

        const statuses = ['not_started', 'in_progress', 'blocked', 'done'];
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

        // KPI options — KPI is optional; "Ad-hoc (no KPI)" stays selectable
        const kpiOptions = (this.kpis || []).map(k =>
            `<option value="${k.id}" ${action.kpi_id === k.id ? 'selected' : ''}>${this.escape(k.name)} (${k.member})</option>`
        ).join('');

        const content = `
            <form id="edit-action-form">
                <div class="form-row-2">
                    <div class="form-group">
                        <label>Action ID</label>
                        <input type="text" value="${this.escape(action.action_id)}" disabled>
                    </div>
                    <div class="form-group">
                        <label for="action-owner">Owner *</label>
                        <select id="action-owner" name="owner_name" required>
                            <option value="">Unassigned</option>
                            ${ownerOptions}
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label for="action-title">Title</label>
                    <input type="text" id="action-title" name="title" value="${this.escape(action.title)}" required>
                </div>

                <div class="form-row-2">
                    <div class="form-group">
                        <label for="action-status">Status</label>
                        <select id="action-status" name="status">
                            <option value="not_started" ${action.status === 'not_started' ? 'selected' : ''}>Not Started</option>
                            <option value="in_progress" ${action.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                            <option value="blocked" ${action.status === 'blocked' ? 'selected' : ''}>Blocked</option>
                            <option value="done" ${action.status === 'done' ? 'selected' : ''}>Done</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="action-due">Due Date</label>
                        <input type="date" id="action-due" name="due_date" value="${action.due_date || ''}">
                    </div>
                </div>

                <div class="form-group">
                    <label for="action-percent">Progress</label>
                    <input type="range" id="action-percent" name="percent_done" min="0" max="100" step="5" value="${action.percent_done || 0}" oninput="document.getElementById('percent-display').textContent = this.value + '%'">
                    <span id="percent-display" class="percent-display">${action.percent_done || 0}%</span>
                </div>

                <div class="form-divider">
                    <span>Bucket — KPI or ad-hoc project</span>
                </div>

                <div class="form-group">
                    <label for="action-kpi">KPI bucket <small style="color:var(--text-muted);font-weight:400">(leave empty for ad-hoc)</small></label>
                    <select id="action-kpi" name="kpi_id">
                        <option value="">— Ad-hoc · no KPI —</option>
                        ${kpiOptions}
                    </select>
                </div>

                <div class="form-row-2">
                    <div class="form-group">
                        <label for="action-project-tag">Project tag <small style="color:var(--text-muted);font-weight:400">(for ad-hoc work)</small></label>
                        <input type="text" id="action-project-tag" name="project_tag" placeholder="e.g. samadhan-website" value="${this.escape(action.project_tag || '')}">
                    </div>
                    <div class="form-group">
                        <label for="action-hours">Hours spent</label>
                        <input type="number" id="action-hours" name="hours_spent" min="0" step="0.25" placeholder="0" value="${action.hours_spent || ''}">
                    </div>
                </div>

                <div class="form-group">
                    <label for="action-output">Output link (Google Doc, Sheet, etc.)</label>
                    <input type="url" id="action-output" name="output_link" placeholder="https://..." value="${this.escape(action.output_link || '')}">
                </div>
                <div class="form-group">
                    <label for="action-notes">Notes</label>
                    <textarea id="action-notes" name="notes">${this.escape(action.notes || '')}</textarea>
                </div>
                ${auth.currentProfile?.role === 'admin' ? `
                <div class="form-group">
                    <label for="action-rm-remarks">RM remarks (visible to owner)</label>
                    <textarea id="action-rm-remarks" name="rm_remarks" placeholder="One-line feedback or correction for the owner...">${this.escape(action.rm_remarks || '')}</textarea>
                </div>
                ` : action.rm_remarks ? `
                <div class="form-group">
                    <label>RM remarks</label>
                    <div class="readonly-note">${this.escape(action.rm_remarks)}</div>
                </div>
                ` : ''}
            </form>
        `;

        modal.show({
            title: `Edit Action ${action.action_id}`,
            content,
            onSave: async () => {
                const form = document.getElementById('edit-action-form');
                const formData = new FormData(form);

                const kpiVal = formData.get('kpi_id') || null;
                let kpiCode = null, kraId = null;
                if (kpiVal) {
                    const k = (this.kpis || []).find(x => x.id === kpiVal);
                    if (k) { kpiCode = k.kpi_code; kraId = k.kra_id; }
                }
                const updates = {
                    title: formData.get('title'),
                    status: formData.get('status'),
                    percent_done: parseInt(formData.get('percent_done') || '0', 10),
                    owner_name: formData.get('owner_name') || null,
                    due_date: formData.get('due_date') || null,
                    output_link: formData.get('output_link') || null,
                    notes: formData.get('notes'),
                    kpi_id: kpiVal,
                    kpi_code: kpiCode,
                    kra_id: kraId,
                    project_tag: (formData.get('project_tag') || '').trim() || null,
                    hours_spent: formData.get('hours_spent') ? parseFloat(formData.get('hours_spent')) : null
                };
                // Only admins can set rm_remarks
                if (auth.currentProfile?.role === 'admin' && formData.has('rm_remarks')) {
                    updates.rm_remarks = formData.get('rm_remarks') || null;
                }

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

                <div class="form-row-2">
                    <div class="form-group">
                        <label>Assign to *</label>
                        <select name="owner_name" id="add-action-owner" required>
                            <option value="">-- pick owner --</option>
                            ${ownerOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Due date</label>
                        <input type="date" name="due_date">
                    </div>
                </div>

                <div class="form-divider"><span>Bucket — pick a KPI <em>or</em> tag as ad-hoc</span></div>

                <div class="form-group">
                    <label>KPI bucket <small style="color:var(--text-muted);font-weight:400">(leave empty for ad-hoc work)</small></label>
                    <select name="kpi_id" id="add-action-kpi">
                        <option value="">— Ad-hoc · no KPI —</option>
                        ${kpiOptions}
                    </select>
                </div>

                <div class="form-row-2">
                    <div class="form-group">
                        <label>Project tag <small style="color:var(--text-muted);font-weight:400">(if ad-hoc)</small></label>
                        <input type="text" name="project_tag" placeholder="e.g. samadhan-website">
                    </div>
                    <div class="form-group">
                        <label>Hours est. (optional)</label>
                        <input type="number" name="hours_spent" min="0" step="0.25" placeholder="0">
                    </div>
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

                // Title + owner are still required; KPI is now optional (ad-hoc work allowed)
                if (!fd.get('title') || !fd.get('owner_name')) {
                    toast.show('Title and owner are required.', 'error');
                    return false;
                }
                const kpiVal = fd.get('kpi_id') || null;
                const projectTag = (fd.get('project_tag') || '').trim() || null;

                // Must have either a KPI or a project_tag (otherwise the action has no home)
                if (!kpiVal && !projectTag) {
                    toast.show('Pick a KPI or set a project tag (so we know where this lives).', 'error');
                    return false;
                }

                // Look up KPI metadata (kra_id, kpi_code) if KPI was chosen
                let kraId = null, kpiCode = null;
                if (kpiVal) {
                    const kpiSelect = form.querySelector('select[name="kpi_id"]');
                    const selectedOpt = kpiSelect.options[kpiSelect.selectedIndex];
                    kraId = selectedOpt.dataset.kraId || null;
                    kpiCode = selectedOpt.dataset.kpiCode || null;
                }

                // Look up intern_id if the selected owner is an intern
                const ownerSelect = form.querySelector('select[name="owner_name"]');
                const selectedOwnerOpt = ownerSelect.options[ownerSelect.selectedIndex];
                const internId = selectedOwnerOpt.dataset.internId || null;

                // Generate action_id — KRA-numbered if KPI-backed, otherwise 'adhoc-N'
                let actionCode;
                if (kpiCode) {
                    const kraNum = kpiCode.split('_')[1];
                    const existingInKra = this.actions.filter(a => a.kpi_code?.startsWith('_' + kraNum + '_') || a.action_id?.startsWith(kraNum + '.'));
                    actionCode = `${kraNum}.${100 + existingInKra.length + 1}`;
                } else {
                    const existingAdhoc = this.actions.filter(a => a.action_id?.startsWith('adhoc-')).length;
                    actionCode = `adhoc-${100 + existingAdhoc + 1}`;
                }

                const newAction = {
                    action_id: actionCode,
                    title: fd.get('title'),
                    notes: fd.get('notes') || null,
                    kpi_id: kpiVal,
                    kpi_code: kpiCode,
                    kra_id: kraId,
                    project_tag: projectTag,
                    hours_spent: fd.get('hours_spent') ? parseFloat(fd.get('hours_spent')) : null,
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
