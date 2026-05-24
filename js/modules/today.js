/**
 * Today module — the new daily landing page.
 *
 * Replaces the old "Dashboard" overview cards. Shows the three things
 * a user actually needs to open the workspace for:
 *   1. Top-3 priorities (overdue + due today + focus-KPI-linked)
 *      with inline percent-done sliders and a quick "mark done" button
 *   2. Quick win log — single input that creates an Action with
 *      status=done + percent_done=100 in one click (Kavya's "log a quick
 *      win" pattern, ported from the intern gl_task table)
 *   3. This week so far — auto-generated digest of Actions completed
 *      in the last 7 days, replaces the old standalone Weekly Log
 *   4. Recent activity (last 24h, scoped to my team) — replaces the
 *      old standalone Activity tab
 */

const todayModule = {
    actions: [],
    activity: [],
    initialized: false,

    async init() {
        if (this.initialized) return;
        this.initialized = true;
        await this.refresh();
    },

    async refresh() {
        try {
            const [actions, activity] = await Promise.all([
                db.getActions(),
                db.getActivityLog(40)
            ]);
            this.actions = actions || [];
            this.activity = activity || [];
            this.render();
        } catch (e) {
            console.error('Today refresh failed:', e);
            toast.error('Failed to load Today view');
        }
    },

    // ----- helpers ---------------------------------------------------------

    myKey() {
        // member_key on profile — same field RBAC policies use
        return auth.currentProfile?.member_key
            || (auth.currentProfile?.full_name || '').toLowerCase().split(' ')[0];
    },

    isMine(a) {
        if (auth.currentProfile?.role === 'admin') return true;
        const key = this.myKey();
        return a.owner_name === key || a.assigned_by === auth.currentUser?.id;
    },

    todayISO() {
        const d = new Date();
        d.setHours(0,0,0,0);
        return d.toISOString().slice(0,10);
    },

    daysAgoISO(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        d.setHours(0,0,0,0);
        return d.toISOString().slice(0,10);
    },

    priorityScore(a) {
        // Higher score = more urgent for the Today list
        const today = this.todayISO();
        const due = a.due_date;
        let score = 0;
        if (a.status === 'blocked')      score += 80;   // blocked = needs attention
        if (due && due < today)           score += 100;  // overdue
        if (due && due === today)         score += 60;   // due today
        if (a.status === 'in_progress')   score += 20;
        if (a.kpi_code)                   score += 5;
        return score;
    },

    pickTop3() {
        const mine = this.actions.filter(a => this.isMine(a) && a.status !== 'done');
        return mine
            .map(a => ({...a, _score: this.priorityScore(a)}))
            .sort((x, y) => y._score - x._score || (x.due_date || '9') .localeCompare(y.due_date || '9'))
            .slice(0, 3);
    },

    pickDoneThisWeek() {
        const cutoff = this.daysAgoISO(7);
        return this.actions
            .filter(a => this.isMine(a) && a.status === 'done' && a.updated_at && a.updated_at.slice(0,10) >= cutoff)
            .sort((x, y) => (y.updated_at || '').localeCompare(x.updated_at || ''));
    },

    pickRecentActivity() {
        const cutoff = new Date(Date.now() - 24*60*60*1000).toISOString();
        // scope: my team = admin sees everyone, members see only their own actions
        const role = auth.currentProfile?.role;
        const myId = auth.currentUser?.id;
        return this.activity
            .filter(e => e.timestamp > cutoff)
            .filter(e => role === 'admin' || e.user_id === myId)
            .slice(0, 8);
    },

    // ----- rendering -------------------------------------------------------

    render() {
        const container = document.getElementById('today-container');
        if (!container) return;

        const top3 = this.pickTop3();
        const done = this.pickDoneThisWeek();
        const activity = this.pickRecentActivity();

        const name = (auth.currentProfile?.full_name || 'there').split(' ')[0];
        const greeting = this.greeting();

        container.innerHTML = `
            <div class="today-head">
                <div>
                    <h2 style="margin:0;">${greeting}, ${escapeHtml(name)}.</h2>
                    <p style="margin:.35rem 0 0;color:var(--text-muted,#64748b);font-size:.92rem;">
                        ${top3.length === 0
                            ? 'No open priorities for you right now. Nice.'
                            : `${top3.length} ${top3.length === 1 ? 'thing' : 'things'} to push today.`}
                    </p>
                </div>
                <div class="today-quickwin">
                    <input id="quickwin-input" type="text" placeholder="Log a quick win you just shipped…" />
                    <button id="quickwin-btn" class="btn btn-primary btn-sm">Log win</button>
                </div>
            </div>

            <section class="today-section">
                <div class="today-section-head">
                    <h3>Today's priorities</h3>
                    <a href="#actions" class="link-muted">See all actions →</a>
                </div>
                <div class="today-priorities">
                    ${top3.length === 0
                        ? `<div class="empty-state">Nothing overdue or due today. Pick something from <a href="#actions">Actions</a> to push.</div>`
                        : top3.map(a => this.renderPriorityCard(a)).join('')}
                </div>
            </section>

            <div class="today-twocol">
                <section class="today-section">
                    <div class="today-section-head">
                        <h3>This week so far</h3>
                        <span class="badge badge-soft">${done.length} done</span>
                    </div>
                    ${done.length === 0
                        ? `<div class="empty-state">No Actions marked done in the last 7 days yet.</div>`
                        : `<ul class="today-done-list">${done.slice(0,8).map(a => `
                            <li>
                                <span class="check">&#10003;</span>
                                <div>
                                    <div class="title">${escapeHtml(a.title)}</div>
                                    <div class="meta">${this.fmtDate(a.updated_at)}${a.output_link ? ` · <a href="${escapeAttr(a.output_link)}" target="_blank" class="link-muted">output ↗</a>` : ''}</div>
                                </div>
                            </li>
                        `).join('')}</ul>`}
                </section>

                <section class="today-section">
                    <div class="today-section-head">
                        <h3>Recent activity</h3>
                        <span class="badge badge-soft">Last 24h${auth.currentProfile?.role !== 'admin' ? ' · me' : ''}</span>
                    </div>
                    ${activity.length === 0
                        ? `<div class="empty-state">Nothing in the last 24 hours.</div>`
                        : `<ul class="today-activity-list">${activity.map(e => `
                            <li>
                                <div class="dot dot-${e.action}"></div>
                                <div>
                                    <div class="line">
                                        <strong>${escapeHtml(e.user_name || '—')}</strong>
                                        ${escapeHtml(e.action)}
                                        ${escapeHtml(e.entity_type)}
                                        ${e.entity_title ? `<em>"${escapeHtml(e.entity_title)}"</em>` : ''}
                                    </div>
                                    <div class="meta">${this.fmtAgo(e.timestamp)}</div>
                                </div>
                            </li>
                        `).join('')}</ul>`}
                </section>
            </div>
        `;

        this.attachHandlers();
    },

    renderPriorityCard(a) {
        const pct = Math.max(0, Math.min(100, a.percent_done || 0));
        const overdue = a.due_date && a.due_date < this.todayISO();
        const dueToday = a.due_date === this.todayISO();
        const tagHtml = a.status === 'blocked'
            ? '<span class="pill pill-red">Blocked</span>'
            : overdue ? '<span class="pill pill-red">Overdue</span>'
            : dueToday ? '<span class="pill pill-amber">Due today</span>'
            : a.status === 'in_progress' ? '<span class="pill pill-blue">In progress</span>'
            : '';

        return `
            <article class="prio-card" data-id="${a.id}">
                <header>
                    <div class="prio-head">
                        ${tagHtml}
                        ${a.kpi_code ? `<span class="pill pill-soft">${escapeHtml(a.kpi_code)}</span>` : ''}
                        ${a.kras?.short_name ? `<span class="pill pill-soft">${escapeHtml(a.kras.short_name)}</span>` : ''}
                    </div>
                    <h4>${escapeHtml(a.title)}</h4>
                    ${a.description ? `<p>${escapeHtml(a.description)}</p>` : ''}
                </header>
                <div class="prio-progress">
                    <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
                    <input type="range" min="0" max="100" step="5" value="${pct}" class="prio-slider" data-id="${a.id}" aria-label="Percent done"/>
                    <span class="prio-pct">${pct}%</span>
                </div>
                <footer class="prio-footer">
                    <div class="prio-due">${a.due_date ? `Due ${this.fmtDate(a.due_date)}` : 'No due date'}</div>
                    <div class="prio-actions">
                        ${a.output_link
                            ? `<a href="${escapeAttr(a.output_link)}" target="_blank" class="btn-link">Output ↗</a>`
                            : `<button class="btn-link prio-add-output" data-id="${a.id}">+ Output link</button>`}
                        <button class="btn-link prio-toggle-block" data-id="${a.id}">${a.status === 'blocked' ? 'Unblock' : 'Block'}</button>
                        <button class="btn btn-sm btn-primary prio-mark-done" data-id="${a.id}">Mark done</button>
                    </div>
                </footer>
                ${a.rm_remarks ? `<div class="prio-rm-remarks"><strong>Note from Kavya:</strong> ${escapeHtml(a.rm_remarks)}</div>` : ''}
            </article>
        `;
    },

    // ----- handlers --------------------------------------------------------

    attachHandlers() {
        // Quick win
        const qwBtn = document.getElementById('quickwin-btn');
        const qwInp = document.getElementById('quickwin-input');
        if (qwBtn && qwInp) {
            const log = async () => {
                const title = qwInp.value.trim();
                if (!title) return;
                qwBtn.disabled = true;
                try {
                    const today = this.todayISO();
                    const created = await db.createAction({
                        action_id: `qw-${Date.now()}`,
                        title,
                        owner_name: this.myKey(),
                        status: 'done',
                        percent_done: 100,
                        due_date: today,
                        layer: 3,
                        assigned_by: auth.currentUser?.id,
                        assigned_by_name: auth.currentProfile?.full_name,
                        assigned_at: new Date().toISOString()
                    });
                    await db.logActivity(
                        auth.currentUser.id,
                        auth.currentProfile?.full_name || 'Unknown',
                        'logged win',
                        'action',
                        created.id,
                        title
                    );
                    qwInp.value = '';
                    toast.success('Quick win logged');
                    await this.refresh();
                } catch (e) {
                    console.error(e);
                    toast.error(e.message || 'Failed to log win');
                } finally {
                    qwBtn.disabled = false;
                }
            };
            qwBtn.addEventListener('click', log);
            qwInp.addEventListener('keydown', e => { if (e.key === 'Enter') log(); });
        }

        // Percent-done sliders
        document.querySelectorAll('.prio-slider').forEach(slider => {
            let timer = null;
            slider.addEventListener('input', e => {
                const card = e.target.closest('.prio-card');
                const pct = parseInt(e.target.value, 10);
                if (card) {
                    card.querySelector('.fill').style.width = pct + '%';
                    card.querySelector('.prio-pct').textContent = pct + '%';
                }
                clearTimeout(timer);
                timer = setTimeout(() => this.savePercent(slider.dataset.id, pct), 600);
            });
        });

        // Mark done
        document.querySelectorAll('.prio-mark-done').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                btn.disabled = true;
                try {
                    await db.updateAction(id, { status: 'done', percent_done: 100, updated_at: new Date().toISOString() });
                    const a = this.actions.find(x => x.id === id);
                    await db.logActivity(
                        auth.currentUser.id,
                        auth.currentProfile?.full_name || 'Unknown',
                        'completed',
                        'action',
                        id,
                        a?.title || ''
                    );
                    toast.success('Marked done');
                    await this.refresh();
                } catch (e) {
                    console.error(e);
                    toast.error(e.message || 'Failed to update');
                    btn.disabled = false;
                }
            });
        });

        // Block / unblock
        document.querySelectorAll('.prio-toggle-block').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const a = this.actions.find(x => x.id === id);
                if (!a) return;
                const newStatus = a.status === 'blocked' ? 'in_progress' : 'blocked';
                btn.disabled = true;
                try {
                    await db.updateAction(id, { status: newStatus, updated_at: new Date().toISOString() });
                    await db.logActivity(
                        auth.currentUser.id,
                        auth.currentProfile?.full_name || 'Unknown',
                        newStatus === 'blocked' ? 'blocked' : 'unblocked',
                        'action',
                        id,
                        a.title
                    );
                    toast.success(newStatus === 'blocked' ? 'Marked blocked' : 'Unblocked');
                    await this.refresh();
                } catch (e) {
                    console.error(e);
                    toast.error(e.message || 'Failed to update');
                    btn.disabled = false;
                }
            });
        });

        // Add output link inline
        document.querySelectorAll('.prio-add-output').forEach(btn => {
            btn.addEventListener('click', async () => {
                const url = prompt('Paste the output link (Google Doc, Sheet, etc.):');
                if (!url) return;
                const id = btn.dataset.id;
                try {
                    await db.updateAction(id, { output_link: url.trim(), updated_at: new Date().toISOString() });
                    toast.success('Output link added');
                    await this.refresh();
                } catch (e) {
                    toast.error(e.message || 'Failed to add link');
                }
            });
        });
    },

    async savePercent(id, pct) {
        try {
            // If user dragged to 100, also flip status to done
            const updates = { percent_done: pct, updated_at: new Date().toISOString() };
            if (pct === 100) updates.status = 'done';
            else if (pct > 0) {
                const a = this.actions.find(x => x.id === id);
                if (a && a.status === 'not_started') updates.status = 'in_progress';
            }
            await db.updateAction(id, updates);
        } catch (e) {
            console.error(e);
            toast.error('Failed to save progress');
        }
    },

    // ----- format helpers --------------------------------------------------

    greeting() {
        const h = new Date().getHours();
        if (h < 5)  return 'Up late';
        if (h < 12) return 'Good morning';
        if (h < 17) return 'Afternoon';
        if (h < 21) return 'Evening';
        return 'Late';
    },

    fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    },

    fmtAgo(iso) {
        if (!iso) return '';
        const diff = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return this.fmtDate(iso);
    }
};

// Small escape helpers — only define if not already global
if (typeof escapeHtml === 'undefined') {
    window.escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
if (typeof escapeAttr === 'undefined') {
    window.escapeAttr = (s) => String(s ?? '').replace(/"/g, '&quot;');
}
