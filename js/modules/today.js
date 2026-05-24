/**
 * Today module — the daily landing.
 *
 * Layout (redesigned 24 May 2026 after first-pass UX feedback):
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │  HERO BAND (gradient)                                         │
 *   │  "Good morning, Kavya."  Mon · 24 May 2026                    │
 *   │  ┌── 4 KPI counters ──┐                                       │
 *   │  │ Done · Open · Blocked · Due today │                        │
 *   │  └─────────────────────────────────────                       │
 *   │  [ quick-win pill input ]                                     │
 *   └───────────────────────────────────────────────────────────────┘
 *
 *   ┌───────────────────────────────────────────┐  ┌────────────────┐
 *   │ FOCUS CARD (#1 priority, big)             │  │ THIS WEEK      │
 *   │ + percent strip + output + done button    │  │ done strip     │
 *   ├───────────────────────────────────────────┤  ├────────────────┤
 *   │ SECONDARY PRIORITIES (1-2 short cards)    │  │ ACTIVITY       │
 *   │                                           │  │ last 24h rail  │
 *   └───────────────────────────────────────────┘  └────────────────┘
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
        return auth.currentProfile?.member_key
            || (auth.currentProfile?.full_name || '').toLowerCase().split(' ')[0];
    },

    isMine(a) {
        if (auth.currentProfile?.role === 'admin') return true;
        const key = this.myKey();
        return a.owner_name === key || a.assigned_by === auth.currentUser?.id;
    },

    todayISO() {
        const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10);
    },
    daysAgoISO(n) {
        const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0,0,0,0);
        return d.toISOString().slice(0,10);
    },

    priorityScore(a) {
        const today = this.todayISO();
        const due = a.due_date;
        let s = 0;
        if (a.status === 'blocked')      s += 80;
        if (due && due < today)           s += 100;
        if (due && due === today)         s += 60;
        if (a.status === 'in_progress')   s += 20;
        if (a.kpi_code)                   s += 5;
        return s;
    },

    mineOpen() {
        return this.actions.filter(a => this.isMine(a) && a.status !== 'done');
    },

    pickPriorities() {
        return this.mineOpen()
            .map(a => ({...a, _score: this.priorityScore(a)}))
            .sort((x, y) => y._score - x._score || (x.due_date || '9').localeCompare(y.due_date || '9'));
    },

    counters() {
        const mine = this.actions.filter(a => this.isMine(a));
        const cutoff = this.daysAgoISO(7);
        const today = this.todayISO();
        return {
            doneWeek: mine.filter(a => a.status === 'done' && a.updated_at?.slice(0,10) >= cutoff).length,
            open:     mine.filter(a => a.status === 'in_progress' || a.status === 'not_started').length,
            blocked:  mine.filter(a => a.status === 'blocked').length,
            dueToday: mine.filter(a => a.status !== 'done' && a.due_date === today).length,
        };
    },

    weekStrip() {
        // last 7 days, an item per day with count of completed
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
            const iso = d.toISOString().slice(0,10);
            const count = this.actions.filter(a => this.isMine(a) && a.status === 'done' && a.updated_at?.slice(0,10) === iso).length;
            days.push({
                label: d.toLocaleDateString('en-IN', { weekday: 'short' })[0],
                date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                count,
                isToday: iso === this.todayISO(),
            });
        }
        return days;
    },

    pickRecentActivity() {
        const cutoff = new Date(Date.now() - 24*60*60*1000).toISOString();
        const role = auth.currentProfile?.role;
        const myId = auth.currentUser?.id;
        return this.activity
            .filter(e => e.timestamp > cutoff)
            .filter(e => role === 'admin' || e.user_id === myId)
            .slice(0, 6);
    },

    // Time spent this week, grouped by KPI code or project_tag.
    // Anything without either bucket falls under "Unassigned".
    timeBreakdown() {
        const cutoff = this.daysAgoISO(7);
        const buckets = new Map();   // label -> { hours, count, kind }
        for (const a of this.actions) {
            if (!this.isMine(a)) continue;
            if (!a.updated_at || a.updated_at.slice(0,10) < cutoff) continue;
            if (!a.hours_spent) continue;
            const label = a.project_tag
                ? `#${a.project_tag}`
                : (a.kpi_code || a.kpis?.kpi_code || 'Unassigned');
            const kind = a.project_tag ? 'tag' : (a.kpi_code ? 'kpi' : 'none');
            const b = buckets.get(label) || { hours: 0, count: 0, kind };
            b.hours += parseFloat(a.hours_spent);
            b.count += 1;
            buckets.set(label, b);
        }
        const items = [...buckets.entries()]
            .map(([label, b]) => ({ label, ...b }))
            .sort((x, y) => y.hours - x.hours);
        const total = items.reduce((s, i) => s + i.hours, 0);
        return { items, total };
    },

    // ----- rendering -------------------------------------------------------

    render() {
        const container = document.getElementById('today-container');
        if (!container) return;

        const priorities = this.pickPriorities();
        const focus = priorities[0];
        const others = priorities.slice(1, 3);
        const c = this.counters();
        const week = this.weekStrip();
        const activity = this.pickRecentActivity();
        const time = this.timeBreakdown();

        const name = (auth.currentProfile?.full_name || 'there').split(' ')[0];
        const greeting = this.greeting();
        const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

        container.innerHTML = `
            <div class="today-hero">
                <div class="today-hero-top">
                    <div>
                        <h1 class="today-greet">${greeting}, ${escapeHtml(name)}.</h1>
                        <p class="today-date">${todayLabel}</p>
                    </div>
                    <div class="today-counters">
                        ${this.renderCounter('Done · 7d', c.doneWeek, 'good')}
                        ${this.renderCounter('Open', c.open, 'neutral')}
                        ${this.renderCounter('Blocked', c.blocked, c.blocked > 0 ? 'bad' : 'neutral')}
                        ${this.renderCounter('Due today', c.dueToday, c.dueToday > 0 ? 'warn' : 'neutral')}
                    </div>
                </div>
                <form class="today-quickwin-bar" id="quickwin-form" autocomplete="off">
                    <span class="qw-plus">+</span>
                    <input id="quickwin-input" type="text" placeholder="Log a win you just shipped — Enter to save" autocomplete="off"/>
                    <button id="quickwin-btn" type="submit" class="qw-btn">Log</button>
                </form>
            </div>

            <div class="today-grid">
                <div class="today-main">
                    ${focus ? this.renderFocus(focus) : this.renderFocusEmpty()}
                    ${others.length > 0 ? `
                        <div class="today-others-head">
                            <h3>Up next</h3>
                            <a href="#actions" class="today-link">All actions →</a>
                        </div>
                        <div class="today-others">
                            ${others.map(a => this.renderOther(a)).join('')}
                        </div>
                    ` : ''}
                </div>

                <aside class="today-rail">
                    <section class="rail-card">
                        <div class="rail-head"><h3>This week</h3><span class="rail-meta">${c.doneWeek} done</span></div>
                        <div class="week-strip">
                            ${week.map(d => `
                                <div class="week-day ${d.isToday ? 'today' : ''} ${d.count > 0 ? 'has' : ''}" title="${d.date} · ${d.count} done">
                                    <div class="week-dot">${d.count > 0 ? d.count : ''}</div>
                                    <div class="week-label">${d.label}</div>
                                </div>
                            `).join('')}
                        </div>
                    </section>

                    <section class="rail-card">
                        <div class="rail-head"><h3>Where time went</h3><span class="rail-meta">${time.total > 0 ? `${time.total.toFixed(1)}h logged · 7d` : '7d'}</span></div>
                        ${time.items.length === 0
                            ? `<p class="rail-empty">No hours logged yet. Add <strong>hours spent</strong> on any Action to start tracking — works for KPI buckets <em>and</em> ad-hoc projects (e.g. samadhan-website).</p>`
                            : `<ul class="time-breakdown">
                                ${time.items.slice(0, 6).map(it => {
                                    const pctOfTotal = time.total > 0 ? (it.hours / time.total * 100) : 0;
                                    return `
                                        <li>
                                            <div class="tb-row">
                                                <span class="tb-label tb-${it.kind}" title="${it.count} action(s)">${escapeHtml(it.label)}</span>
                                                <span class="tb-hours">${it.hours.toFixed(1)}h</span>
                                            </div>
                                            <div class="tb-bar"><div class="tb-fill tb-fill-${it.kind}" style="width:${pctOfTotal}%"></div></div>
                                        </li>
                                    `;
                                }).join('')}
                            </ul>`}
                    </section>

                    <section class="rail-card">
                        <div class="rail-head"><h3>Recent</h3><span class="rail-meta">${auth.currentProfile?.role === 'admin' ? 'last 24h · team' : 'last 24h · me'}</span></div>
                        ${activity.length === 0
                            ? `<p class="rail-empty">Nothing in the last 24 hours.</p>`
                            : `<ul class="rail-activity">
                                ${activity.map(e => `
                                    <li>
                                        <span class="rail-dot rail-dot-${this.activityKind(e.action)}"></span>
                                        <div>
                                            <div class="rail-line">${escapeHtml(e.user_name || '—')} <span class="rail-verb">${escapeHtml(e.action)}</span> ${e.entity_title ? `<em>${escapeHtml(this.truncate(e.entity_title, 38))}</em>` : ''}</div>
                                            <div class="rail-ago">${this.fmtAgo(e.timestamp)}</div>
                                        </div>
                                    </li>
                                `).join('')}
                            </ul>`}
                    </section>
                </aside>
            </div>
        `;

        this.attachHandlers();
    },

    renderCounter(label, value, tone) {
        return `
            <div class="counter counter-${tone}">
                <div class="counter-val">${value}</div>
                <div class="counter-lbl">${label}</div>
            </div>
        `;
    },

    renderFocusEmpty() {
        return `
            <div class="focus-empty">
                <div class="focus-empty-mark">✓</div>
                <div>
                    <h2>Nothing on the board.</h2>
                    <p>No open priorities for you right now. Open the <a href="#actions">Actions</a> tab to pick something up, or log a win above.</p>
                </div>
            </div>
        `;
    },

    renderFocus(a) {
        const pct = Math.max(0, Math.min(100, a.percent_done || 0));
        const today = this.todayISO();
        const overdue = a.due_date && a.due_date < today;
        const dueToday = a.due_date === today;

        let urgency = '', urgencyClass = '';
        if (a.status === 'blocked')     { urgency = 'Blocked'; urgencyClass = 'urg-red'; }
        else if (overdue)               { urgency = 'Overdue'; urgencyClass = 'urg-red'; }
        else if (dueToday)              { urgency = 'Due today'; urgencyClass = 'urg-amber'; }
        else if (a.status === 'in_progress') { urgency = 'In progress'; urgencyClass = 'urg-blue'; }

        return `
            <article class="focus-card-v2" data-id="${a.id}">
                <header class="focus-head">
                    <div class="focus-tag">YOUR #1 RIGHT NOW</div>
                    ${urgency ? `<span class="urg ${urgencyClass}">${urgency}</span>` : ''}
                    ${a.kpi_code ? `<span class="urg urg-soft">${escapeHtml(a.kpi_code)}</span>` : ''}
                </header>
                <h2 class="focus-title">${escapeHtml(a.title)}</h2>
                ${a.description ? `<p class="focus-desc">${escapeHtml(a.description)}</p>` : ''}
                ${a.rm_remarks ? `<div class="focus-rm"><strong>Note from RM:</strong> ${escapeHtml(a.rm_remarks)}</div>` : ''}

                <div class="focus-progress">
                    <div class="focus-progress-bar"><div class="fill" style="width:${pct}%"></div></div>
                    <div class="focus-progress-chips">
                        ${[0, 25, 50, 75, 100].map(p => `
                            <button class="prog-chip ${pct === p ? 'sel' : ''}" data-id="${a.id}" data-pct="${p}">${p}%</button>
                        `).join('')}
                    </div>
                </div>

                <footer class="focus-footer">
                    <div class="focus-meta">
                        <span class="focus-due">${a.due_date ? `Due ${this.fmtDate(a.due_date)}` : 'No due date set'}</span>
                        ${a.output_link
                            ? `<a href="${escapeAttr(a.output_link)}" target="_blank" class="focus-output">Output ↗</a>`
                            : `<button class="focus-output focus-output-add" data-id="${a.id}">+ Output link</button>`}
                    </div>
                    <div class="focus-cta">
                        <button class="btn-ghost prio-toggle-block" data-id="${a.id}">
                            ${a.status === 'blocked' ? 'Unblock' : 'Block'}
                        </button>
                        <button class="btn-primary prio-mark-done" data-id="${a.id}">Mark done</button>
                    </div>
                </footer>
            </article>
        `;
    },

    renderOther(a) {
        const pct = Math.max(0, Math.min(100, a.percent_done || 0));
        const today = this.todayISO();
        const overdue = a.due_date && a.due_date < today;
        const dueToday = a.due_date === today;

        let urg = '', urgClass = '';
        if (a.status === 'blocked')     { urg = 'Blocked'; urgClass = 'urg-red'; }
        else if (overdue)               { urg = 'Overdue'; urgClass = 'urg-red'; }
        else if (dueToday)              { urg = 'Today'; urgClass = 'urg-amber'; }
        else if (a.status === 'in_progress') { urg = 'In flight'; urgClass = 'urg-blue'; }

        return `
            <article class="other-card" data-id="${a.id}">
                <div class="other-head">
                    ${urg ? `<span class="urg ${urgClass}">${urg}</span>` : ''}
                    <span class="other-due">${a.due_date ? this.fmtDate(a.due_date) : '—'}</span>
                </div>
                <div class="other-title">${escapeHtml(a.title)}</div>
                <div class="other-foot">
                    <div class="other-bar"><div class="fill" style="width:${pct}%"></div></div>
                    <span class="other-pct">${pct}%</span>
                    <button class="other-done prio-mark-done" data-id="${a.id}" title="Mark done">✓</button>
                </div>
            </article>
        `;
    },

    // ----- handlers --------------------------------------------------------

    attachHandlers() {
        const qwForm = document.getElementById('quickwin-form');
        const qwInp  = document.getElementById('quickwin-input');
        if (qwForm && qwInp) {
            qwForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const title = qwInp.value.trim();
                if (!title) return;
                const btn = qwForm.querySelector('.qw-btn');
                btn.disabled = true;
                try {
                    const created = await db.createAction({
                        action_id: `qw-${Date.now()}`,
                        title,
                        owner_name: this.myKey(),
                        status: 'done',
                        percent_done: 100,
                        due_date: this.todayISO(),
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
                    toast.success('Win logged');
                    await this.refresh();
                } catch (err) {
                    console.error(err);
                    toast.error(err.message || 'Failed to log win');
                } finally {
                    btn.disabled = false;
                }
            });
        }

        // Progress chips (0/25/50/75/100)
        document.querySelectorAll('.prog-chip').forEach(chip => {
            chip.addEventListener('click', async () => {
                const id = chip.dataset.id;
                const pct = parseInt(chip.dataset.pct, 10);
                try {
                    const updates = { percent_done: pct, updated_at: new Date().toISOString() };
                    if (pct === 100) updates.status = 'done';
                    else if (pct > 0) {
                        const a = this.actions.find(x => x.id === id);
                        if (a && a.status === 'not_started') updates.status = 'in_progress';
                    } else {
                        const a = this.actions.find(x => x.id === id);
                        if (a && a.status === 'in_progress') updates.status = 'in_progress';
                    }
                    await db.updateAction(id, updates);
                    if (pct === 100) toast.success('Marked done');
                    await this.refresh();
                } catch (e) { toast.error(e.message || 'Failed to save'); }
            });
        });

        // Mark done buttons (focus card + other cards)
        document.querySelectorAll('.prio-mark-done').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                btn.disabled = true;
                try {
                    await db.updateAction(id, { status: 'done', percent_done: 100, updated_at: new Date().toISOString() });
                    const a = this.actions.find(x => x.id === id);
                    await db.logActivity(auth.currentUser.id, auth.currentProfile?.full_name || 'Unknown', 'completed', 'action', id, a?.title || '');
                    toast.success('Marked done');
                    await this.refresh();
                } catch (e) { toast.error(e.message || 'Failed'); btn.disabled = false; }
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
                    await db.logActivity(auth.currentUser.id, auth.currentProfile?.full_name || 'Unknown', newStatus === 'blocked' ? 'blocked' : 'unblocked', 'action', id, a.title);
                    toast.success(newStatus === 'blocked' ? 'Marked blocked' : 'Unblocked');
                    await this.refresh();
                } catch (e) { toast.error(e.message || 'Failed'); btn.disabled = false; }
            });
        });

        // Inline output-link add
        document.querySelectorAll('.focus-output-add').forEach(btn => {
            btn.addEventListener('click', async () => {
                const url = prompt('Paste the output link (Google Doc, Sheet, etc.):');
                if (!url) return;
                try {
                    await db.updateAction(btn.dataset.id, { output_link: url.trim(), updated_at: new Date().toISOString() });
                    toast.success('Output link saved');
                    await this.refresh();
                } catch (e) { toast.error(e.message || 'Failed'); }
            });
        });
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

    activityKind(action) {
        const a = (action || '').toLowerCase();
        if (a.includes('done') || a.includes('completed') || a.includes('win')) return 'good';
        if (a.includes('block')) return 'bad';
        if (a.includes('delete')) return 'muted';
        return 'neutral';
    },

    truncate(s, n) {
        s = String(s || '');
        return s.length > n ? s.slice(0, n - 1) + '…' : s;
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

// Escape helpers
if (typeof escapeHtml === 'undefined') {
    window.escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
if (typeof escapeAttr === 'undefined') {
    window.escapeAttr = (s) => String(s ?? '').replace(/"/g, '&quot;');
}
