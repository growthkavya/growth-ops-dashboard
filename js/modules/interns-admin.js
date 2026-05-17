/**
 * Interns Admin Module
 *
 * Admin + member view for managing the intern team.
 * Surfaced as the "Interns" sidebar item (hidden for role=intern via CSS).
 *
 * Capabilities:
 *  - List active / onboarding / completed / archived interns as cards
 *  - Each card shows: name, supervisor, status, onboarding %, active tasks
 *  - "+ Add Intern": modal to create a new intern row (auto-clones onboarding template)
 *  - Per-card actions: Edit, mark Active, Complete, Archive
 *  - "Edit Onboarding Template": modal to add/edit/remove master checklist items
 */

const internsAdminModule = {
    interns: [],
    profiles: [],
    onboardingCounts: {},   // { intern_id: { done, total } }
    actionsCounts: {},      // { intern_id: { active, total } }
    currentFilter: 'active_pool',
    initialized: false,

    async init() {
        if (this.initialized) return;
        // Skip for intern role
        if (auth.currentProfile?.role === 'intern') return;
        this.initialized = true;
        await this.loadData();
        this.render();
        this.setupEventListeners();
    },

    async refresh() {
        await this.loadData();
        this.render();
    },

    async loadData() {
        try {
            const [interns, profiles, allActions, allOnb] = await Promise.all([
                db.getInterns(false),
                db.getProfiles(),
                db.getActions(),
                this.fetchAllOnboarding()
            ]);
            this.interns = interns || [];
            this.profiles = profiles || [];

            // Aggregate onboarding counts per intern
            this.onboardingCounts = {};
            (allOnb || []).forEach(item => {
                const c = this.onboardingCounts[item.intern_id] || { done: 0, total: 0 };
                c.total += 1;
                if (item.status === 'done') c.done += 1;
                this.onboardingCounts[item.intern_id] = c;
            });

            // Aggregate action counts per intern
            this.actionsCounts = {};
            (allActions || []).forEach(a => {
                if (!a.intern_id) return;
                const c = this.actionsCounts[a.intern_id] || { active: 0, total: 0 };
                c.total += 1;
                if (a.status !== 'done') c.active += 1;
                this.actionsCounts[a.intern_id] = c;
            });
        } catch (e) {
            console.error('Failed to load interns admin data:', e);
            this.interns = [];
        }
    },

    async fetchAllOnboarding() {
        // Pull all onboarding items in one go for the aggregate counts
        const { data, error } = await supabase
            .from('onboarding_items')
            .select('intern_id, status');
        if (error) { console.error(error); return []; }
        return data || [];
    },

    render() {
        const container = document.getElementById('interns-container');
        if (!container) return;

        const filtered = this.applyFilter(this.interns);

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No interns in this view</h3>
                    <p>Click "+ Add Intern" above to create one. It'll get a fresh copy of the master onboarding checklist.</p>
                </div>
            `;
            return;
        }

        const cards = filtered.map(i => this.renderCard(i)).join('');
        container.innerHTML = `<div class="interns-grid">${cards}</div>`;

        // Wire per-card buttons
        container.querySelectorAll('.intern-action-edit').forEach(btn => {
            btn.addEventListener('click', () => this.openEditModal(btn.dataset.id));
        });
        container.querySelectorAll('.intern-action-status').forEach(btn => {
            btn.addEventListener('click', () => this.changeStatus(btn.dataset.id, btn.dataset.status));
        });
    },

    applyFilter(list) {
        if (this.currentFilter === 'all') return list;
        if (this.currentFilter === 'active_pool') return list.filter(i => i.status === 'onboarding' || i.status === 'active');
        return list.filter(i => i.status === this.currentFilter);
    },

    renderCard(intern) {
        const supervisor = this.profiles.find(p => p.id === intern.supervisor_id);
        const supervisorName = supervisor?.full_name || 'Kavya + Riya';

        const onb = this.onboardingCounts[intern.id] || { done: 0, total: 0 };
        const onbPct = onb.total > 0 ? Math.round(100 * onb.done / onb.total) : 0;

        const tasks = this.actionsCounts[intern.id] || { active: 0, total: 0 };

        const tagsHtml = (intern.tags || []).map(t => `<span class="intern-tag">${this.escape(t)}</span>`).join('');

        const statusActions = {
            'onboarding': [['active', 'Mark Active'], ['archived', 'Archive']],
            'active':     [['completed', 'Mark Completed'], ['archived', 'Archive']],
            'completed':  [['archived', 'Archive']],
            'archived':   [['active', 'Reactivate']],
        }[intern.status] || [];

        return `
            <div class="intern-card status-${intern.status}">
                <h3>${this.escape(intern.name)}</h3>
                <span class="intern-card-status">${intern.status}</span>

                <div class="intern-meta">Supervisor: ${this.escape(supervisorName)}</div>
                <div class="intern-meta">
                    Started ${intern.start_date || '—'}
                    ${intern.end_date ? ` · Ends ${intern.end_date}` : ''}
                </div>
                ${tagsHtml ? `<div style="margin-top:0.5rem;">${tagsHtml}</div>` : ''}

                <div class="intern-progress">
                    <div class="progress-row">
                        <span>Onboarding</span>
                        <strong>${onb.done} / ${onb.total} (${onbPct}%)</strong>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-bar-fill ${intern.status}" style="width:${onbPct}%;"></div>
                    </div>

                    <div class="progress-row" style="margin-top:0.85rem;">
                        <span>Active tasks</span>
                        <strong>${tasks.active} active / ${tasks.total} total</strong>
                    </div>
                </div>

                <div class="intern-actions">
                    <button class="intern-action-edit" data-id="${intern.id}">Edit</button>
                    ${statusActions.map(([newStatus, label]) =>
                        `<button class="intern-action-status" data-id="${intern.id}" data-status="${newStatus}">${label}</button>`
                    ).join('')}
                </div>
            </div>
        `;
    },

    setupEventListeners() {
        const addBtn = document.getElementById('add-intern-btn');
        if (addBtn && !addBtn._wired) {
            addBtn._wired = true;
            addBtn.addEventListener('click', () => this.openAddModal());
        }
        const tplBtn = document.getElementById('edit-template-btn');
        if (tplBtn && !tplBtn._wired) {
            tplBtn._wired = true;
            tplBtn.addEventListener('click', () => this.openTemplateModal());
        }
        const statusFilter = document.getElementById('interns-status-filter');
        if (statusFilter && !statusFilter._wired) {
            statusFilter._wired = true;
            statusFilter.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.render();
            });
        }
    },

    // ---------- ADD INTERN ----------
    openAddModal() {
        const supervisorOptions = this.profiles
            .filter(p => p.role === 'admin' || p.role === 'member')
            .map(p => `<option value="${p.id}">${this.escape(p.full_name || p.email)}</option>`)
            .join('');

        // Find intern1 auth user id (shared inbox) — defaults intern.auth_user_id to it
        const intern1 = this.profiles.find(p => p.role === 'intern');
        const internAuthId = intern1?.id || '';

        const content = `
            <form id="add-intern-form" class="form">
                <div class="form-group">
                    <label>Full name *</label>
                    <input type="text" name="name" required placeholder="e.g. Anjali Sharma">
                </div>
                <div class="form-group">
                    <label>Intern code (short slug) *</label>
                    <input type="text" name="intern_code" required placeholder="e.g. anjali" pattern="[a-z0-9_]+" title="lowercase letters, digits, underscores">
                    <small>Used internally. Lowercase letters/numbers/underscores. Must be unique.</small>
                </div>
                <div class="form-group">
                    <label>Primary supervisor</label>
                    <select name="supervisor_id">
                        <option value="">Both Kavya + Riya (default)</option>
                        ${supervisorOptions}
                    </select>
                    <small>Both Kavya and Riya are notified on intern updates regardless of this setting.</small>
                </div>
                <div class="form-group">
                    <label>Start date</label>
                    <input type="date" name="start_date" value="${new Date().toISOString().slice(0,10)}">
                </div>
                <div class="form-group">
                    <label>Expected end date</label>
                    <input type="date" name="end_date">
                </div>
                <div class="form-group">
                    <label>Tags (comma-separated)</label>
                    <input type="text" name="tags" placeholder="e.g. Distribution Engine, Sir IG">
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <textarea name="notes" rows="3" placeholder="Context, focus areas, anything supervisors should know..."></textarea>
                </div>
            </form>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.75rem;">
                A copy of the master onboarding checklist (currently ${this.escape(String(this.templateCount() || 0))} items)
                will be cloned for this intern automatically.
            </p>
        `;

        modal.show({
            title: 'Add Intern',
            content,
            saveText: 'Create Intern',
            onSave: async () => {
                const form = document.getElementById('add-intern-form');
                const fd = new FormData(form);

                const body = {
                    name: fd.get('name'),
                    intern_code: fd.get('intern_code'),
                    auth_user_id: internAuthId,
                    supervisor_id: fd.get('supervisor_id') || null,
                    status: 'onboarding',
                    start_date: fd.get('start_date') || null,
                    end_date: fd.get('end_date') || null,
                    tags: fd.get('tags') ? fd.get('tags').split(',').map(s => s.trim()).filter(Boolean) : null,
                    notes: fd.get('notes') || null,
                };
                if (!body.name || !body.intern_code) {
                    toast.show('Name and intern code are required.', 'error');
                    return false;
                }

                try {
                    await db.createIntern(body);
                    toast.show('Intern added — onboarding checklist seeded.', 'success');
                    await this.refresh();
                    return true;
                } catch (err) {
                    console.error('createIntern failed:', err);
                    const msg = err?.message || String(err);
                    toast.show('Failed to add intern: ' + msg, 'error');
                    return false;
                }
            }
        });
    },

    templateCount() {
        // We loaded onboarding template count earlier via the cards aggregation, but
        // a fresh fetch is fine. Cache it later if needed.
        return this._tplCount || 7;  // fallback
    },

    // ---------- EDIT INTERN ----------
    openEditModal(internId) {
        const intern = this.interns.find(i => i.id === internId);
        if (!intern) return;

        const supervisorOptions = this.profiles
            .filter(p => p.role === 'admin' || p.role === 'member')
            .map(p => `<option value="${p.id}" ${intern.supervisor_id === p.id ? 'selected' : ''}>${this.escape(p.full_name || p.email)}</option>`)
            .join('');

        const content = `
            <form id="edit-intern-form" class="form">
                <div class="form-group">
                    <label>Full name *</label>
                    <input type="text" name="name" required value="${this.escape(intern.name)}">
                </div>
                <div class="form-group">
                    <label>Primary supervisor</label>
                    <select name="supervisor_id">
                        <option value="">Both Kavya + Riya (default)</option>
                        ${supervisorOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select name="status">
                        <option ${intern.status === 'onboarding' ? 'selected' : ''} value="onboarding">Onboarding</option>
                        <option ${intern.status === 'active' ? 'selected' : ''} value="active">Active</option>
                        <option ${intern.status === 'completed' ? 'selected' : ''} value="completed">Completed</option>
                        <option ${intern.status === 'archived' ? 'selected' : ''} value="archived">Archived</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Start date</label>
                    <input type="date" name="start_date" value="${intern.start_date || ''}">
                </div>
                <div class="form-group">
                    <label>End date</label>
                    <input type="date" name="end_date" value="${intern.end_date || ''}">
                </div>
                <div class="form-group">
                    <label>Tags (comma-separated)</label>
                    <input type="text" name="tags" value="${this.escape((intern.tags || []).join(', '))}">
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <textarea name="notes" rows="3">${this.escape(intern.notes || '')}</textarea>
                </div>
            </form>
        `;

        modal.show({
            title: `Edit ${intern.name}`,
            content,
            saveText: 'Save Changes',
            onSave: async () => {
                const form = document.getElementById('edit-intern-form');
                const fd = new FormData(form);
                const updates = {
                    name: fd.get('name'),
                    supervisor_id: fd.get('supervisor_id') || null,
                    status: fd.get('status'),
                    start_date: fd.get('start_date') || null,
                    end_date: fd.get('end_date') || null,
                    tags: fd.get('tags') ? fd.get('tags').split(',').map(s => s.trim()).filter(Boolean) : null,
                    notes: fd.get('notes') || null,
                };
                try {
                    await db.updateIntern(internId, updates);
                    toast.show('Intern updated.', 'success');
                    await this.refresh();
                    return true;
                } catch (err) {
                    toast.show('Update failed: ' + (err.message || err), 'error');
                    return false;
                }
            }
        });
    },

    async changeStatus(internId, newStatus) {
        const intern = this.interns.find(i => i.id === internId);
        if (!intern) return;
        if (!confirm(`Change ${intern.name}'s status from "${intern.status}" to "${newStatus}"?`)) return;
        try {
            const updates = { status: newStatus };
            if (newStatus === 'completed') updates.end_date = new Date().toISOString().slice(0, 10);
            await db.updateIntern(internId, updates);
            toast.show(`${intern.name} marked ${newStatus}.`, 'success');
            await this.refresh();
        } catch (e) {
            toast.show('Status change failed: ' + (e.message || e), 'error');
        }
    },

    // ---------- ONBOARDING TEMPLATE EDITOR ----------
    async openTemplateModal() {
        const { data: tmpls } = await supabase
            .from('onboarding_templates')
            .select('*')
            .order('sort_order');
        const items = tmpls || [];
        this._tplCount = items.length;

        const list = items.map(t => `
            <li data-id="${t.id}" style="padding:0.6rem 0.75rem;border:1px solid var(--border);border-radius:0.5rem;margin-bottom:0.5rem;display:flex;justify-content:space-between;align-items:start;gap:0.75rem;">
                <div style="flex:1;">
                    <strong>${this.escape(t.title)}</strong>
                    <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.2rem;">
                        ${this.escape(t.description || '')}
                    </div>
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem;">
                        ${this.escape(t.category || '')} · sort:${t.sort_order} · ${t.is_active ? 'active' : 'inactive'}
                    </div>
                </div>
                <button class="tpl-del" data-id="${t.id}" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:1.1rem;">×</button>
            </li>
        `).join('');

        const content = `
            <p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:1rem;">
                Master onboarding checklist. New interns get a fresh copy of these when added. Existing interns
                keep whatever was cloned at their creation time (so they don't lose progress).
            </p>
            <ul id="tpl-list" style="list-style:none;padding:0;margin:0;">${list}</ul>

            <hr style="margin:1rem 0;border:none;border-top:1px solid var(--border);">
            <h4 style="margin-bottom:0.5rem;">Add new item</h4>
            <form id="tpl-add-form" class="form">
                <div class="form-group">
                    <label>Title *</label>
                    <input type="text" name="title" required placeholder="e.g. Set up Loom account">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea name="description" rows="2" placeholder="What needs to happen, how to do it..."></textarea>
                </div>
                <div class="form-group">
                    <label>Category</label>
                    <select name="category">
                        <option value="context">context</option>
                        <option value="access">access</option>
                        <option value="tools">tools</option>
                        <option value="first_task">first_task</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Sort order</label>
                    <input type="number" name="sort_order" value="${(items.length + 1) * 10}">
                </div>
                <button type="button" class="btn btn-primary btn-small" id="tpl-add-btn">Add to template</button>
            </form>
        `;

        modal.show({
            title: 'Edit Onboarding Template',
            content,
            saveText: 'Done',
            onSave: async () => true   // changes are saved as they happen
        });

        // Wire delete buttons
        document.querySelectorAll('.tpl-del').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Remove this template item? Existing interns are not affected.')) return;
                await supabase.from('onboarding_templates').delete().eq('id', btn.dataset.id);
                btn.closest('li').remove();
            });
        });

        // Wire add-new
        document.getElementById('tpl-add-btn')?.addEventListener('click', async () => {
            const form = document.getElementById('tpl-add-form');
            const fd = new FormData(form);
            if (!fd.get('title')) { toast.show('Title required', 'error'); return; }
            const body = {
                title: fd.get('title'),
                description: fd.get('description') || null,
                category: fd.get('category'),
                sort_order: parseInt(fd.get('sort_order'), 10) || 100,
                is_active: true,
            };
            const { data, error } = await supabase
                .from('onboarding_templates')
                .insert(body)
                .select()
                .single();
            if (error) {
                toast.show('Failed to add: ' + error.message, 'error');
                return;
            }
            // Append to UI list
            const list = document.getElementById('tpl-list');
            const li = document.createElement('li');
            li.style.cssText = "padding:0.6rem 0.75rem;border:1px solid var(--border);border-radius:0.5rem;margin-bottom:0.5rem;display:flex;justify-content:space-between;align-items:start;gap:0.75rem;";
            li.dataset.id = data.id;
            li.innerHTML = `
                <div style="flex:1;">
                    <strong>${this.escape(data.title)}</strong>
                    <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.2rem;">${this.escape(data.description || '')}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem;">${this.escape(data.category)} · sort:${data.sort_order} · active</div>
                </div>
                <button class="tpl-del" data-id="${data.id}" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:1.1rem;">×</button>
            `;
            list.appendChild(li);
            li.querySelector('.tpl-del').addEventListener('click', async () => {
                if (!confirm('Remove this template item?')) return;
                await supabase.from('onboarding_templates').delete().eq('id', data.id);
                li.remove();
            });
            form.reset();
            toast.show('Template item added.', 'success');
        });
    },

    escape(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }
};
