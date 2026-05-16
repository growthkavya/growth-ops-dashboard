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

        if (nameEl) {
            nameEl.textContent = auth.currentProfile?.full_name || auth.currentUser?.email || '-';
        }
        if (roleEl) {
            roleEl.textContent = auth.currentProfile?.role || 'member';
        }
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
        try {
            // Initialize all modules in parallel where possible
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
        } catch (error) {
            console.error('Failed to initialize modules:', error);
            toast.error('Failed to load data. Please refresh the page.');
        }
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
});
