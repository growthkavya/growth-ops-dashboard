// Boot + router. Single-page: routes by user role.
const app = {
  currentTab: null,

  async boot() {
    // Bind login form
    $('#login-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      this.handleLogin();
    });
    $('#logout-btn').addEventListener('click', () => this.handleLogout());
    $('#switch-intern').addEventListener('click', () => {
      if (auth.isIntern()) internView.showPicker();
    });

    await auth.init();
    if (auth.user) {
      await this.showApp();
    } else {
      this.showLogin();
    }
  },

  showLogin() {
    $('#login-screen').classList.remove('hidden');
    $('#app').classList.add('hidden');
    $('#picker-screen').classList.add('hidden');
  },

  async handleLogin() {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const btn = $('#login-btn');
    const err = $('#login-error');
    btn.disabled = true;
    err.textContent = '';
    try {
      await auth.signIn(email, password);
      await this.showApp();
    } catch (e) {
      err.textContent = e.message || 'Sign-in failed';
    } finally {
      btn.disabled = false;
    }
  },

  async handleLogout() {
    await auth.signOut();
    this.showLogin();
  },

  async showApp() {
    if (!auth.profile) {
      $('#login-error').textContent = 'No profile linked to this account. Contact Kavya / Vidyut.';
      this.showLogin();
      return;
    }
    $('#login-screen').classList.add('hidden');

    if (auth.isIntern()) {
      // Intern path may show picker if multiple intern rows linked
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
    this.refreshChrome();
    await this.renderView();
  },

  refreshChrome() {
    // Topbar context + tabs
    const ctxEl = $('#topbar-context');
    const userEl = $('#active-user');
    const switchBtn = $('#switch-intern');
    const tabs = $('#tabs');
    tabs.innerHTML = '';

    if (auth.isIntern()) {
      ctxEl.textContent = APP_CONFIG.cohort;
      const sel = internView.selectedIntern;
      userEl.textContent = sel ? `${sel.name} · ${internVertical(sel)}` : '';
      switchBtn.classList.toggle('hidden', !(internView.myInterns && internView.myInterns.length > 1));
      this.addTab('home', 'Home');
    } else if (auth.isRM()) {
      ctxEl.textContent = `RM · ${auth.profile.full_name}`;
      userEl.textContent = auth.profile.full_name;
      switchBtn.classList.add('hidden');
      this.addTab('team', 'My Team');
    } else if (auth.isSuper()) {
      ctxEl.textContent = `Admin · ${auth.profile.full_name}`;
      userEl.textContent = auth.profile.full_name;
      switchBtn.classList.add('hidden');
      this.addTab('all', 'All Interns');
    } else {
      ctxEl.textContent = '';
      userEl.textContent = auth.profile.full_name || '';
    }
  },

  addTab(id, label) {
    const btn = h('button', { class: 'tab' + (this.currentTab === id ? ' active' : ''), onclick: () => {
      this.currentTab = id;
      this.refreshChrome();
      this.renderView();
    } }, label);
    if (!this.currentTab) { this.currentTab = id; btn.classList.add('active'); }
    $('#tabs').appendChild(btn);
  },

  async renderView() {
    const mount = $('#view-mount');
    mount.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      if (auth.isIntern()) {
        await internView.mount(mount);
      } else if (auth.isRM()) {
        await rmView.mount(mount);
      } else if (auth.isSuper()) {
        await superView.mount(mount);
      } else {
        mount.innerHTML = '<div class="empty-state">No role assigned. Contact admin.</div>';
      }
    } catch (e) {
      console.error(e);
      mount.innerHTML = `<div class="empty-state" style="color:var(--bad);">Failed to render: ${e.message}</div>`;
    }
  },
};

// Kick off
document.addEventListener('DOMContentLoaded', () => app.boot());
