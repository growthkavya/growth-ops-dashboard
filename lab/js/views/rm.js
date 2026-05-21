// RM (Reporting Manager) view: today's team status + pending approvals.
const rmView = {
  team: [],

  async mount(rootEl) {
    rootEl.innerHTML = '';
    this.team = await api.listInternsForSupervisor(auth.user.id);
    if (this.team.length === 0) {
      rootEl.appendChild(h('div', { class: 'empty-state' },
        "You don't have any active interns assigned to you yet. Tell Kavya / Vidyut to wire them up."));
      return;
    }
    await this.renderTeamHeader(rootEl);
    await this.renderPendingApprovals(rootEl);
    await this.renderTodayStatus(rootEl);
    await this.renderTeamSummary(rootEl);
  },

  async renderTeamHeader(root) {
    const team = this.team[0]?.tags?.find((t) => TAG_TO_VERTICAL[t]);
    const verticalName = TAG_TO_VERTICAL[team] || 'My Team';
    root.appendChild(h('div', { class: 'greeting' }, `${verticalName} Interns`));
    root.appendChild(h('div', { class: 'greeting-sub' },
      `${this.team.length} active intern${this.team.length === 1 ? '' : 's'} reporting to you.`));
  },

  async renderPendingApprovals(root) {
    const card = h('div', { class: 'table-card' });
    card.appendChild(h('h3', { class: 'section-h' }, 'Pending attendance approvals'));
    card.appendChild(h('p', { class: 'section-sub' }, 'Review each entry. Approve good ones; reject empty / suspect ones with a remark.'));

    let pending;
    try {
      pending = await api.listPendingForSupervisor(auth.user.id);
    } catch (e) {
      card.appendChild(h('div', { class: 'empty-state' }, 'Failed to load pending entries: ' + e.message));
      root.appendChild(card);
      return;
    }

    if (pending.length === 0) {
      card.appendChild(h('div', { class: 'empty-state' }, '✓ No pending approvals. You\'re caught up.'));
      root.appendChild(card);
      return;
    }

    const table = h('table');
    const thead = h('thead', {}, h('tr', {}, [
      h('th', {}, 'Date'),
      h('th', {}, 'Intern'),
      h('th', {}, 'In'),
      h('th', {}, 'Out'),
      h('th', {}, 'Hours'),
      h('th', {}, 'Daily Work Summary'),
      h('th', {}, 'Action'),
    ]));
    table.appendChild(thead);
    const tbody = h('tbody');
    pending.forEach((entry) => tbody.appendChild(this.renderPendingRow(entry, card)));
    table.appendChild(tbody);
    card.appendChild(table);
    root.appendChild(card);
  },

  renderPendingRow(entry, parentCard) {
    const tr = h('tr', { class: 'approve-row' });
    tr.appendChild(h('td', {}, formatDate(entry.attendance_date)));
    tr.appendChild(h('td', { style: 'font-weight:500;' }, entry.interns.name));
    tr.appendChild(h('td', {}, formatTime(entry.check_in_time)));
    tr.appendChild(h('td', {}, formatTime(entry.check_out_time)));
    tr.appendChild(h('td', {}, entry.hours_worked != null ? String(entry.hours_worked) : '—'));
    tr.appendChild(h('td', { style: 'max-width:340px;' }, entry.daily_work_summary || h('em', { style: 'color:var(--bad);' }, '(empty)')));
    const actions = h('div', { class: 'approve-actions' }, [
      h('button', { class: 'btn-tiny ok', onclick: () => this.doApprove(entry.id, 'approved', parentCard) }, 'Approve'),
      h('button', { class: 'btn-tiny no', onclick: () => this.doApprove(entry.id, 'rejected', parentCard) }, 'Reject'),
    ]);
    tr.appendChild(h('td', {}, actions));
    return tr;
  },

  async doApprove(attendanceId, action, parentCard) {
    let remarks = '';
    if (action === 'rejected') {
      remarks = prompt('Why are you rejecting this? (1 line; intern will see this)');
      if (!remarks) return;
    } else {
      remarks = prompt('Optional remark for the intern (Enter to skip):', '') || '';
    }
    try {
      await api.approveAttendance(attendanceId, action, remarks, auth.user.id);
      // Re-render this card
      const root = parentCard.parentElement;
      parentCard.remove();
      await this.renderPendingApprovals(root);
    } catch (e) {
      alert('Approval failed: ' + e.message);
    }
  },

  async renderTodayStatus(root) {
    const card = h('div', { class: 'table-card' });
    card.appendChild(h('h3', { class: 'section-h' }, "Today's status"));
    card.appendChild(h('p', { class: 'section-sub' }, "Who's checked in, who's still missing."));

    const ids = this.team.map((i) => i.id);
    let entries;
    try { entries = await api.listTeamAttendanceToday(ids); }
    catch (e) {
      card.appendChild(h('div', { class: 'empty-state' }, 'Failed to load: ' + e.message));
      root.appendChild(card);
      return;
    }
    const byIntern = {};
    entries.forEach((e) => { byIntern[e.intern_id] = e; });

    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Intern'),
      h('th', {}, 'Status'),
      h('th', {}, 'In'),
      h('th', {}, 'Out'),
      h('th', {}, 'Approval'),
    ])));
    const tbody = h('tbody');
    this.team.forEach((intern) => {
      const e = byIntern[intern.id];
      const tr = h('tr');
      tr.appendChild(h('td', { style: 'font-weight:500;' }, intern.name));
      if (!e) {
        tr.appendChild(h('td', {}, h('span', { class: 'badge badge-pending' }, 'Not in yet')));
        tr.appendChild(h('td', {}, '—'));
        tr.appendChild(h('td', {}, '—'));
        tr.appendChild(h('td', {}, '—'));
      } else {
        tr.appendChild(h('td', {}, h('span', { class: 'badge badge-' + (e.status || 'pending') }, e.status)));
        tr.appendChild(h('td', {}, formatTime(e.check_in_time)));
        tr.appendChild(h('td', {}, formatTime(e.check_out_time)));
        tr.appendChild(h('td', {}, h('span', { class: 'badge badge-' + e.approval_status }, e.approval_status)));
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    root.appendChild(card);
  },

  async renderTeamSummary(root) {
    const card = h('div', { class: 'table-card' });
    card.appendChild(h('h3', { class: 'section-h' }, 'Month summary'));
    card.appendChild(h('p', { class: 'section-sub' }, 'Attendance for each intern this month.'));

    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Intern'),
      h('th', {}, 'Attendance %'),
      h('th', {}, 'Present'),
      h('th', {}, 'Absent'),
      h('th', {}, 'WFH'),
      h('th', {}, 'Leave'),
    ])));
    const tbody = h('tbody');
    for (const intern of this.team) {
      const s = await api.getMonthSummaryForIntern(intern.id);
      const tr = h('tr');
      tr.appendChild(h('td', { style: 'font-weight:500;' }, intern.name));
      const pctCell = h('td', {}, s.pct == null ? '—' : `${s.pct}%`);
      if (s.pct != null && s.pct < 80) pctCell.style.color = 'var(--bad)';
      else if (s.pct != null && s.pct < 95) pctCell.style.color = 'var(--warn)';
      else if (s.pct != null) pctCell.style.color = 'var(--good)';
      tr.appendChild(pctCell);
      tr.appendChild(h('td', {}, String(s.present)));
      tr.appendChild(h('td', {}, String(s.absent)));
      tr.appendChild(h('td', {}, String(s.wfh)));
      tr.appendChild(h('td', {}, String(s.leave)));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    card.appendChild(table);
    root.appendChild(card);
  },
};
