/**
 * App shell: one store, one router.
 *
 * The old build had four modules each fetching `actions` independently,
 * which is why the same work appeared in three places and could drift
 * between them. Here there is one store. Views read from it and call
 * store.reload() after a write, so every view is looking at the same
 * rows at the same time.
 */

const store = {
    workItems: [],
    goals: [],
    kras: [],
    kpis: [],
    scores: [],
    documents: [],
    sheets: [],
    interns: [],
    profiles: [],
    activity: [],
    failed: [],

    async load() {
        this.failed = [];
        const results = await Promise.allSettled([
            data.workItems(), data.goals(), data.kras(), data.kpis(),
            data.scores(), data.documents(), data.sheets(),
            data.interns(), data.profiles(), data.activity(30)
        ]);

        const keys = ['workItems', 'goals', 'kras', 'kpis', 'scores',
                      'documents', 'sheets', 'interns', 'profiles', 'activity'];

        // One failing table shouldn't blank the whole dashboard — RLS can
        // legitimately deny a member access to a slice. Keep what loaded.
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') {
                this[keys[i]] = r.value;
            } else {
                const message = r.reason?.message || String(r.reason);
                console.error(`Could not load ${keys[i]}:`, message);
                this.failed.push({ table: keys[i], message });
            }
        });
    },

    /**
     * True when a load failed because a column this build expects isn't
     * there yet — i.e. migration_v3_cleanup.sql hasn't been run. Worth
     * distinguishing, because the symptom otherwise is empty screens
     * with no explanation.
     */
    needsMigration() {
        return this.failed.some(f =>
            /column .* does not exist|could not find a relationship|schema cache/i.test(f.message));
    },

    async reload() {
        await this.load();
        app.renderAll();
    },

    /* ---------- Derived views over the same rows ------------ */

    /** Work owned by, or handed out by, the signed-in person. */
    mine() {
        return this.workItems.filter(w =>
            w.owner_name === auth.key || w.assigned_by === auth.userId);
    },

    open(items = this.workItems) {
        return items.filter(w => w.status !== 'done');
    },

    /** Everything overdue or blocked, for whoever is looking. */
    needsAttention(items = this.mine()) {
        const today = dates.today();
        return items.filter(w =>
            w.status !== 'done' &&
            (w.status === 'blocked' || (w.due_date && w.due_date <= today)));
    },

    kraByCode(code) {
        return this.kras.find(k => k.kra_code === code);
    },

    kraById(id) {
        return this.kras.find(k => k.id === id);
    },

    /** Documents and sheets whose review is overdue. */
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

    views: {
        home:      () => homeView,
        goals:     () => goalsView,
        scorecard: () => scorecardView,
        work:      () => workView,
        documents: () => documentsView,
        people:    () => peopleView
    },

    async start() {
        if (!await auth.init()) {
            window.location.href = 'index.html';
            return;
        }

        this.paintIdentity();
        this.wireNav();
        this.wireTheme();
        this.wireSession();
        this.wireNotifications();

        await store.load();
        this.renderAll();
        this.warnIfIncomplete();

        document.getElementById('app').style.display = 'flex';
        this.go(location.hash.replace('#', '') || 'home', { replace: true });
    },

    /**
     * If part of the data didn't load, say so. Silent partial failure is
     * worse than an error: the dashboard looks fine and quietly under-reports.
     */
    warnIfIncomplete() {
        if (store.failed.length === 0) return;

        const banner = document.createElement('div');
        banner.className = 'notice';
        banner.innerHTML = store.needsMigration()
            ? `<strong>The database is a version behind.</strong>
               Run <code>supabase/migration_v3_cleanup.sql</code> in the Supabase SQL editor,
               then refresh. Until then some sections will be empty.`
            : `<strong>Some data didn't load.</strong>
               ${esc(store.failed.map(f => f.table).join(', '))} — refresh, and if it
               persists check the browser console.`;

        document.querySelector('.main').prepend(banner);
    },

    paintIdentity() {
        document.getElementById('user-name').textContent = auth.name;
        document.getElementById('user-role').textContent = VOCAB.role[auth.role] || auth.role;
        document.getElementById('rail-period').textContent =
            `Q${CONFIG.quarter} · ${CONFIG.quarterLabel}`;

        const mark = document.getElementById('user-mark');
        mark.textContent = personInitials(auth.name);
        mark.style.setProperty('--who-color', personColor(auth.key));

        document.body.classList.add('role-' + auth.role);
    },

    wireNav() {
        document.querySelectorAll('.rail-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.go(link.dataset.view);
                this.closeRail();
            });
        });

        window.addEventListener('popstate', () =>
            this.show(location.hash.replace('#', '') || 'home'));

        const toggle = document.getElementById('rail-toggle');
        const scrim  = document.getElementById('rail-scrim');
        toggle?.addEventListener('click', () => {
            document.getElementById('rail').classList.toggle('open');
            scrim.classList.toggle('show');
        });
        scrim?.addEventListener('click', () => this.closeRail());
    },

    closeRail() {
        document.getElementById('rail').classList.remove('open');
        document.getElementById('rail-scrim').classList.remove('show');
    },

    go(view, { replace = false } = {}) {
        if (!this.views[view]) view = 'home';
        history[replace ? 'replaceState' : 'pushState']({}, '', `#${view}`);
        this.show(view);
    },

    show(view) {
        if (!this.views[view]) view = 'home';
        this.view = view;

        document.querySelectorAll('.rail-link').forEach(l =>
            l.classList.toggle('active', l.dataset.view === view));
        document.querySelectorAll('.view').forEach(v =>
            v.classList.toggle('active', v.id === 'view-' + view));

        window.scrollTo({ top: 0 });
    },

    /** Every view re-renders from the store. Cheap — it's all in memory. */
    renderAll() {
        Object.values(this.views).forEach(get => {
            try {
                get().render();
            } catch (err) {
                console.error('Render failed:', err);
            }
        });
        this.paintCounts();
    },

    /**
     * Rail counts mean "things waiting on you" — never a total. If a tab
     * has no number, nothing there needs you.
     */
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
        set('work', store.open(store.mine()).length);
        set('documents', store.staleDocs().length, false);
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
            if (!panel.classList.contains('hidden')) {
                panel.classList.add('hidden');
                return;
            }

            const items = await data.notifications();
            panel.innerHTML = items.length === 0
                ? `<div class="empty" style="padding:var(--s5)">
                       <p class="empty-body">Nothing new. You're up to date.</p>
                   </div>`
                : items.map(n => `
                    <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
                        <div>${esc(n.message || n.event_type)}</div>
                        <div class="meta">${esc(n.intern_name ? n.intern_name + ' · ' : '')}${dates.ago(n.created_at)}</div>
                    </div>`).join('')
                  + `<div style="padding:var(--s3);text-align:center;border-top:1px solid var(--line)">
                        <button class="btn btn-quiet btn-sm" id="mark-all">Mark all as read</button>
                     </div>`;

            panel.classList.remove('hidden');

            panel.querySelectorAll('.notif-item').forEach(el => {
                el.addEventListener('click', async () => {
                    await data.markRead(el.dataset.id);
                    panel.classList.add('hidden');
                    refreshBadge();
                });
            });

            document.getElementById('mark-all')?.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                await data.markAllRead();
                panel.classList.add('hidden');
                refreshBadge();
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
                <p class="empty-body">Refresh the page. If it keeps happening, the
                   database connection is likely down — check with Kavya.</p>
            </div>`;
    });
});
