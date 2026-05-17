/**
 * Delegations Module — simplified
 *
 * Goal: assign tasks to people in 3 seconds, then track them with the
 * smallest possible UI surface.
 *
 *  - Quick-assign: ONE row. Pick person + type title + Enter. Done.
 *    KPI bucket auto-defaults to the most recent KPI used for that assignee
 *    (falls back to their first KPI). No KPI picker in the quick form.
 *    No due date in the quick form — Kavya/Riya add a date later if needed.
 *  - Per-row: status circle (click to cycle), title (click to edit),
 *    due date (click to set/change/clear), trash to delete.
 *  - No auto "overdue" red flagging. No "last updated X days ago".
 *  - No stuck callout.
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
        if (role === 'intern') return;
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
            this.actions = (actions || []).filter(a => a.assigned_by === me);
            this.interns = interns || [];
            this.profiles = profiles || [];
            this.kpis = await db.getKPIs();
        } catch (e) {
            console.error('Delegations loadData failed:', e);
        }
    },

    // ---------- QUICK ASSIGN ----------
    renderQuickAssignBar() {
        const role = auth.currentProfile?.role;
        const myKey = auth.currentProfile?.member_key;
        const myName = auth.currentProfile?.full_name || myKey;

        let assigneeOpts = [];
        if (role === 'admin') {
            assigneeOpts = [
                { value: 'kavya:', label: 'Kavya' },
                { value: 'riya:',  label: 'Riya' },
                ...this.interns.map(i => ({ value: `intern1:${i.id}`, label: `Intern · ${i.name}` }))
            ];
        } else if (role === 'member') {
            assigneeOpts = [
                { value: `${myKey}:`, label: `Myself` },
                ...this.interns.map(i => ({ value: `intern1:${i.id}`, label: `Intern · ${i.name}` }))
            ];
        }
        const optsHtml = assigneeOpts.map(o => `<option value="${o.value}">${this.escape(o.label)}</option>`).join('');

        const bar = document.getElementById('quick-assign-bar');
        if (!bar) return;
        bar.innerHTML = `
            <form id="quick-assign-form" class="quick-assign-form">
                <select name="assignee" class="quick-assignee" required>
                    <option value="">Assign to…</option>
                    ${optsHtml}
                </select>
                <input type="text" name="title" placeholder="Type a task and hit Enter…" required maxlength="200">
                <button type="submit" class="btn btn-primary btn-small">Assign</button>
            </form>
            <div class="quick-assign-help">
                Tip: due date is optional — add it later by clicking the date on a task row.
            </div>
        `;

        bar.querySelector('#quick-assign-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleQuickAssign(e.target);
        });
    },

    pickDefaultKpi(owner, internId) {
        // Most-recent assignment to this person → use the same KPI bucket
        const matches = this.actions
            .filter(a => a.owner_name === owner && (internId ? a.intern_id === internId : !a.intern_id))
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        if (matches.length) {
            const k = this.kpis.find(x => x.id === matches[0].kpi_id);
            if (k) return k;
        }
        // Otherwise the first KPI in that person's bucket
        return this.kpis.find(k => k.member === owner) || this.kpis[0];
    },

    async handleQuickAssign(form) {
        const fd = new FormData(form);
        const [owner, internId] = (fd.get('assignee') || ':').split(':');
        if (!owner || !fd.get('title')) {
            toast.show('Pick assignee and type a task.', 'error');
            return;
        }
        const kpi = this.pickDefaultKpi(owner, internId);
        if (!kpi) {
            toast.show('No KPI available for that assignee. Try a different person.', 'error');
            return;
        }

        const kraNum = (kpi.kpi_code || '_x_').split('_')[1] || 'x';
        const sameKra = this.actions.filter(a => (a.kpi_code || '').split('_')[1] === kraNum);
        const actionId = `${kraNum}.${500 + sameKra.length + 1}`;

        const newAction = {
            action_id: actionId,
            title: fd.get('title'),
            kpi_id: kpi.id,
            kpi_code: kpi.kpi_code,
            kra_id: kpi.kra_id,
            owner_name: owner,
            intern_id: internId || null,
            status: 'not_started',
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
            if (internId) {
                await db.notifySupervisors({
                    event_type: 'action_assigned',
                    entity_type: 'action', entity_id: created.id, entity_title: newAction.title,
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
        if (!container) return;

        const filtered = this.applyFilter(this.actions);

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Nothing assigned by you yet</h3>
                    <p>Use the bar above to assign a task. It takes 3 seconds.</p>
                </div>
            `;
            return;
        }

        // Group by assignee
        const groups = new Map();
        filtered.forEach(a => {
            const key = a.intern_id ? `intern:${a.intern_id}` : a.owner_name;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(a);
        });

        const groupHtml = Array.from(groups.entries()).map(([key, list]) => {
            const label = this.assigneeLabel(key, list[0]);
            const openCount = list.filter(a => a.status !== 'done').length;
            return `
                <div class="delegation-group">
                    <div class="delegation-group-header">
                        <h3>${this.escape(label)}</h3>
                        <span class="delegation-count">${list.length} task${list.length === 1 ? '' : 's'} · ${openCount} open</span>
                    </div>
                    <div class="delegation-list">
                        ${list.map(a => this.renderRow(a)).join('')}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = groupHtml;
    },

    renderRow(a) {
        const due = a.due_date
            ? new Date(a.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
            : '';
        const statusIcon = ({ not_started: '○', in_progress: '◐', done: '✓' })[a.status] || '○';

        return `
            <div class="delegation-row" data-id="${a.id}" data-status="${a.status}">
                <button class="delegation-status-btn status-${a.status}"
                        data-id="${a.id}" data-status="${a.status}" title="Click to cycle status">
                    ${statusIcon}
                </button>
                <div class="delegation-title-cell">
                    <span class="delegation-title-text"
                          data-id="${a.id}"
                          title="Click to edit"
                          tabindex="0"
                          ${a.status === 'done' ? 'style="text-decoration:line-through;color:var(--text-muted);"' : ''}>
                        ${this.escape(a.title)}
                    </span>
                </div>
                <span class="delegation-date-cell"
                      data-id="${a.id}"
                      data-due="${a.due_date || ''}"
                      title="${a.due_date ? 'Click to change date' : 'Click to set a date'}">
                    ${due || '— add date'}
                </span>
                <button class="delegation-delete" data-id="${a.id}" title="Delete">&times;</button>
            </div>
        `;
    },

    assigneeLabel(key) {
        if (key.startsWith('intern:')) {
            const intern = this.interns.find(i => i.id === key.slice('intern:'.length));
            return intern ? `Intern · ${intern.name}` : 'Intern · (deleted)';
        }
        if (key === 'kavya') return 'Kavya';
        if (key === 'riya')  return 'Riya';
        return key;
    },

    applyFilter(list) {
        switch (this.currentFilter) {
            case 'open':  return list.filter(a => a.status !== 'done');
            case 'all':   return list;
            default:      return list.filter(a => a.status === this.currentFilter);
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

        const container = document.getElementById('delegations-container');
        if (container && !container._wired) {
            container._wired = true;
            container.addEventListener('click', async (e) => {
                // Status cycle
                const statusBtn = e.target.closest('.delegation-status-btn');
                if (statusBtn) {
                    e.stopPropagation();
                    await this.cycleStatus(statusBtn.dataset.id, statusBtn.dataset.status);
                    return;
                }
                // Title edit
                const title = e.target.closest('.delegation-title-text');
                if (title && !title.isContentEditable) {
                    this.editTitle(title);
                    return;
                }
                // Date edit
                const dateCell = e.target.closest('.delegation-date-cell');
                if (dateCell) {
                    this.editDate(dateCell);
                    return;
                }
                // Delete
                const del = e.target.closest('.delegation-delete');
                if (del) {
                    e.stopPropagation();
                    await this.deleteTask(del.dataset.id);
                    return;
                }
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

    editTitle(span) {
        const original = span.textContent.trim();
        const actionId = span.dataset.id;
        span.setAttribute('contenteditable', 'true');
        span.classList.add('editing');
        span.focus();
        // Select all text for easy replacement
        const range = document.createRange();
        range.selectNodeContents(span);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const commit = async () => {
            span.removeAttribute('contenteditable');
            span.classList.remove('editing');
            const newText = span.textContent.trim();
            if (!newText) {
                span.textContent = original;
                return;
            }
            if (newText === original) return;
            try {
                await db.updateAction(actionId, { title: newText });
                toast.show('Saved.', 'success');
            } catch (e) {
                span.textContent = original;
                toast.show('Save failed: ' + (e.message || e), 'error');
            }
        };
        span.addEventListener('blur', commit, { once: true });
        span.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
            if (e.key === 'Escape') { span.textContent = original; span.blur(); }
        });
    },

    editDate(cell) {
        const actionId = cell.dataset.id;
        const current = cell.dataset.due || '';
        // Build a tiny inline picker
        const input = document.createElement('input');
        input.type = 'date';
        input.value = current;
        input.className = 'inline-date-input';
        const wrap = document.createElement('span');
        wrap.style.display = 'inline-flex';
        wrap.style.gap = '0.3rem';
        wrap.appendChild(input);

        const clearBtn = document.createElement('button');
        clearBtn.textContent = '×';
        clearBtn.title = 'Clear date';
        clearBtn.className = 'inline-date-clear';
        wrap.appendChild(clearBtn);

        cell.innerHTML = '';
        cell.appendChild(wrap);
        input.focus();

        const commit = async (newValue) => {
            try {
                await db.updateAction(actionId, { due_date: newValue || null });
                toast.show(newValue ? 'Date set.' : 'Date cleared.', 'success');
                await this.refresh();
            } catch (e) {
                toast.show('Save failed: ' + (e.message || e), 'error');
                await this.refresh();
            }
        };
        input.addEventListener('change', () => commit(input.value));
        input.addEventListener('blur', () => {
            // Only commit if value changed; otherwise re-render
            if (input.value !== current) commit(input.value);
            else this.render();
        });
        clearBtn.addEventListener('click', (e) => { e.stopPropagation(); commit(''); });
    },

    async deleteTask(actionId) {
        const a = this.actions.find(x => x.id === actionId);
        if (!a) return;
        if (!confirm(`Delete this task?\n\n"${a.title}"\n\nThis cannot be undone.`)) return;
        try {
            const { error } = await supabase.from('actions').delete().eq('id', actionId);
            if (error) throw error;
            toast.show('Deleted.', 'success');
            await this.refresh();
        } catch (e) {
            toast.show('Delete failed: ' + (e.message || e), 'error');
        }
    },

    escape(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }
};
