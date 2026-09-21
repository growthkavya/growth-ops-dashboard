/**
 * App shell: one store, one router, one place that handles clicks on
 * tasks and projects so every view gets the same behaviour for free.
 */

const store = {
    workItems: [],
    projects: [],
    goals: [],
    kras: [],
    kpis: [],
    scores: [],
    documents: [],
    sheets: [],
    interns: [],
    profiles: [],
    activity: [],
    attendance: [],
    failed: [],

    async load() {
        this.failed = [];
        const jobs = {
            workItems: data.workItems(), projects: data.projects(), goals: data.goals(),
            kras: data.kras(), kpis: data.kpis(), scores: data.scores(),
            documents: data.documents(), sheets: data.sheets(), interns: data.interns(),
            profiles: data.profiles(), activity: data.activity(30),
            attendance: data.attendance(dates.monthStart(), dates.today())
        };
        const keys = Object.keys(jobs);
        const results = await Promise.allSettled(Object.values(jobs));
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') this[keys[i]] = r.value;
            else {
                const message = r.reason?.message || String(r.reason);
                console.error(`Could not load ${keys[i]}:`, message);
                this.failed.push({ table: keys[i], message });
            }
        });
    },

    needsMigration() {
        return this.failed.some(f => /column .* does not exist|could not find a relationship|schema cache|relation .* does not exist/i.test(f.message));
    },

    async reload() {
        await this.load();
        app.renderAll();
    },

    /* ---------- Work ---------------------------------------- */

    isOpen(w) { return VOCAB.openStatuses.includes(w.status); },

    open(items = this.workItems) { return items.filter(w => this.isOpen(w)); },

    /** Work owned by, or handed out by, whoever is signed in. */
    mine() {
        return this.workItems.filter(w => auth.keys.includes(w.owner_name) || w.assigned_by === auth.userId);
    },

    /** What the signed-in person can see, for the pages that list work. */
    visibleWork() {
        return auth.isAdmin || auth.isLeader ? this.workItems : this.mine();
    },

    late(items = this.mine()) {
        const today = dates.today();
        return items.filter(w => this.isOpen(w) && w.due_date && w.due_date < today);
    },

    blocked(items = this.mine()) {
        return items.filter(w => w.status === 'blocked');
    },

    needsAttention(items = this.mine()) {
        return items.filter(w => this.isOpen(w) && (w.status === 'blocked' || (w.due_date && w.due_date < dates.today())));
    },

    /** Open work due in a date range, earliest first. */
    dueBetween(from, to, items = this.visibleWork()) {
        return items.filter(w => this.isOpen(w) && w.due_date && w.due_date >= from && w.due_date <= to)
            .sort((a, b) => a.due_date.localeCompare(b.due_date));
    },

    /** Work finished in a date range, newest first. */
    doneBetween(from, to, items = this.visibleWork()) {
        return items.filter(w => w.status === 'done' && w.completed_at &&
                dates.iso(w.completed_at) >= from && dates.iso(w.completed_at) <= to)
            .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
    },

    planTasks(tag = CONFIG.plan.tag) {
        return this.workItems.filter(w => w.plan_tag === tag);
    },

    /* ---------- Projects ------------------------------------ */

    projectBySlug(slug) { return this.projects.find(p => p.slug === slug); },
    projectById(id)     { return this.projects.find(p => p.id === id); },

    itemsOf(projectId) {
        return this.workItems.filter(w => w.project_id === projectId);
    },

    /** The last day something was finished in a project. */
    lastActivity(projectId) {
        return this.itemsOf(projectId)
            .filter(w => w.status === 'done' && w.completed_at)
            .map(w => dates.iso(w.completed_at))
            .sort().pop() || null;
    },

    /* ---------- Goals --------------------------------------- */

    /**
     * How far a goal has got: done tasks over tasks pointed at it. A
     * yearly goal averages the quarter goals under it. Only a goal with
     * neither uses the percentage somebody typed.
     */
    goalProgress(goal) {
        const linked = this.workItems.filter(w => w.goal_id === goal.id && (this.isOpen(w) || w.status === 'done'));
        if (linked.length) {
            const done = linked.filter(w => w.status === 'done').length;
            return { pct: Math.round((done / linked.length) * 100), from: 'work', done, total: linked.length };
        }
        const kids = this.goals.filter(g => g.parent_id === goal.id && !g.archived_at);
        if (kids.length) {
            const each = kids.map(k => this.goalProgress(k).pct);
            return { pct: Math.round(each.reduce((a, b) => a + b, 0) / kids.length), from: 'children', total: kids.length };
        }
        return { pct: goal.progress_pct || 0, from: 'manual' };
    },

    yearGoals() {
        return this.goals.filter(g => g.type === 'year' && g.scope === 'team')
            .sort((a, b) => (a.kras?.sort_order ?? 99) - (b.kras?.sort_order ?? 99) || (a.sort_order || 0) - (b.sort_order || 0));
    },

    quarterGoals() {
        return this.goals.filter(g => g.type === 'quarter' && g.period_year === CONFIG.plan.year && g.period_quarter === CONFIG.plan.quarter)
            .sort((a, b) => (a.kras?.sort_order ?? 99) - (b.kras?.sort_order ?? 99) || (a.sort_order || 0) - (b.sort_order || 0));
    },

    /* ---------- Scores -------------------------------------- */

    unscored(period, start, member = auth.key) {
        return this.kpis.filter(k => k.member === member &&
            !this.scores.some(s => s.kpi_id === k.id && s.period === period && s.period_start === start));
    },

    kraById(id) { return this.kras.find(k => k.id === id); },

    myDay() {
        return this.attendance.find(r => r.member_key === auth.key && r.work_date === dates.today());
    },

    staleDocs() {
        const isStale = (d) => {
            if (d.status === 'needs_review') return true;
            if (d.status === 'retired' || !d.review_every_days) return false;
            const since = dates.daysSince(d.last_reviewed_at);
            return since === null || since > d.review_every_days;
        };
        return [...this.documents, ...this.sheets].filter(isStale);
    }
};

