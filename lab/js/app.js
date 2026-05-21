// Boot + router. Multi-tab per role.
const app = {
  currentTab: null,

  // Tab definitions per role
  tabsFor(role) {
    if (role === 'intern') return [
      { id: 'home', label: 'Home' },
      { id: 'attendance', label: 'Attendance' },
      { id: 'daily', label: 'Daily Log' },
      { id: 'tasks', label: 'Tasks' },
      { id: 'goals', label: 'Goals' },
      { id: 'submissions', label: 'Submissions' },
      { id: 'docs', label: 'Docs' },
    ];
    if (role === 'member') return [
      { id: 'team', label: 'Team' },
      { id: 'approvals', label: 'Approvals' },
      { id: 'tasks', label: 'Tasks' },
      { id: 'daily', label: 'Daily Logs' },
      { id: 'goals', label: 'Goals' },
      { id: 'ideas', label: 'Ideas' },
      { id: 'docs', label: 'Docs' },
      { id: 'activity', label: 'Activity' },
    ];
    if (role === 'admin') {
      // Admins who ALSO supervise interns get the RM tabs + org-wide tabs.
      // Admins with no reportees (e.g. Vidyut without direct team) get org-only.
      const orgTabs = [
        { id: 'all', label: 'All Interns' },
        { id: 'activity', label: 'Activity' },
        { id: 'settings', label: 'Settings' },
      ];
      if (auth.hasReportees) {
        return [
          { id: 'team', label: 'My Team' },
          { id: 'approvals', label: 'Approvals' },
          { id: 'tasks', label: 'Tasks' },
          { id: 'daily', label: 'Daily Logs' },
          { id: 'goals', label: 'Goals' },
          { id: 'ideas', label: 'Ideas' },
          { id: 'docs', label: 'Docs' },
          ...orgTabs,  // All Interns | Activity | Settings tacked on
        ];
      }
      return [{ id: 'all', label: 'All Interns' }, { id: 'approvals', label: 'Approvals' }, ...orgTabs.slice(1)];
    }
    return [];
  },

  // For admin users: which view should handle a given tab?
  adminViewFor(tab) {
    // RM-style tabs that operate on the admin's own team
    const rmTabs = ['team', 'tasks', 'daily', 'goals', 'ideas', 'docs'];
    if (rmTabs.includes(tab)) return 'rm';
    // Approvals: if admin supervises interns, show team approvals; else org-wide
    if (tab === 'approvals') return auth.hasReportees ? 'rm' : 'super';
    // All other tabs ('all', 'activity', 'settings') are super-admin org-wide
    return 'super';
  },

  async boot() {
    $('#login-form').addEventListener('submit', (ev) => { ev.preventDefault(); this.handleLogin(); });
    $('#logout-btn').addEventListener('click', () => this.handleLogout());
    $('#switch-intern').addEventListener('click', () => { if (auth.isIntern()) internView.showPicker(); });

    await auth.init();
    if (auth.user) await this.showApp();
    else this.showLogin();
  },

  showLogin() {
    $('#login-screen').classList.remove('hidden');
    $('#app').classList.add('hidden');
    $('#picker-screen').classList.add('hidden');
  },

  async handleLogin() {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const btn = $('#login-btn'); const err = $('#login-error');
    btn.disabled = true; err.textContent = '';
    try { await auth.signIn(email, password); await this.showApp(); }
    catch (e) { err.textContent = e.message || 'Sign-in failed'; }
    finally { btn.disabled = false; }
  },

  async handleLogout() {
    await auth.signOut();
    this.currentTab = null;
    this.showLogin();
  },

  async showApp() {
    if (!auth.profile) {
      $('#login-error').textContent = 'No profile linked. Contact Kavya / Vidyut.';
      this.showLogin(); return;
    }
    $('#login-screen').classList.add('hidden');

    // Intern shared-mailbox picker
    if (auth.isIntern()) {
      const interns = await api.listInternsForAuthUser(auth.user.id);
      if (interns.length > 1 && !localStorage.getItem('gl_selected_intern_id')) {
        $('#app').classList.add('hidden');
        internView.myInterns = interns;
        internView.showPicker();
        return;
      } else if (interns.length === 1) {
        internView.selectedIntern = interns[0];
        localStorage.setItem('gl_selected_intern_id', interns[0].id);
        localStorage.setItem('gl_selected_intern_name', interns[0].name);
      } else if (interns.length > 1) {
        internView.myInterns = interns;
        internView.selectedIntern = interns.find((i) => i.id === localStorage.getItem('gl_selected_intern_id'));
      }
    }

    $('#app').classList.remove('hidden');
    // Default tab if not yet set
    const tabs = this.tabsFor(auth.role());
    if (!this.currentTab && tabs.length) this.currentTab = tabs[0].id;

    this.refreshChrome();
    await notifications.init();
    await this.renderView();
  },

  refreshChrome() {
    const ctxEl = $('#topbar-context');
    const userEl = $('#active-user');
    const switchBtn = $('#switch-intern');
    const tabsBar = $('#tabs');
    tabsBar.innerHTML = '';

    if (auth.isIntern()) {
      ctxEl.textContent = APP_CONFIG.cohort;
      const sel = internView.selectedIntern;
      userEl.textContent = sel ? `${sel.name} · ${internVertical(sel)}` : '';
      switchBtn.classList.toggle('hidden', !(internView.myInterns && internView.myInterns.length > 1));
    } else if (auth.isRM()) {
      ctxEl.textContent = `Reporting Manager`;
      userEl.textContent = auth.profile.full_name;
      switchBtn.classList.add('hidden');
    } else if (auth.isSuper()) {
      ctxEl.textContent = `Admin · ${auth.profile.full_name}`;
      userEl.textContent = auth.profile.full_name;
      switchBtn.classList.add('hidden');
    } else {
      ctxEl.textContent = ''; userEl.textContent = auth.profile.full_name || '';
    }

    const tabs = this.tabsFor(auth.role());
    tabs.forEach((t) => {
      const btn = h('button', { class: 'tab' + (this.currentTab === t.id ? ' active' : ''),
        onclick: () => this.setTab(t.id),
      }, t.label);
      tabsBar.appendChild(btn);
    });
  },

  setTab(id) {
    this.currentTab = id;
    this.refreshChrome();
    this.renderView();
  },

  async renderView() {
    const mount = $('#view-mount');
    mount.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      if (auth.isIntern()) await internView.mount(mount);
      else if (auth.isRM()) await rmView.mount(mount);
      else if (auth.isSuper()) {
        // Dispatch admins to the appropriate view per tab
        const which = this.adminViewFor(this.currentTab || 'all');
        if (which === 'rm') await rmView.mount(mount);
        else await superView.mount(mount);
      }
      else mount.innerHTML = '<div class="empty-state">No role assigned. Contact admin.</div>';
    } catch (e) {
      console.error(e);
      const isMigrationMissing = e.message?.includes('schema cache') || e.message?.includes('not find');
      mount.innerHTML = '';
      if (isMigrationMissing) {
        mount.appendChild(h('div', { class: 'banner bad' },
          '⚠️ Database not yet initialized. Admin: paste lab/supabase/migration_growth_lab_v2.sql into Supabase SQL Editor and click RUN. Refresh after.'));
      } else {
        mount.appendChild(h('div', { class: 'banner bad' }, 'Failed to render: ' + e.message));
      }
    }
  },
};

document.addEventListener('DOMContentLoaded', () => app.boot());
