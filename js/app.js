/**
 * Growth & Ops Workspace - Main App
 */

const app = {
    currentSection: 'dashboard',
    initialized: false,

    async init() {
        // Check authentication
        const isAuthenticated = await auth.init();

        if (!isAuthenticated) {
            // Redirect to login
            window.location.href = 'index.html';
            return;
        }

        // Hide loading, show app
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';

        // Initialize UI
        this.initUserInfo();
        this.initNavigation();
        this.initTheme();
        this.initLogout();

        // Initialize all modules
        await this.initModules();

        this.initialized = true;

        // Check URL hash
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            this.navigateTo(hash);
        }
    },

    initUserInfo() {
        const nameEl = document.getElementById('current-user-name');
        const roleEl = document.getElementById('current-user-role');
        const role = auth.currentProfile?.role || 'member';

        if (nameEl) {
            nameEl.textContent = auth.currentProfile?.full_name || auth.currentUser?.email || '-';
        }
        if (roleEl) {
            roleEl.innerHTML = `<span class="role-badge ${role}">${role}</span>`;
        }

        // Tag the body so CSS can gate UI elements by role
        document.body.classList.remove('role-admin', 'role-member', 'role-intern');
        document.body.classList.add('role-' + role);

        // Mount notification bell next to user info (admins + members only)
        if (role !== 'intern') {
            this.mountNotificationBell();
        }
    },

    mountNotificationBell() {
        const footer = document.querySelector('.sidebar-footer .user-info');
        if (!footer || document.getElementById('notif-bell')) return;
        const bell = document.createElement('div');
        bell.style.cssText = 'margin-top:0.5rem;position:relative;display:inline-block;';
        bell.innerHTML = `
            <div class="notif-bell" id="notif-bell" title="Notifications">
                <span class="notif-icon">🔔</span>
                <span class="notif-count hidden" id="notif-count">0</span>
            </div>
            <div class="notif-dropdown hidden" id="notif-dropdown"></div>
        `;
        footer.appendChild(bell);

        document.getElementById('notif-bell').addEventListener('click', async (e) => {
            e.stopPropagation();
            const dd = document.getElementById('notif-dropdown');
            const isOpen = !dd.classList.contains('hidden');
            if (isOpen) { dd.classList.add('hidden'); return; }
            // Load notifications
            const notifs = await db.getNotifications(20);
            dd.innerHTML = notifs.length === 0
                ? `<div style="padding:1.5rem;text-align:center;color:var(--text-muted);">No notifications yet.</div>`
                : notifs.map(n => `
                    <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-link="${n.link || '#dashboard'}">
                        <div>${this.escapeHtml(n.message || n.event_type)}</div>
                        <div class="notif-meta">
                            ${n.intern_name ? this.escapeHtml(n.intern_name) + ' · ' : ''}
                            ${new Date(n.created_at).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'numeric', minute:'2-digit' })}
                        </div>
                    </div>
                  `).join('')
                  + `<div style="padding:0.6rem;text-align:center;border-top:1px solid var(--border);">
                       <a id="notif-mark-all" style="cursor:pointer;font-size:0.85rem;">Mark all as read</a>
                     </div>`;
            dd.classList.remove('hidden');

            dd.querySelectorAll('.notif-item').forEach(el => {
                el.addEventListener('click', async () => {
                    await db.markNotificationRead(el.dataset.id);
                    const link = el.dataset.link;
                    if (link) window.location.hash = link;
                    dd.classList.add('hidden');
                    this.refreshNotifCount();
                });
            });
            document.getElementById('notif-mark-all')?.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                await db.markAllNotificationsRead();
                dd.classList.add('hidden');
                this.refreshNotifCount();
            });
        });

        // Close dropdown on outside click
        document.addEventListener('click', () => {
            document.getElementById('notif-dropdown')?.classList.add('hidden');
        });
    },

    async refreshNotifCount() {
        const count = await db.getUnreadNotificationCount();
        const badge = document.getElementById('notif-count');
        if (!badge) return;
        if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
        else { badge.classList.add('hidden'); }
    },

    escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    },

    initNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.navigateTo(section);
            });
        });

        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            const hash = window.location.hash.replace('#', '');
            if (hash) {
                this.showSection(hash);
            }
        });
    },

    navigateTo(section) {
        // Update URL
        window.history.pushState({}, '', `#${section}`);

        // Show section
        this.showSection(section);
    },

    showSection(section) {
        // Update nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.section === section);
        });

        // Update sections
        document.querySelectorAll('.section').forEach(s => {
            s.classList.toggle('active', s.id === section);
        });

        this.currentSection = section;
    },

    initTheme() {
        const toggle = document.getElementById('theme-toggle');
        const savedTheme = localStorage.getItem('workspace-theme') || 'light';

        document.documentElement.setAttribute('data-theme', savedTheme);

        if (toggle) {
            toggle.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme');
                const newTheme = current === 'light' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('workspace-theme', newTheme);
            });
        }
    },

    initLogout() {
        const logoutBtn = document.getElementById('logout-btn');

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to log out?')) {
                    await auth.signOut();
                    window.location.href = 'index.html';
                }
            });
        }
    },

    async initModules() {
        const role = auth.currentProfile?.role;
        try {
            // Intern flow is different — they only get the intern dashboard
            if (role === 'intern') {
                await internModule.init();
                return;
            }

            // Admin + member: initialize the full dashboard
            await Promise.all([
                dashboardModule.init(),
                actionsModule.init(),
                goalsModule.init(),
                kpisModule.init(),
                ideasModule.init(),
                documentsModule.init(),
                weeklyModule.init(),
                activityModule.init(),
                teamModule.init()
            ]);

            // Start notification polling for admins + members
            this.initNotifications();
        } catch (error) {
            console.error('Failed to initialize modules:', error);
            toast.error('Failed to load data. Please refresh the page.');
        }
    },

    /**
     * Polls notifications every 30s, updates the bell badge.
     * The bell itself is in the sidebar (rendered in initUserInfo).
     */
    initNotifications() {
        const tick = async () => {
            try {
                const count = await db.getUnreadNotificationCount();
                const badge = document.getElementById('notif-count');
                if (badge) {
                    if (count > 0) {
                        badge.textContent = count;
                        badge.classList.remove('hidden');
                    } else {
                        badge.classList.add('hidden');
                    }
                }
            } catch (e) { /* silent */ }
        };
        tick();
        this.notifTimer = setInterval(tick, 30000);
    },

    refreshCurrentSection() {
        const modules = {
            dashboard: dashboardModule,
            actions: actionsModule,
            goals: goalsModule,
            kpis: kpisModule,
            ideas: ideasModule,
            documents: documentsModule,
            weekly: weeklyModule,
            activity: activityModule,
            team: teamModule
        };

        const module = modules[this.currentSection];
        if (module && typeof module.refresh === 'function') {
            module.refresh();
        }
    },

    refreshAll() {
        if (!this.initialized) return;

        dashboardModule.refresh();
        actionsModule.refresh();
        goalsModule.refresh();
        kpisModule.refresh();
        ideasModule.refresh();
        documentsModule.refresh();
        weeklyModule.refresh();
        activityModule.refresh();
    }
};

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init().catch(error => {
        console.error('App initialization failed:', error);
    });

    // Mobile menu toggle. The hamburger appears on small screens only (CSS).
    const toggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    function closeMobileMenu() {
        sidebar?.classList.remove('open');
        overlay?.classList.remove('show');
        document.body.classList.remove('sidebar-open');
    }
    function openMobileMenu() {
        sidebar?.classList.add('open');
        overlay?.classList.add('show');
        document.body.classList.add('sidebar-open');
    }

    toggle?.addEventListener('click', () => {
        if (sidebar?.classList.contains('open')) closeMobileMenu();
        else openMobileMenu();
    });

    overlay?.addEventListener('click', closeMobileMenu);

    // Close on nav link tap so the section appears after the menu closes
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });

    // Close if window resizes back to desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) closeMobileMenu();
    });
});