const app = {
    view: 'home',
    arg: null,

    views: {
        home:      () => homeView,
        plan:      () => planView,
        scorecard: () => scorecardView,
        projects:  () => projectsView,
        work:      () => workView,
        calendar:  () => calendarView,
        team:      () => teamView,
        documents: () => documentsView
    },

    /** Interns work from their tasks and attendance. Leadership reads the plan, the scores and the projects. */
    hiddenFor: {
        intern: ['plan', 'scorecard', 'projects', 'documents'],
        member: [],
        admin:  [],
        leader: ['home', 'work', 'team', 'documents']
    },

    async start() {
        if (!await auth.init()) { window.location.href = 'index.html'; return; }
        await auth.settleSeat();

        this.paintIdentity();
        this.wireNav();
        this.wireGlobal();
        this.wireTheme();
        this.wireSession();
        this.wireNotifications();
        this.wireClock();
        this.wirePassword();
        this.wireSeatSwitch();

        await store.load();
        this.renderAll();
        this.warnIfIncomplete();

        document.getElementById('app').style.display = 'flex';
        const [view, arg] = this.parseHash();
        this.go(view || this.landing(), arg, { replace: true });
    },

    parseHash() {
        const h = location.hash.replace('#', '');
        const [view, ...rest] = h.split('/');
        return [view, rest.join('/') || null];
    },

    warnIfIncomplete() {
        if (store.failed.length === 0) return;
        const banner = document.createElement('div');
        banner.className = 'notice';
        banner.innerHTML = store.needsMigration()
            ? `<strong>The database is a version behind.</strong> Ask Kavya to run the latest migration; until then some sections will be empty.`
            : `<strong>Some data didn't load.</strong> ${esc(store.failed.map(f => f.table).join(', '))}. Refresh, and if it persists check the browser console.`;
        document.querySelector('.main').prepend(banner);
    },

    paintIdentity() {
        document.getElementById('user-name').textContent = auth.name;
        document.getElementById('user-role').textContent = auth.isShared
            ? `${VOCAB.role[auth.role] || auth.role} · shared login`
            : (auth.isLeader ? 'Leadership' : (CONFIG.team.find(m => m.key === auth.key)?.role || VOCAB.role[auth.role] || auth.role));
        document.getElementById('switch-seat')?.classList.toggle('hidden', !auth.isShared);
        document.getElementById('rail-period').textContent = dates.long(dates.today());

        const mark = document.getElementById('user-mark');
        mark.textContent = personInitials(auth.name);
        mark.style.setProperty('--who-color', personColor(auth.key));

        document.body.classList.add('role-' + auth.role);
        (this.hiddenFor[auth.audience] || []).forEach(v =>
            document.querySelector(`.rail-link[data-view="${v}"]`)?.classList.add('hidden'));
    },

    wireNav() {
        document.querySelectorAll('.rail-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.go(link.dataset.view);
                this.closeRail();
            });
        });
        window.addEventListener('popstate', () => {
            const [view, arg] = this.parseHash();
            this.show(view || this.landing(), arg);
        });
        const toggle = document.getElementById('rail-toggle');
        const scrim  = document.getElementById('rail-scrim');
        toggle?.addEventListener('click', () => {
            document.getElementById('rail').classList.toggle('open');
            scrim.classList.toggle('show');
        });
        scrim?.addEventListener('click', () => this.closeRail());
    },

    /**
     * Every task row and project link in the app is wired here, once.
     * Views only produce markup.
     */
    wireGlobal() {
        document.addEventListener('click', (e) => {
            const cycle = e.target.closest('[data-cycle]');
            if (cycle) { e.preventDefault(); workView.cycleStatus(cycle.dataset.cycle); return; }

            const task = e.target.closest('[data-task]');
            if (task) { e.preventDefault(); workView.openEditor(task.dataset.task); return; }

            const proj = e.target.closest('[data-project]');
            if (proj) { e.preventDefault(); this.go('projects', proj.dataset.project); return; }

            const goto = e.target.closest('[data-goto]');
            if (goto) { e.preventDefault(); this.go(goto.dataset.goto, goto.dataset.arg || null); return; }
        });
    },

    closeRail() {
        document.getElementById('rail').classList.remove('open');
        document.getElementById('rail-scrim').classList.remove('show');
    },

    go(view, arg = null, { replace = false } = {}) {
        if (!this.allowed(view)) { view = this.landing(); arg = null; }
        history[replace ? 'replaceState' : 'pushState']({}, '', `#${view}${arg ? '/' + arg : ''}`);
        this.show(view, arg);
    },

    allowed(view) {
        return !!this.views[view] && !(this.hiddenFor[auth.audience] || []).includes(view);
    },

    landing() {
        return auth.isLeader ? 'plan' : 'home';
    },

    show(view, arg = null) {
        if (!this.allowed(view)) { view = this.landing(); arg = null; }
        const changed = view !== this.view || arg !== this.arg;
        this.view = view;
        this.arg = arg;

        document.querySelectorAll('.rail-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));

        const target = this.views[view]();
        if (typeof target.setArg === 'function') target.setArg(arg);
        if (changed) { try { target.render(); } catch (err) { console.error('Render failed:', err); } }
        window.scrollTo({ top: 0 });
    },

    renderAll() {
        Object.values(this.views).forEach(get => {
            try { get().render(); } catch (err) { console.error('Render failed:', err); }
        });
        this.paintCounts();
        this.paintClock();
    },

    /** A number on a tab means something there is waiting on you. */
    paintCounts() {
        const set = (id, n, urgent = false) => {
            const el = document.getElementById('count-' + id);
            if (!el) return;
            el.textContent = n;
            el.classList.toggle('hidden', !n);
            el.classList.toggle('urgent', urgent);
        };
        const attention = store.needsAttention().length;
        set('home', attention, attention > 0);
        set('work', store.open(store.mine().filter(w => auth.keys.includes(w.owner_name))).length);
    },

    onRegister() {
        const me = CONFIG.team.find(m => m.key === auth.key);
        return me ? me.attendance !== false : false;
    },

    paintClock() {
        const host = document.getElementById('rail-clock');
        if (!host) return;
        if (!this.onRegister()) { host.innerHTML = ''; return; }
        const day = store.myDay();
        const workDay = CONFIG.office.workDays.includes(dates.weekday(dates.today()));

        if (!day?.check_in_at) {
            host.innerHTML = `<button class="btn btn-primary" data-clock="in">Check in</button>
                <div class="rail-clock-line">${workDay ? `Office opens ${esc(teamView.clock(CONFIG.office.start))}` : 'Not a working day'}</div>`;
        } else if (!day.check_out_at) {
            host.innerHTML = `<button class="btn" data-clock="out">Check out</button>
                <div class="rail-clock-line">In since <b>${esc(dates.time(day.check_in_at))}</b></div>`;
        } else {
            host.innerHTML = `<button class="btn btn-quiet btn-sm" data-clock="out" title="Checking out again moves your check-out to now">Update check-out</button>
                <div class="rail-clock-line"><b>${esc(dates.time(day.check_in_at))}</b> to <b>${esc(dates.time(day.check_out_at))}</b> · ${esc(dates.duration(day.check_in_at, day.check_out_at))}</div>`;
        }
    },

    wireClock() {
        document.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-clock]');
            if (!btn) return;
            const going = btn.dataset.clock;
            if (going === 'out' && store.myDay()?.check_out_at
                && !confirm('You have already checked out today. Move your check-out to now?')) return;
            btn.disabled = true;
            try {
                const row = going === 'in' ? await data.checkIn() : await data.checkOut();
                await data.log(going === 'in' ? 'checked in' : 'checked out', 'attendance', row?.id || null, auth.name);
                toast(going === 'in' ? `Checked in at ${dates.time(row.check_in_at)}` : `Checked out at ${dates.time(row.check_out_at)}`);
                await store.reload();
            } catch (err) {
                toast(/function .* does not exist|schema cache/i.test(err.message)
                    ? 'Attendance isn\'t switched on in the database yet. Ask Kavya.' : err.message, 'bad');
                btn.disabled = false;
            }
        });
    },

    wireSeatSwitch() {
        document.getElementById('switch-seat')?.addEventListener('click', async () => {
            await auth.switchSeat();
            this.paintIdentity();
            await store.reload();
            toast(`Signed in as ${auth.name}`);
        });
    },

    wirePassword() {
        document.getElementById('password')?.addEventListener('click', () => {
            ui.modal({
                title: 'Change your password',
                body: `${ui.field('pw1', 'New password', { type: 'password', required: true, hint: 'At least 8 characters.' })}
                       ${ui.field('pw2', 'Type it again', { type: 'password', required: true })}`,
                submitLabel: 'Change password',
                onSubmit: async (form) => {
                    const a = form.get('pw1') || '';
                    if (a.length < 8) throw new Error('Use at least 8 characters.');
                    if (a !== form.get('pw2')) throw new Error('The two passwords don\'t match.');
                    await data.changePassword(a);
                    toast('Password changed');
                }
            });
        });
    },

    wireTheme() {
        const saved = localStorage.getItem('go-theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        document.getElementById('theme').addEventListener('click', () => {
            const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('go-theme', next);
        });
    },

    wireSession() {
        document.getElementById('signout').addEventListener('click', async () => {
            if (!confirm('Sign out of Growth & Ops?')) return;
            await auth.signOut();
            window.location.href = 'index.html';
        });
    },

    wireNotifications() {
        const bell  = document.getElementById('bell');
        const panel = document.getElementById('notif-panel');
        const badge = document.getElementById('bell-count');
        const refreshBadge = async () => {
            const n = await data.unreadCount();
            badge.textContent = n;
            badge.classList.toggle('hidden', n === 0);
        };
        bell.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
            const items = await data.notifications();
            panel.innerHTML = items.length === 0
                ? `<div class="empty" style="padding:var(--s5)"><p class="empty-body">Nothing new.</p></div>`
                : items.map(n => `
                    <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
                        <div>${esc(n.message || n.event_type)}</div>
                        <div class="meta">${esc(n.intern_name ? n.intern_name + ' · ' : '')}${dates.ago(n.created_at)}</div>
                    </div>`).join('')
                  + `<div style="padding:var(--s3);text-align:center;border-top:1px solid var(--line)">
                        <button class="btn btn-quiet btn-sm" id="mark-all">Mark all as read</button></div>`;
            panel.classList.remove('hidden');
            panel.querySelectorAll('.notif-item').forEach(el => el.addEventListener('click', async () => {
                await data.markRead(el.dataset.id); panel.classList.add('hidden'); refreshBadge();
            }));
            document.getElementById('mark-all')?.addEventListener('click', async (ev) => {
                ev.stopPropagation(); await data.markAllRead(); panel.classList.add('hidden'); refreshBadge();
            });
        });
        document.addEventListener('click', () => panel.classList.add('hidden'));
        refreshBadge();
        setInterval(refreshBadge, 60000);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.start().catch(err => {
        console.error('Could not start:', err);
        document.body.innerHTML = `
            <div class="empty" style="padding:15vh var(--s5)">
                <p class="empty-title">Growth &amp; Ops didn't load</p>
                <p class="empty-body">Refresh the page. If it keeps happening, the database connection is likely down. Check with Kavya.</p>
            </div>`;
    });
});
