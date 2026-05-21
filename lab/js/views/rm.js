// RM (Reporting Manager) view — 8 tabs.
const rmView = {
  team: [],
  charts: {},
  destroyCharts() { Object.values(this.charts).forEach((c) => { try { c.destroy(); } catch {} }); this.charts = {}; },

  async mount(rootEl) {
    this.destroyCharts();
    rootEl.innerHTML = '';
    this.team = await api.listInternsForSupervisor(auth.user.id);
    if (!this.team.length) {
      rootEl.appendChild(h('div', { class: 'empty-state' }, "No active interns assigned to you yet. Tell Kavya/Vidyut."));
      return;
    }
    const tab = app.currentTab || 'team';
    switch (tab) {
      case 'team': await this.renderTeam(rootEl); break;
      case 'approvals': await this.renderApprovals(rootEl); break;
      case 'tasks': await this.renderTasks(rootEl); break;
      case 'daily': await this.renderDaily(rootEl); break;
      case 'goals': await this.renderGoals(rootEl); break;
      case 'ideas': await this.renderIdeas(rootEl); break;
      case 'docs': await this.renderDocs(rootEl); break;
      case 'activity': await this.renderActivity(rootEl); break;
      default: await this.renderTeam(rootEl);
    }
  },

  // ============== TEAM ==============
  async renderTeam(root) {
    const vt = internVerticalTag(this.team[0]);
    const vName = TAG_TO_VERTICAL[vt] || 'My Team';
    root.appendChild(h('div', { class: 'greeting' }, `${vName} Interns`));
    root.appendChild(h('div', { class: 'greeting-sub' }, `${this.team.length} active intern${this.team.length===1?'':'s'} reporting to you.`));

    // Pending approvals quick view
    const internIds = this.team.map((i) => i.id);
    const [todayAttn, pending, openTasks, recentCheckins] = await Promise.all([
      api.listTeamAttendanceToday(internIds).catch(() => []),
      api.listPendingForSupervisor(auth.user.id).catch(() => []),
      api.listTasksForTeam(internIds, { activeOnly: true }).catch(() => []),
      api.listTeamCheckinsRecent(internIds, 3).catch(() => []),
    ]);

    // Stat row
    const row = h('div', { class: 'stat-row' }, [
      statCard('Pending approvals', String(pending.length), 'click Approvals tab'),
      statCard('Open tasks', String(openTasks.length), 'across team'),
      statCard('Checked in today', String(todayAttn.length) + '/' + this.team.length, ''),
      statCard('Check-ins last 3d', String(recentCheckins.length), 'submissions'),
    ]);
    root.appendChild(row);

    // Intern cards
    const grid = h('div', { class: 'intern-grid' });
    for (const intern of this.team) grid.appendChild(await this.buildInternCard(intern, todayAttn));
    root.appendChild(grid);
  },

  async buildInternCard(intern, todayEntries) {
    const today = (todayEntries || []).find((e) => e.intern_id === intern.id);
    const summary = await api.getMonthSummaryForIntern(intern.id);
    const card = h('div', { class: 'intern-card', onclick: () => this.openInternDrill(intern) });
    card.appendChild(h('div', { class: 'name' }, intern.name));
    card.appendChild(h('div', { class: 'vertical' }, [
      intern.intern_code, ' · ',
      today ? h('span', { class: 'badge badge-' + today.approval_status }, today.approval_status) : h('span', { class: 'badge badge-pending' }, 'Not in yet'),
    ]));
    const pctCls = summary.pct == null ? '' : (summary.pct < 80 ? 'bad' : summary.pct < 95 ? 'warn' : 'good');
    card.appendChild(h('div', { class: 'metrics' }, [
      h('div', {}, [h('div', { class: 'metric-l' }, 'Attendance'), h('div', { class: 'metric-v ' + pctCls }, summary.pct == null ? '—' : `${summary.pct}%`)]),
      h('div', {}, [h('div', { class: 'metric-l' }, 'Days present'), h('div', { class: 'metric-v' }, String(summary.present))]),
    ]));
    return card;
  },

  openInternDrill(intern) {
    // Show a modal with everything-about-this-intern
    const modal = h('div');
    modal.appendChild(h('h3', {}, intern.name));
    modal.appendChild(h('p', { class: 'help-text' }, intern.intern_code + ' · ' + internVertical(intern)));
    modal.appendChild(h('p', {}, h('em', {}, 'Drill-down loading…')));
    openModal(modal, { wide: true });
    (async () => {
      modal.innerHTML = '';
      modal.appendChild(h('h3', {}, intern.name + ' · ' + internVertical(intern)));
      const [att, kras, kpis, tasks, ideas, learns] = await Promise.all([
        api.getMonthSummaryForIntern(intern.id), api.listKRAs(intern.id), api.listKPIs(intern.id),
        api.listTasksForIntern(intern.id), api.listIdeasForIntern(intern.id), api.listLearnings(intern.id, 50),
      ]);
      modal.appendChild(h('div', { class: 'stat-row', style: 'margin-top:12px;' }, [
        statCard('Attendance', att.pct == null ? '—' : att.pct + '%', 'this month'),
        statCard('Open tasks', String(tasks.filter((t) => !['done','cancelled'].includes(t.status)).length), ''),
        statCard('Ideas', String(ideas.length), ''),
        statCard('Learnings', String(learns.length), ''),
      ]));
      // KRAs progress
      if (kras.length) {
        modal.appendChild(h('h4', { style: 'margin-top:18px;' }, 'KRAs progress'));
        kras.forEach((k) => modal.appendChild(h('div', { style: 'margin:8px 0;' }, [
          h('div', { style: 'display:flex; justify-content:space-between; font-size:13px;' }, [
            h('span', {}, `KRA ${k.kra_index}. ${k.title}`),
            h('span', { class: 'badge badge-' + (k.status || 'on_track') }, (k.status || 'on_track').replace('_', ' ')),
          ]),
          h('div', { class: 'progress', style: 'margin-top:4px;' },
            h('div', { class: 'bar', style: { width: (k.percent_done || 0) + '%' } })),
        ])));
      }
      modal.appendChild(h('div', { class: 'modal-actions' }, [h('button', { class: 'btn-ghost', onclick: closeModal }, 'Close')]));
    })();
  },

  // ============== APPROVALS ==============
  async renderApprovals(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Approvals'));
    root.appendChild(h('div', { class: 'greeting-sub' }, "Review attendance entries. You can also edit/override any past entry or mark on behalf."));

    const pending = await api.listPendingForSupervisor(auth.user.id);
    const card = h('div', { class: 'table-card' });
    card.appendChild(h('h3', { class: 'section-h' }, `${pending.length} pending`));

    if (!pending.length) card.appendChild(h('div', { class: 'empty-state' }, "✓ Caught up. No pending approvals."));
    else {
      const table = h('table');
      table.appendChild(h('thead', {}, h('tr', {}, [
        h('th', {}, 'Date'), h('th', {}, 'Intern'), h('th', {}, 'In'), h('th', {}, 'Out'),
        h('th', {}, 'Hrs'), h('th', {}, 'Daily Work Summary'), h('th', {}, 'Audit'), h('th', {}, 'Action'),
      ])));
      const tb = h('tbody');
      pending.forEach((e) => {
        const tr = h('tr');
        tr.appendChild(h('td', { style: 'white-space:nowrap;' }, formatDate(e.attendance_date)));
        tr.appendChild(h('td', { style: 'font-weight:500;' }, e.interns.name));
        tr.appendChild(h('td', {}, formatTime(e.check_in_time)));
        tr.appendChild(h('td', {}, formatTime(e.check_out_time)));
        tr.appendChild(h('td', {}, e.hours_worked != null ? String(e.hours_worked) : '—'));
        tr.appendChild(h('td', { style: 'max-width:340px;' }, e.daily_work_summary || h('em', { style: 'color:var(--bad);' }, '(empty)')));
        tr.appendChild(h('td', {}, h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); this.showAuditModal(e.id); } }, 'view')));
        tr.appendChild(h('td', {}, h('div', { class: 'approve-actions' }, [
          h('button', { class: 'btn-tiny ok', onclick: () => this.doApprove(e.id, 'approved') }, 'Approve'),
          h('button', { class: 'btn-tiny no', onclick: () => this.doApprove(e.id, 'rejected') }, 'Reject'),
          h('button', { class: 'btn-tiny neutral', onclick: () => this.editAttendanceModal(e) }, 'Edit'),
        ])));
        tb.appendChild(tr);
      });
      table.appendChild(tb); card.appendChild(table);
    }
    root.appendChild(card);

    // History section: all attendance for team (last 14d)
    const histCard = h('div', { class: 'table-card' });
    histCard.appendChild(h('h3', { class: 'section-h' }, 'Recent team attendance'));
    histCard.appendChild(h('p', { class: 'section-sub' }, "Last 14 days. Edit any row to override status, summary or times."));
    histCard.appendChild(h('div', { class: 'card-actions' }, [
      h('button', { class: 'btn-accent', onclick: () => this.markOnBehalfModal() }, '+ Mark attendance on behalf'),
    ]));
    const recent = await api.listTeamAttendanceRecent(this.team.map((i) => i.id), 14);
    if (!recent.length) histCard.appendChild(h('div', { class: 'empty-state' }, 'No entries yet.'));
    else {
      const table = h('table');
      table.appendChild(h('thead', {}, h('tr', {}, [
        h('th', {}, 'Date'), h('th', {}, 'Intern'), h('th', {}, 'Status'),
        h('th', {}, 'In'), h('th', {}, 'Out'), h('th', {}, 'Hrs'),
        h('th', {}, 'Approval'), h('th', {}, ''),
      ])));
      const tb = h('tbody');
      recent.forEach((e) => {
        const tr = h('tr');
        tr.appendChild(h('td', { style: 'white-space:nowrap;' }, formatDate(e.attendance_date)));
        tr.appendChild(h('td', { style: 'font-weight:500;' }, e.interns.name));
        tr.appendChild(h('td', {}, h('span', { class: 'badge badge-' + (e.status || 'present') }, e.status)));
        tr.appendChild(h('td', {}, formatTime(e.check_in_time)));
        tr.appendChild(h('td', {}, formatTime(e.check_out_time)));
        tr.appendChild(h('td', {}, e.hours_worked != null ? String(e.hours_worked) : '—'));
        tr.appendChild(h('td', {}, h('span', { class: 'badge badge-' + e.approval_status }, e.approval_status)));
        tr.appendChild(h('td', {}, h('button', { class: 'btn-tiny neutral', onclick: () => this.editAttendanceModal(e) }, 'Edit')));
        tb.appendChild(tr);
      });
      table.appendChild(tb); histCard.appendChild(table);
    }
    root.appendChild(histCard);
  },

  showAuditModal(attendanceId) {
    const modal = h('div');
    modal.appendChild(h('h3', {}, 'Audit trail'));
    modal.appendChild(h('p', { class: 'help-text' }, 'Loading…'));
    openModal(modal);
    (async () => {
      const audit = await api.listAuditForAttendance(attendanceId);
      modal.innerHTML = '';
      modal.appendChild(h('h3', {}, 'Audit trail'));
      if (!audit.length) modal.appendChild(h('div', { class: 'empty-state' }, 'No events.'));
      else {
        const t = h('div', { class: 'audit-timeline' });
        audit.forEach((a) => t.appendChild(h('div', { class: 'audit-row' }, [
          h('div', { class: 'audit-when' }, formatDateTime(a.created_at)),
          h('div', {}, [
            h('strong', {}, a.action), ' · ', a.actor_name || 'system',
            a.note ? h('div', { style: 'color:var(--text-mute); margin-top:2px;' }, a.note) : null,
          ]),
        ])));
        modal.appendChild(t);
      }
      modal.appendChild(h('div', { class: 'modal-actions' }, [h('button', { class: 'btn-ghost', onclick: closeModal }, 'Close')]));
    })();
  },

  async doApprove(id, action) {
    let remarks = '';
    if (action === 'rejected') {
      remarks = prompt('Reject reason (will show to intern):');
      if (!remarks) return;
    } else {
      remarks = prompt('Optional remark (Enter to skip):', '') || '';
    }
    try { await api.approveAttendance(id, action, remarks, auth.user.id); app.renderView(); }
    catch (e) { alert('Failed: ' + e.message); }
  },

  editAttendanceModal(e) {
    const card = h('div');
    card.appendChild(h('h3', {}, `Edit attendance · ${formatDate(e.attendance_date)}`));
    card.appendChild(h('p', { class: 'help-text' }, e.interns?.name || ''));
    const statusSel = h('select', { name: 'status' }, ['present','half-day','absent','leave','wfh','sick'].map((s) =>
      h('option', { value: s, selected: e.status === s }, s)));
    const approvalSel = h('select', { name: 'approval_status' }, ['pending','approved','rejected'].map((s) =>
      h('option', { value: s, selected: e.approval_status === s }, s)));
    const inT = h('input', { type: 'time', name: 'check_in_time' });
    if (e.check_in_time) inT.value = new Date(e.check_in_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const outT = h('input', { type: 'time', name: 'check_out_time' });
    if (e.check_out_time) outT.value = new Date(e.check_out_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const summary = h('textarea', { name: 'daily_work_summary', placeholder: 'Daily work summary' });
    if (e.daily_work_summary) summary.value = e.daily_work_summary;
    const remarks = h('textarea', { name: 'rm_remarks', placeholder: 'Your remarks (intern will see)' });
    if (e.rm_remarks) remarks.value = e.rm_remarks;

    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Status'), statusSel]),
      h('label', {}, [h('span', {}, 'Approval'), approvalSel]),
    ]));
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Check in'), inT]),
      h('label', {}, [h('span', {}, 'Check out'), outT]),
    ]));
    card.appendChild(h('label', {}, [h('span', {}, 'Work summary'), summary]));
    card.appendChild(h('label', {}, [h('span', {}, 'RM remarks'), remarks]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        try {
          const update = {
            status: statusSel.value, approval_status: approvalSel.value,
            daily_work_summary: summary.value || null, rm_remarks: remarks.value || null,
          };
          // Build full timestamps if user changed times
          if (inT.value) {
            const [hh, mm] = inT.value.split(':');
            const d = new Date(e.attendance_date + 'T00:00:00'); d.setHours(+hh, +mm, 0, 0);
            update.check_in_time = d.toISOString();
          }
          if (outT.value) {
            const [hh, mm] = outT.value.split(':');
            const d = new Date(e.attendance_date + 'T00:00:00'); d.setHours(+hh, +mm, 0, 0);
            update.check_out_time = d.toISOString();
            if (update.check_in_time) update.hours_worked = Math.round(((new Date(update.check_out_time) - new Date(update.check_in_time)) / 3600000) * 100) / 100;
          }
          if (approvalSel.value !== 'pending' && e.approval_status === 'pending') {
            update.approved_by_id = auth.user.id; update.approved_at = new Date().toISOString();
          }
          await api.editAttendance(e.id, update);
          closeModal(); app.renderView();
        } catch (ex) { alert('Failed: ' + ex.message); }
      } }, 'Save'),
    ]));
    openModal(card, { wide: true });
  },

  markOnBehalfModal() {
    const card = h('div');
    card.appendChild(h('h3', {}, '+ Mark attendance on behalf'));
    card.appendChild(h('p', { class: 'help-text' }, "Useful when intern forgot to check in. Auto-approves."));
    const internSel = h('select', { name: 'intern_id' }, this.team.map((i) => h('option', { value: i.id }, i.name)));
    const date = h('input', { type: 'date', name: 'attendance_date', value: todayStr() });
    const status = h('select', { name: 'status' }, ['present','half-day','absent','leave','wfh','sick'].map((s) => h('option', { value: s, selected: s === 'present' }, s)));
    const note = h('textarea', { name: 'note', placeholder: 'Reason / what they did' });
    card.appendChild(h('label', {}, [h('span', {}, 'Intern'), internSel]));
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Date'), date]),
      h('label', {}, [h('span', {}, 'Status'), status]),
    ]));
    card.appendChild(h('label', {}, [h('span', {}, 'Notes / what they did'), note]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        try { await api.rmMarkOnBehalf(internSel.value, date.value, status.value, note.value); closeModal(); app.renderView(); }
        catch (e) { alert('Failed: ' + e.message); }
      } }, 'Mark'),
    ]));
    openModal(card);
  },

  // ============== TASKS ==============
  async renderTasks(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Tasks'));
    root.appendChild(h('div', { class: 'greeting-sub' }, "Assign new tasks (daily or weekly), track progress, close completed ones."));
    root.appendChild(h('div', { style: 'margin-bottom:16px;' }, h('button', { class: 'btn-accent', onclick: () => this.newTaskModal() }, '+ Assign new task')));

    const tasks = await api.listTasksForTeam(this.team.map((i) => i.id));
    const active = tasks.filter((t) => !['done','cancelled'].includes(t.status));
    const recent = tasks.filter((t) => t.status === 'done').slice(0, 15);

    if (active.length) root.appendChild(this.tasksTable('Active tasks', active));
    else root.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty-state' }, 'No active tasks. Click + to assign one.')));
    if (recent.length) root.appendChild(this.tasksTable('Recently completed', recent, true));
  },

  tasksTable(title, tasks, readOnly = false) {
    const card = h('div', { class: 'table-card' });
    card.appendChild(h('h3', { class: 'section-h' }, title));
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Type'), h('th', {}, 'Intern'), h('th', {}, 'Task'),
      h('th', {}, 'Due'), h('th', {}, 'Priority'), h('th', {}, 'Status'),
      h('th', {}, '%'), h('th', {}, ''),
    ])));
    const tb = h('tbody');
    tasks.forEach((t) => {
      const tr = h('tr');
      tr.appendChild(h('td', {}, t.task_type));
      tr.appendChild(h('td', { style: 'font-weight:500;' }, t.interns?.name || '—'));
      tr.appendChild(h('td', { style: 'max-width:280px;' }, [
        h('div', { style: 'font-weight:500;' }, t.title),
        t.description ? h('div', { style: 'font-size:12px; color:var(--text-mute);' }, t.description) : null,
      ]));
      tr.appendChild(h('td', { style: 'white-space:nowrap;' }, formatDate(t.due_date) || '—'));
      tr.appendChild(h('td', {}, h('span', { class: 'badge badge-' + (t.priority || 'med') }, t.priority || 'med')));
      tr.appendChild(h('td', {}, h('span', { class: 'badge badge-' + t.status }, t.status)));
      tr.appendChild(h('td', {}, (t.percent_done || 0) + '%'));
      tr.appendChild(h('td', {}, readOnly ? null : h('div', { class: 'approve-actions' }, [
        h('button', { class: 'btn-tiny neutral', onclick: () => this.editRmTaskModal(t) }, 'Edit'),
        h('button', { class: 'btn-tiny no', onclick: () => {
          confirmModal('Delete this task?', async () => { try { await api.deleteTask(t.id); app.renderView(); } catch (e) { alert(e.message); } });
        } }, 'Delete'),
      ])));
      tb.appendChild(tr);
    });
    table.appendChild(tb); card.appendChild(table);
    return card;
  },

  newTaskModal(prefill = {}) {
    const card = h('div');
    card.appendChild(h('h3', {}, '+ Assign task'));
    const internSel = h('select', { name: 'intern_id' }, this.team.map((i) =>
      h('option', { value: i.id, selected: prefill.intern_id === i.id }, i.name)));
    const type = h('select', { name: 'task_type' }, ['daily','weekly'].map((s) =>
      h('option', { value: s, selected: prefill.task_type === s }, s)));
    const title = h('input', { type: 'text', name: 'title', placeholder: 'Short, clear task title' });
    const desc = h('textarea', { name: 'description', placeholder: 'Context / what done looks like' });
    const due = h('input', { type: 'date', name: 'due_date', value: prefill.due_date || '' });
    const pri = h('select', { name: 'priority' }, ['low','med','high'].map((s) =>
      h('option', { value: s, selected: s === 'med' }, s)));
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Intern'), internSel]),
      h('label', {}, [h('span', {}, 'Type'), type]),
    ]));
    card.appendChild(h('label', {}, [h('span', {}, 'Title'), title]));
    card.appendChild(h('label', {}, [h('span', {}, 'Description'), desc]));
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Due date'), due]),
      h('label', {}, [h('span', {}, 'Priority'), pri]),
    ]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        if (!title.value.trim()) { alert('Title required'); return; }
        try {
          await api.createTask({
            intern_id: internSel.value, assigned_by_id: auth.user.id, task_type: type.value,
            title: title.value, description: desc.value || null,
            due_date: due.value || null, priority: pri.value,
          });
          closeModal(); app.renderView();
        } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Assign'),
    ]));
    openModal(card);
  },

  editRmTaskModal(t) {
    const card = h('div');
    card.appendChild(h('h3', {}, 'Edit task'));
    const title = h('input', { type: 'text', name: 'title', value: t.title });
    const desc = h('textarea', { name: 'description' }); if (t.description) desc.value = t.description;
    const due = h('input', { type: 'date', name: 'due_date', value: t.due_date || '' });
    const pri = h('select', { name: 'priority' }, ['low','med','high'].map((s) =>
      h('option', { value: s, selected: t.priority === s }, s)));
    const status = h('select', { name: 'status' }, ['not_started','in_progress','blocked','done','cancelled'].map((s) =>
      h('option', { value: s, selected: t.status === s }, s)));
    const pct = h('input', { type: 'number', name: 'percent_done', min: 0, max: 100, step: 5, value: String(t.percent_done || 0) });
    const rmrem = h('textarea', { name: 'rm_remarks', placeholder: 'Remarks for the intern' }); if (t.rm_remarks) rmrem.value = t.rm_remarks;
    card.appendChild(h('label', {}, [h('span', {}, 'Title'), title]));
    card.appendChild(h('label', {}, [h('span', {}, 'Description'), desc]));
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Due'), due]),
      h('label', {}, [h('span', {}, 'Priority'), pri]),
    ]));
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Status'), status]),
      h('label', {}, [h('span', {}, '% done'), pct]),
    ]));
    card.appendChild(h('label', {}, [h('span', {}, 'RM remarks'), rmrem]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        try {
          await api.updateTask(t.id, {
            title: title.value, description: desc.value || null, due_date: due.value || null,
            priority: pri.value, status: status.value, percent_done: Number(pct.value),
            rm_remarks: rmrem.value || null,
          });
          closeModal(); app.renderView();
        } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Save'),
    ]));
    openModal(card);
  },

  // ============== DAILY LOGS ==============
  async renderDaily(root) {
    root.appendChild(h('div', { class: 'greeting' }, "Daily Check-ins"));
    root.appendChild(h('div', { class: 'greeting-sub' }, "Read team's daily check-ins. Acknowledge so they know you saw."));
    const checkins = await api.listTeamCheckinsRecent(this.team.map((i) => i.id), 14);
    if (!checkins.length) { root.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty-state' }, 'No check-ins in the last 14 days.'))); return; }

    const card = h('div', { class: 'table-card' });
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Date'), h('th', {}, 'Intern'), h('th', {}, 'What done'),
      h('th', {}, 'Learnt'), h('th', {}, 'Blockers'), h('th', {}, 'Tomorrow'),
      h('th', {}, 'Hrs'), h('th', {}, 'Ack'),
    ])));
    const tb = h('tbody');
    checkins.forEach((c) => {
      const tr = h('tr');
      tr.appendChild(h('td', { style: 'white-space:nowrap;' }, formatDate(c.checkin_date)));
      tr.appendChild(h('td', { style: 'font-weight:500;' }, c.interns?.name || '—'));
      tr.appendChild(h('td', { style: 'max-width:240px;' }, c.what_done || '—'));
      tr.appendChild(h('td', { style: 'max-width:180px;' }, c.what_learnt || '—'));
      tr.appendChild(h('td', { style: 'max-width:180px;' }, c.blockers || '—'));
      tr.appendChild(h('td', { style: 'max-width:180px;' }, c.tomorrow_plan || '—'));
      tr.appendChild(h('td', {}, c.hours_spent != null ? String(c.hours_spent) : '—'));
      tr.appendChild(h('td', {}, c.rm_acknowledged ?
        h('span', { class: 'badge badge-approved' }, '✓ Ack') :
        h('button', { class: 'btn-tiny ok', onclick: async () => {
          const cmt = prompt('Optional comment for intern (Enter to skip):', '') || null;
          try { await api.acknowledgeCheckin(c.id, cmt); app.renderView(); } catch (e) { alert(e.message); }
        } }, 'Ack')));
      tb.appendChild(tr);
    });
    table.appendChild(tb); card.appendChild(table); root.appendChild(card);
  },

  // ============== GOALS (KRA + KPI setup) ==============
  async renderGoals(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Goals — KRAs & KPIs'));
    root.appendChild(h('div', { class: 'greeting-sub' }, 'Set monthly KRAs (high-level) and KPIs (measurable) per intern. Pre-fill from vertical template, then customize.'));

    for (const intern of this.team) {
      const sect = h('div', { class: 'card' });
      sect.appendChild(h('h3', { class: 'section-h' }, intern.name));
      sect.appendChild(h('p', { class: 'section-sub' }, intern.intern_code + ' · ' + internVertical(intern)));
      const [kras, kpis] = await Promise.all([api.listKRAs(intern.id), api.listKPIs(intern.id)]);

      const setupActions = h('div', { class: 'card-actions' }, [
        h('button', { class: 'btn-accent', onclick: () => this.editKRAsModal(intern, kras) }, kras.length ? 'Edit KRAs' : 'Set up KRAs (5)'),
        h('button', { class: 'btn-accent', onclick: () => this.editKPIsModal(intern, kpis) }, kpis.length ? 'Edit KPIs' : 'Set up KPIs (5)'),
      ]);
      sect.appendChild(setupActions);

      // Show current snapshot
      if (kras.length || kpis.length) {
        const tbl = h('table', { style: 'margin-top:10px;' });
        tbl.appendChild(h('thead', {}, h('tr', {}, [
          h('th', {}, '#'), h('th', {}, 'Type'), h('th', {}, 'Title / KPI'),
          h('th', {}, 'Target / Status'), h('th', {}, 'Actual / Progress'),
        ])));
        const tb = h('tbody');
        kras.forEach((k) => tb.appendChild(h('tr', {}, [
          h('td', {}, String(k.kra_index)), h('td', {}, 'KRA'),
          h('td', {}, [h('div', { style: 'font-weight:500;' }, k.title), h('div', { class: 'help-text' }, k.target_outcome || '')]),
          h('td', {}, h('span', { class: 'badge badge-' + (k.status || 'on_track') }, (k.status || 'on_track').replace('_', ' '))),
          h('td', {}, (k.percent_done || 0) + '%'),
        ])));
        kpis.forEach((k) => tb.appendChild(h('tr', {}, [
          h('td', {}, String(k.kpi_index)), h('td', {}, 'KPI'),
          h('td', {}, k.label),
          h('td', {}, k.target || '—'),
          h('td', {}, k.actual || '—'),
        ])));
        tbl.appendChild(tb); sect.appendChild(tbl);
      }
      root.appendChild(sect);
    }
  },

  editKRAsModal(intern, existing) {
    const card = h('div');
    card.appendChild(h('h3', {}, `Set 5 KRAs · ${intern.name}`));
    card.appendChild(h('p', { class: 'help-text' }, 'High-level monthly goals. Customize the vertical template below.'));
    const vertical = internVertical(intern);
    const template = KRA_TEMPLATES[vertical] || [];
    const month = monthStartStr();
    const rows = [];
    for (let i = 1; i <= 5; i++) {
      const ex = existing.find((k) => k.kra_index === i);
      const tpl = template[i - 1] || { title: '', target_outcome: '' };
      const titleI = h('input', { type: 'text', value: (ex?.title) || tpl.title || '', placeholder: 'KRA title' });
      const targetI = h('textarea', { value: (ex?.target_outcome) || tpl.target_outcome || '', placeholder: 'Target outcome', style: 'min-height:50px;' });
      rows.push({ idx: i, titleI, targetI });
      card.appendChild(h('div', { style: 'border-top:1px solid var(--border); padding-top:10px; margin-top:10px;' }, [
        h('div', { style: 'font-weight:600; margin-bottom:6px;' }, `KRA ${i}`),
        h('label', {}, [h('span', {}, 'Title'), titleI]),
        h('label', {}, [h('span', {}, 'Target outcome'), targetI]),
      ]));
    }
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        try {
          for (const r of rows) {
            if (!r.titleI.value.trim()) continue;
            await api.upsertKRA({
              intern_id: intern.id, period_month: month, kra_index: r.idx,
              title: r.titleI.value, target_outcome: r.targetI.value || null,
              status: 'on_track',
            });
          }
          closeModal(); app.renderView();
        } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Save all'),
    ]));
    openModal(card, { wide: true });
  },

  editKPIsModal(intern, existing) {
    const card = h('div');
    card.appendChild(h('h3', {}, `Set 5 KPIs · ${intern.name}`));
    card.appendChild(h('p', { class: 'help-text' }, 'Measurable indicators. Defaults from vertical template — edit as needed.'));
    const vertical = internVertical(intern);
    const template = KPI_TEMPLATES[vertical] || [];
    const month = monthStartStr();
    const rows = [];
    for (let i = 1; i <= 5; i++) {
      const ex = existing.find((k) => k.kpi_index === i);
      const tpl = template[i - 1] || { label: '', target: '' };
      const labelI = h('input', { type: 'text', value: (ex?.label) || tpl.label || '', placeholder: 'KPI label' });
      const targetI = h('input', { type: 'text', value: (ex?.target) || tpl.target || '', placeholder: 'Target' });
      const kraSel = h('select', {}, [h('option', { value: '' }, 'Roll up to KRA…'), ...[1,2,3,4,5].map((n) => h('option', { value: String(n), selected: ex?.kra_index === n }, `KRA ${n}`))]);
      rows.push({ idx: i, labelI, targetI, kraSel });
      card.appendChild(h('div', { style: 'border-top:1px solid var(--border); padding-top:10px; margin-top:10px;' }, [
        h('div', { style: 'font-weight:600; margin-bottom:6px;' }, `KPI ${i}`),
        h('label', {}, [h('span', {}, 'Label'), labelI]),
        h('div', { class: 'form-row' }, [
          h('label', {}, [h('span', {}, 'Target'), targetI]),
          h('label', {}, [h('span', {}, 'Linked KRA (optional)'), kraSel]),
        ]),
      ]));
    }
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        try {
          for (const r of rows) {
            if (!r.labelI.value.trim()) continue;
            await api.upsertKPI({
              intern_id: intern.id, period_month: month, kpi_index: r.idx,
              label: r.labelI.value, target: r.targetI.value || null,
              kra_index: r.kraSel.value ? Number(r.kraSel.value) : null,
            });
          }
          closeModal(); app.renderView();
        } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Save all'),
    ]));
    openModal(card, { wide: true });
  },

  // ============== IDEAS ==============
  async renderIdeas(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Ideas'));
    root.appendChild(h('div', { class: 'greeting-sub' }, 'Review what your team is proposing. Approve, park, or reject — with notes.'));
    const ideas = await api.listIdeasForTeam(this.team.map((i) => i.id));
    if (!ideas.length) { root.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty-state' }, 'No ideas submitted yet.'))); return; }
    const card = h('div', { class: 'table-card' });
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Date'), h('th', {}, 'Intern'), h('th', {}, 'Idea'),
      h('th', {}, 'Status'), h('th', {}, 'Decision'),
    ])));
    const tb = h('tbody');
    ideas.forEach((i) => {
      const tr = h('tr');
      tr.appendChild(h('td', { style: 'white-space:nowrap;' }, formatDate(i.created_at)));
      tr.appendChild(h('td', { style: 'font-weight:500;' }, i.interns?.name || '—'));
      tr.appendChild(h('td', { style: 'max-width:340px;' }, [
        h('div', { style: 'font-weight:500;' }, i.title),
        i.description ? h('div', { class: 'help-text' }, i.description) : null,
        i.why_matters ? h('div', { class: 'help-text', style: 'margin-top:2px;' }, 'Why: ' + i.why_matters) : null,
      ]));
      tr.appendChild(h('td', {}, h('span', { class: 'badge badge-' + i.status }, i.status.replace('_', ' '))));
      tr.appendChild(h('td', {}, h('div', { class: 'approve-actions' }, [
        h('button', { class: 'btn-tiny ok', onclick: () => this.decideIdea(i.id, 'approved') }, 'Approve'),
        h('button', { class: 'btn-tiny neutral', onclick: () => this.decideIdea(i.id, 'parked') }, 'Park'),
        h('button', { class: 'btn-tiny no', onclick: () => this.decideIdea(i.id, 'rejected') }, 'Reject'),
      ])));
      tb.appendChild(tr);
    });
    table.appendChild(tb); card.appendChild(table); root.appendChild(card);
  },

  async decideIdea(id, status) {
    const notes = prompt(`Decision notes (${status})${status === 'rejected' ? ' — explain why' : ''}:`, '') || null;
    try { await api.decideIdea(id, status, notes, auth.user.id); app.renderView(); }
    catch (e) { alert('Failed: ' + e.message); }
  },

  // ============== DOCS ==============
  async renderDocs(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Docs'));
    root.appendChild(h('div', { class: 'greeting-sub' }, 'Share briefs / SOPs / references with your team. See read receipts.'));
    root.appendChild(h('div', { style: 'margin-bottom:14px;' }, h('button', { class: 'btn-accent', onclick: () => this.shareDocModal() }, '+ Share new doc')));
    const vTag = internVerticalTag(this.team[0]);
    const docs = await api.listDocsForTeam(vTag);
    if (!docs.length) { root.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty-state' }, 'No docs shared yet.'))); return; }
    const card = h('div', { class: 'table-card' });
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Shared'), h('th', {}, 'Title'), h('th', {}, 'For'),
      h('th', {}, 'Type'), h('th', {}, 'Link'), h('th', {}, 'Read receipts'),
    ])));
    const tb = h('tbody');
    for (const d of docs) {
      const acks = await api.listDocAcks(d.id);
      tb.appendChild(h('tr', {}, [
        h('td', { style: 'white-space:nowrap;' }, formatDate(d.created_at)),
        h('td', {}, [h('div', { style: 'font-weight:500;' }, d.title), d.notes ? h('div', { class: 'help-text' }, d.notes) : null]),
        h('td', {}, d.intern_id ? (d.interns?.name || 'intern') : (d.vertical || '—')),
        h('td', {}, h('span', { class: 'badge', style: 'background:var(--surface-3); color:var(--text-soft);' }, d.doc_type)),
        h('td', {}, d.drive_link ? h('a', { href: d.drive_link, target: '_blank' }, 'open ↗') : '—'),
        h('td', {}, `${acks.length} read`),
      ]));
    }
    table.appendChild(tb); card.appendChild(table); root.appendChild(card);
  },

  shareDocModal() {
    const card = h('div');
    card.appendChild(h('h3', {}, '+ Share a doc'));
    const title = h('input', { type: 'text', name: 'title', placeholder: 'e.g. Growth Ops onboarding brief' });
    const link = h('input', { type: 'url', name: 'drive_link', placeholder: 'https://drive.google.com/...' });
    const type = h('select', { name: 'doc_type' }, ['brief','sop','reference','reading','template','other'].map((t) => h('option', { value: t }, t)));
    const targetMode = h('select', {}, [h('option', { value: 'team' }, 'Whole team'), h('option', { value: 'intern' }, 'Specific intern')]);
    const internSel = h('select', { name: 'intern_id' }, this.team.map((i) => h('option', { value: i.id }, i.name)));
    internSel.parentElement; // visual stub
    const internLbl = h('label', {}, [h('span', {}, 'Intern'), internSel]);
    internLbl.style.display = 'none';
    targetMode.addEventListener('change', () => { internLbl.style.display = targetMode.value === 'intern' ? 'block' : 'none'; });
    const notes = h('textarea', { name: 'notes', placeholder: 'Optional context' });
    card.appendChild(h('label', {}, [h('span', {}, 'Title'), title]));
    card.appendChild(h('label', {}, [h('span', {}, 'Drive link'), link]));
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Type'), type]),
      h('label', {}, [h('span', {}, 'Share with'), targetMode]),
    ]));
    card.appendChild(internLbl);
    card.appendChild(h('label', {}, [h('span', {}, 'Notes'), notes]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        if (!title.value.trim()) { alert('Title required'); return; }
        const vTag = internVerticalTag(this.team[0]);
        const payload = {
          title: title.value, drive_link: link.value || null, doc_type: type.value, notes: notes.value || null,
          intern_id: targetMode.value === 'intern' ? internSel.value : null,
          vertical: targetMode.value === 'team' ? vTag : null,
        };
        try { await api.shareDoc(payload); closeModal(); app.renderView(); } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Share'),
    ]));
    openModal(card);
  },

  // ============== ACTIVITY ==============
  async renderActivity(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Activity feed'));
    root.appendChild(h('div', { class: 'greeting-sub' }, "Everything your team has done lately — attendance, check-ins, tasks, ideas, learnings, docs."));
    const events = await api.listActivityForTeam(this.team.map((i) => i.id), 60);
    if (!events.length) { root.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty-state' }, 'No recent activity.'))); return; }
    const internsById = {}; this.team.forEach((i) => { internsById[i.id] = i; });
    const list = h('div', { class: 'feed-list' });
    events.forEach((e) => list.appendChild(this.feedItem(e, internsById)));
    root.appendChild(list);
  },

  feedItem(e, internsById) {
    return h('div', { class: 'feed-item ' + e.source }, [
      h('div', { class: 'feed-meta' }, `${formatDateTime(e.created_at)} · ${e.source.toUpperCase()} · ${internsById[e.intern_id]?.name || ''}`),
      h('div', { style: 'font-weight:500;' }, e.title || e.source),
      e.body ? h('div', { class: 'help-text', style: 'margin-top:4px;' }, e.body) : null,
    ]);
  },
};
