// Notification bell — fetches unread count, panel with recent list.
const notifications = {
  list: [],
  unread: 0,
  open: false,

  async init() {
    $('#bell-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.toggle();
    });
    $('#notif-mark-all').addEventListener('click', () => this.markAllRead());
    document.addEventListener('click', (ev) => {
      if (this.open && !$('#notif-panel').contains(ev.target) && ev.target !== $('#bell-btn')) {
        this.close();
      }
    });
    await this.refresh();
    setInterval(() => this.refresh(), 60_000); // 1 min poll
  },

  async refresh() {
    try {
      const [list, count] = await Promise.all([api.listNotifications(20), api.unreadCount()]);
      this.list = list;
      this.unread = count;
      this.renderBadge();
      if (this.open) this.renderPanel();
    } catch (e) {
      // Don't surface — likely DB not migrated yet, silent fail
      console.debug('notifications.refresh failed:', e.message);
    }
  },

  renderBadge() {
    const badge = $('#bell-count');
    if (this.unread > 0) {
      badge.textContent = this.unread > 99 ? '99+' : String(this.unread);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  },

  toggle() {
    this.open ? this.close() : this.openPanel();
  },

  openPanel() {
    this.open = true;
    $('#notif-panel').classList.remove('hidden');
    this.renderPanel();
  },

  close() {
    this.open = false;
    $('#notif-panel').classList.add('hidden');
  },

  renderPanel() {
    const list = $('#notif-list');
    list.innerHTML = '';
    if (this.list.length === 0) {
      list.appendChild(h('div', { class: 'notif-empty' }, "Nothing yet. Updates land here when there's news."));
      return;
    }
    this.list.forEach((n) => {
      const item = h('div', {
        class: 'notif-item' + (n.is_read ? '' : ' unread'),
        onclick: async () => {
          if (!n.is_read) {
            await api.markNotifRead(n.id);
            n.is_read = true;
            this.unread = Math.max(0, this.unread - 1);
            this.renderBadge();
            item.classList.remove('unread');
          }
          // If link is a hash, switch tab
          if (n.link && n.link.startsWith('#')) {
            this.close();
            app.setTab(n.link.slice(1));
          }
        },
      }, [
        h('div', { class: 'notif-msg' }, n.message || n.event_type),
        h('div', { class: 'notif-meta' }, [
          n.actor_name ? `${n.actor_name} · ` : '',
          timeAgo(n.created_at),
        ]),
      ]);
      list.appendChild(item);
    });
  },

  async markAllRead() {
    await api.markAllNotifsRead();
    this.list.forEach((n) => { n.is_read = true; });
    this.unread = 0;
    this.renderBadge();
    this.renderPanel();
  },
};
