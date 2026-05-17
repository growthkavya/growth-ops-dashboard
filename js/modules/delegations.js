/**
 * Delegations Module
 *
 * The "manager view" for admins + members. NOT for interns.
 *
 * Shows everything THIS USER has assigned to others, grouped by assignee.
 * Includes a prominent quick-assign bar at the top so creating a task takes
 * 5 seconds (especially for Riya assigning small things to interns).
 *
 * Auto-flags actions that haven't moved in 7+ days as "needs attention".
 *
 * Filtering:
 *   - Admin (Kavya): can assign to Riya, any active intern, or self
 *   - Member (Riya): can assign to any active intern, or self
 *   - Self-assignments appear in their own "Things I owe myself" group
 */

const delegationsModule = {
    actions: [],
    interns: [],
    kpis: [],
    profiles: [],
    currentFilter: 'open',
    initialized: false,

    async init() {
        const role = auth.currentProfile?.role;
        if (role === 'intern') return;     // hidden for interns
        if (this.initialized) return;
        this.initialized = true;
        await this.loadData();
        this.renderQuickAssignBar();
        this.render();
        this.setupEventListeners();
    },

    async refresh() {
        await this.loadData();
        this.renderQuickAssignBar();
        this.render();
    },

    async loadData() {
        const me = auth.currentUser?.id;
        if (!me) return;
        try {
            const [actions, interns, profiles] = await Promise.all([
                db.getActions(),
                db.getInterns(true),
                db.getProfiles()
            ]);
            // Only actions THIS user has assigned (assigned_by = me)
            // OR if admin role + a deliberate "show everyone's assignments" toggle is on (future).
            this.actions = (actions || []).filter(a => a.assigned_by === me);
            this.interns = interns || [];
            this.profiles = profiles || [];
            // Cache KPIs the current user can see
            this.kpis = await db.getKPIs();
        } catch (e) {
            console.error('Delegations loadData failed:', e);
        }
    },

    // ---------- QUICK-ASSIGN BAR ----------
    renderQuickAssignBar() {
        const role = auth.currentProfile?.role;
        const myKey = auth.currentProfile?.member_key;
        const myName = auth.currentProfile?.full_name || myKey;

        // Build assignee options based on role
        let assigneeOpts = [];
        if (role === 'admin') {
            assigneeOpts = [
                { value: 'kavya:', label: 'Kavya' },
                { value: 'riya:',  label: 'Riya' },
                ...this.interns.map(i => ({ value: `intern1:${i.id}`, label: `Intern: ${i.name}` }))
            ];
        } else if (role === 'member') {
            assigneeOpts = [
                { value: `${myKey}:`, label: `Myself (${myName})` },
                ...this.interns.map(i => ({ value: `intern1:${i.id}`, label: `Intern: ${i.name}` }))
            ];
        }

        const optsHtml = assigneeOpts.map(o => `<option value="${o.value}">${this.escape(o.label)}</option>`).join('');
        // KPIs the user can see — for admin this is all, for member this is their own + intern KPIs
        const kpiOpts = (this.kpis || []).map(k =>
            `<option value="${k.id}" data-kra-id="${k.kra_id}" data-kpi-code="${k.kpi_code}">${this.escape(k.kpi_code)} · ${this.escape(k.name)}</option>`
        ).join('');

        const bar = document.getElementById('quick-assign-bar');
        if (!bar) return;
        bar.innerHTML = `
            <form id="quick-assign-form" class="quick-assign-form">
                <select name="assignee" class="quick-assignee" required>
                    <option value="">Assign to…</option>
                    ${optsHtml}
                </select>
                <input type="text" name="title" placeholder="Task title…" required maxlength="200">
                <select name="kpi_id" class="quick-kpi" required>
                    <option value="">KPI bucket…</option>
                    ${kpiOpts}
                </select>
                <input type="date" name="due_date" title="Due date">
                <button type="submit" class="btn btn-primary btn-small">Assign</button>
            </form>
        `;

        // Auto-suggest KPI when assignee changes (last KPI used for that assignee)
        bar.querySelector('select[name="assignee"]').addEventListener('change', (e) => {
            const val = e.target.value;
            if (!val) return;
            const [owner, internId] = val.split(':');
            // Find the most recent action by this user that targeted the same assignee
            const matches = this.actions.filter(a =>
                a.owner_name === owner && (internId ? a.intern_id === internId : !a.intern_id)
            ).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            if (matches.length) {
                const kpiSel = bar.querySelector('select[name="kpi_id"]');
                if (kpiSel) kpiSel.value = matches[0].kpi_id || '';
            }
        });

        // Submit
        bar.querySelector('#quick-assign-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleQuickAssign(e.target);
        });
    },

    async handleQuickAssign(form) {
        const fd = new FormData(form);
        const [owner, internId] = (fd.get('assignee') || ':').split(':');
        const kpiSel = form.querySelector('select[name="kpi_id"]');
        const opt = kpiSel.options[kpiSel.selectedIndex];
        if (!owner || !fd.get('title') || !fd.get('kpi_id')) {
            toast.show('Pick assignee, title, and KPI.', 'error');
            return;
        }

        // Generate a non-colliding action_id from the KPI's KRA
        const kpiCode = opt.dataset.kpiCode || '';
        const kraNum = kpiCode.split('_')[1] || 'x';
        const sameKra = this.actions.filter(a => (a.kpi_code || '').split('_')[1] === kraNum);
        const actionId = `${kraNum}.${500 + sameKra.length + 1}`;  // safe range outside the seed codes

        const newAction = {
            action_id: actionId,
            title: fd.get('title'),
            kpi_id: fd.get('kpi_id'),
            kpi_code: kpiCode,
            kra_id: opt.dataset.kraId,
            owner_name: owner,
            intern_id: internId || null,
            status: 'not_started',
            due_date: fd.get('due_date') || null,
            assigned_by: auth.currentUser.id,
            assigned_by_name: auth.currentProfile?.full_name || 'Unknown',
            assigned_at: new Date().toISOString()
        };

        try {
            const created = await db.createAction(newAction);
            await db.logActivity(
                auth.currentUser.id,
                auth.currentProfile?.full_name || 'Unknown',
                'created', 'action', created.id, newAction.title
            );
            // Notification: if assigned to an intern, ping Kavya + Riya
            if (internId) {
                await db.notifySupervisors({
                    event_type: 'action_assigned',
                    entity_type: 'action',
                    entity_id: created.id,
                    entity_title: newAction.title,
                    intern_id: internId,
                    message: `${auth.currentProfile?.full_name || 'Someone'} assigned a task to the intern`,
                    link: '#delegations'
                });
            }
            toast.show('Assigned.', 'success');
            form.reset();
            await this.refresh();
        } catch (err) {
            console.error('Quick-assign failed:', err);
            toast.show('Assign failed: ' + (err.message || err), 'error');
        }
    },

    // ---------- RENDER ----------
    render() {
        const container = document.getElementById('delegations-container');
        const callout = document.getElementById('stuck-callout');
        if (!container) return;

        const filtered = this.applyFilter(this.actions);

        // Stuck: not done, last updated 7+ days ago
        const now = Date.now();
        const stuck = this.actions.filter(a => {
            if (a.status === 'done') return false;
            const t = new Date(a.updated_at || a.created_at || 0).getTime();
            return (now - t) > 7 * 24 * 60 * 60 * 1000;
        });
        callout.innerHTML = stuck.length === 0 ? '' : `
            <div class="stuck-callout">
                <div class="stuck-callout-header">
                    ⚠ Needs attention &mdash; ${stuck.length} task${stuck.length === 1 ? '' : 's'} haven't moved in 7+ days
                </div>
                ${stuck.slice(0, 8).map(a => this.renderRow(a, true)).join('')}
            </div>
        `;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Nothing assigned by you yet</h3>
                    <p>Use the quick-assign bar above to delegate a task. Pick an assignee, type a title, pick a KPI bucket, hit Assign.</p>
                </div>
            `;
            return;
        }

        // Group by assignee (owner_name + intern_id pair)
        const groups = new Map();
        filtered.forEach(a => {
            const key = a.intern_id ? `intern:${a.intern_id}` : a.owner_name;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(a);
        });

        const groupHtml = Array.from(groups.entries()).map(([key, list]) => {
            const label = this.assigneeLabel(key, list[0]);
            const counts = this.countByStatus(list);
            return `
                <div class="delegation-group">
                    <div class="delegation-group-header">
                        <h3>${this.escape(label)}</h3>
                        <span class="delegation-count">
                            ${list.length} total
                            · <span class="cnt cnt-done">${counts.done} done</span>
                            · <span class="cnt cnt-ip">${counts.in_progress} in&nbsp;progress</span>
                            · <span class="cnt cnt-ns">${counts.not_started} not&nbsp;started</span>
                        </span>
                    </div>
                    <div class="delegation-list">
                        ${list.map(a => this.renderRow(a)).join('')}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = groupHtml;
    },

    renderRow(a, isStuck = false) {
        const due = a.due_date
            ? new Date(a.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
            : '';
        const isOverdue = a.due_date && new Date(a.due_date) < new Date() && a.status !== 'done';
        const lastChange = a.updated_at || a.created_at;
        const daysAgo = lastChange ? Math.floor((Date.now() - new Date(lastChange).getTime()) / 86400000) : null;
        const lastLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? '1d ago' : `${daysAgo}d ago`;

        return `
            <div class="delegation-row ${isStuck ? 'stuck' : ''}" data-id="${a.id}">
                <button class="delegation-status status-${a.status}" data-id="${a.id}" data-status="${a.status}" title="Click to cycle status">
                    ${this.statusLabel(a.status)}
                </button>
                <div class="delegation-title">
                    ${this.escape(a.title)}
                    ${a.kpis ? `<div class="delegation-kpi">${this.escape(a.kpis.name)}</div>` : ''}
                </div>
                <div class="delegation-due ${isOverdue ? 'overdue' : ''}">${due}${isOverdue ? ' · overdue' : ''}</div>
                <div class="delegation-update">${lastChange ? lastLabel : ''}</div>
            </div>
        `;
    },

    assigneeLabel(key, sampleAction) {
        if (key.startsWith('intern:')) {
            const internId = key.slice('intern:'.length);
            const intern = this.interns.find(i => i.id === internId);
            return intern ? `Intern · ${intern.name}` : 'Intern · (deleted)';
        }
        if (key === 'kavya') return 'Kavya';
        if (key === 'riya')  return 'Riya';
        return key;
    },

    countByStatus(list) {
        return {
            not_started: list.filter(a => a.status === 'not_started').length,
            in_progress: list.filter(a => a.status === 'in_progress').length,
            done:        list.filter(a => a.status === 'done').length,
        };
    },

    statusLabel(s) {
        return ({ not_started: 'Not started', in_progress: 'In progress', done: 'Done' })[s] || s;
    },

    applyFilter(list) {
        switch (this.currentFilter) {
            case 'open':         return list.filter(a => a.status !== 'done');
            case 'all':          return list;
            default:             return list.filter(a => a.status === this.currentFilter);
        }
    },

    // ---------- EVENT LISTENERS ----------
    setupEventListeners() {
        const filter = document.getElementById('delegations-status-filter');
        if (filter && !filter._wired) {
            filter._wired = true;
            filter.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.render();
            });
        }

        // Cycle status on click anywhere in the container
        const container = document.getElementById('delegations-container');
        if (container && !container._wired) {
            container._wired = true;
            container.addEventListener('click', async (e) => {
                const btn = e.target.closest('.delegation-status');
                if (!btn) return;
                await this.cycleStatus(btn.dataset.id, btn.dataset.status);
            });
        }
        const callout = document.getElementById('stuck-callout');
        if (callout && !callout._wired) {
            callout._wired = true;
            callout.addEventListener('click', async (e) => {
                const btn = e.target.closest('.delegation-status');
                if (!btn) return;
                await this.cycleStatus(btn.dataset.id, btn.dataset.status);
            });
        }
    },

    async cycleStatus(actionId, currentStatus) {
        const flow = { not_started: 'in_progress', in_progress: 'done', done: 'not_started' };
        const next = flow[currentStatus] || 'in_progress';
        try {
            await db.updateAction(actionId, { status: next });
            await this.refresh();
        } catch (e) {
            toast.show('Status update failed: ' + (e.message || e), 'error');
        }
    },

    escape(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }
};
