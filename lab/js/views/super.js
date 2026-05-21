// Super-admin view: all 9 Growth Lab interns organized by team.
const superView = {
  interns: [],
  profilesById: {},

  async mount(rootEl) {
    rootEl.innerHTML = '';
    this.interns = await api.listInterns();
    if (this.interns.length === 0) {
      rootEl.appendChild(h('div', { class: 'empty-state' }, 'No active Growth Lab interns found.'));
      return;
    }
    // Pre-fetch supervisor profiles
    const supIds = Array.from(new Set(this.interns.map((i) => i.supervisor_id).filter(Boolean)));
    if (supIds.length) {
      const { data } = await getSupabase().from('profiles').select('id, full_name').in('id', supIds);
      (data || []).forEach((p) => { this.profilesById[p.id] = p; });
    }

    await this.renderTopBar(rootEl);
    await this.renderPendingPanel(rootEl);
    await this.renderTeamCards(rootEl);
  },

  async renderTopBar(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'All Interns — Growth Lab'));
    root.appendChild(h('div', { class: 'greeting-sub' },
      `${this.interns.length} active interns across ${new Set(this.interns.map(internVertical)).size} teams · Cohort 1, May 2026`));
  },

  async renderPendingPanel(root) {
    const card = h('div', { class: 'table-card' });
    card.appendChild(h('h3', { class: 'section-h' }, 'Pending approvals — org-wide'));
    card.appendChild(h('p', { class: 'section-sub' }, 'Attendance entries still waiting on RM action.'));

    let pending;
    try { pending = await api.listAllPending(); }
    catch (e) {
      card.appendChild(h('div', { class: 'empty-state' }, 'Failed to load: ' + e.message));
      root.appendChild(card);
      return;
    }
    if (pending.length === 0) {
      card.appendChild(h('div', { class: 'empty-state' }, '✓ No pending approvals across all teams.'));
      root.appendChild(card);
      return;
    }
    // Group by RM
    const byRM = {};
    pending.forEach((e) => {
      const rm = this.profilesById[e.interns.supervisor_id]?.full_name || '—';
      byRM[rm] = (byRM[rm] || 0) + 1;
    });
    const summary = Object.entries(byRM)
      .map(([rm, n]) => `${rm}: ${n}`)
      .join('  ·  ');
    card.appendChild(h('div', { style: 'padding: 0 24px 16px; color: var(--text-soft); font-size: 13px;' },
      `${pending.length} pending → ${summary}`));

    // Render rows (read-only here; Kavya can approve via her RM view if she's Growth Ops RM too)
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Date'),
      h('th', {}, 'Intern'),
      h('th', {}, 'Team'),
      h('th', {}, 'RM'),
      h('th', {}, 'Hours'),
      h('th', {}, 'Summary'),
      h('th', {}, ''),
    ])));
    const tbody = h('tbody');
    pending.slice(0, 20).forEach((e) => {
      const tr = h('tr');
      tr.appendChild(h('td', {}, formatDate(e.attendance_date)));
      tr.appendChild(h('td', { style: 'font-weight:500;' }, e.interns.name));
      tr.appendChild(h('td', {}, internVertical(e.interns)));
      tr.appendChild(h('td', {}, this.profilesById[e.interns.supervisor_id]?.full_name || '—'));
      tr.appendChild(h('td', {}, e.hours_worked != null ? String(e.hours_worked) : '—'));
      tr.appendChild(h('td', { style: 'max-width:280px;' }, e.daily_work_summary || h('em', { style: 'color:var(--bad);' }, '(empty)')));
      const actions = h('td', {}, h('div', { class: 'approve-actions' }, [
        h('button', { class: 'btn-tiny ok', onclick: () => this.adminApprove(e.id, 'approved', card) }, 'Approve'),
        h('button', { class: 'btn-tiny no', onclick: () => this.adminApprove(e.id, 'rejected', card) }, 'Reject'),
      ]));
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    root.appendChild(card);
  },

  async adminApprove(id, action, parentCard) {
    let remarks = '';
    if (action === 'rejected') {
      remarks = prompt('Reject reason (will show to intern):');
      if (!remarks) return;
    } else {
      remarks = prompt('Optional remark for the intern (Enter to skip):', '') || '';
    }
    try {
      await api.approveAttendance(id, action, remarks, auth.user.id);
      const root = parentCard.parentElement;
      parentCard.remove();
      await this.renderPendingPanel(root);
    } catch (e) { alert('Failed: ' + e.message); }
  },

  async renderTeamCards(root) {
    // Group interns by team (using TAG_TO_VERTICAL)
    const byTeam = {};
    this.interns.forEach((i) => {
      const v = internVertical(i);
      (byTeam[v] = byTeam[v] || []).push(i);
    });

    for (const [team, list] of Object.entries(byTeam)) {
      const sec = h('div', { class: 'team-section' });
      const rmName = this.profilesById[list[0]?.supervisor_id]?.full_name || '—';
      sec.appendChild(h('div', { class: 'team-h' }, [
        h('h2', {}, team),
        h('span', { class: 'team-meta' }, `${list.length} intern${list.length === 1 ? '' : 's'} · RM: ${rmName}`),
      ]));
      const grid = h('div', { class: 'intern-grid' });
      for (const intern of list) {
        const card = await this.buildInternCard(intern);
        grid.appendChild(card);
      }
      sec.appendChild(grid);
      root.appendChild(sec);
    }
  },

  async buildInternCard(intern) {
    const s = await api.getMonthSummaryForIntern(intern.id);
    const today = await api.getTodayAttendance(intern.id);
    const card = h('div', { class: 'intern-card' });

    card.appendChild(h('div', { class: 'name' }, intern.name));
    card.appendChild(h('div', { class: 'vertical' }, [
      intern.intern_code,
      ' · ',
      today ? h('span', { class: 'badge badge-' + today.approval_status }, today.approval_status)
            : h('span', { class: 'badge badge-pending' }, 'Not in yet'),
    ]));

    const pctCls = s.pct == null ? '' : (s.pct < 80 ? 'bad' : s.pct < 95 ? 'warn' : 'good');
    const metrics = h('div', { class: 'metrics' }, [
      h('div', {}, [
        h('div', { class: 'metric-l' }, 'Attendance'),
        h('div', { class: 'metric-v ' + pctCls }, s.pct == null ? '—' : `${s.pct}%`),
      ]),
      h('div', {}, [
        h('div', { class: 'metric-l' }, 'Days Present'),
        h('div', { class: 'metric-v' }, String(s.present)),
      ]),
    ]);
    card.appendChild(metrics);
    return card;
  },
};
