// Super-Admin view — 4 tabs.
const superView = {
  interns: [],
  profilesById: {},
  charts: {},
  destroyCharts() { Object.values(this.charts).forEach((c) => { try { c.destroy(); } catch {} }); this.charts = {}; },

  async mount(rootEl) {
    this.destroyCharts();
    rootEl.innerHTML = '';
    this.interns = await api.listInterns();
    if (!this.interns.length) { rootEl.appendChild(h('div', { class: 'empty-state' }, 'No active Growth Lab interns found.')); return; }
    const supIds = Array.from(new Set(this.interns.map((i) => i.supervisor_id).filter(Boolean)));
    if (supIds.length) this.profilesById = await api.profilesById(supIds);

    const tab = app.currentTab || 'all';
    switch (tab) {
      case 'all': await this.renderAll(rootEl); break;
      case 'approvals': await this.renderApprovals(rootEl); break;
      case 'activity': await this.renderActivity(rootEl); break;
      case 'settings': await this.renderSettings(rootEl); break;
      default: await this.renderAll(rootEl);
    }
  },

  // ============== ALL INTERNS ==============
  async renderAll(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'All Interns — Growth Lab'));
    root.appendChild(h('div', { class: 'greeting-sub' },
      `${this.interns.length} active across ${new Set(this.interns.map(internVertical)).size} teams · Cohort 1, May 2026`));

    // Stat row
    let pending = []; try { pending = await api.listAllPending(); } catch {}
    const todayMap = {};
    const todayEntries = await api.listTeamAttendanceToday(this.interns.map((i) => i.id)).catch(() => []);
    todayEntries.forEach((e) => { todayMap[e.intern_id] = e; });
    const checkedIn = todayEntries.length;
    const approvedToday = todayEntries.filter((e) => e.approval_status === 'approved').length;

    root.appendChild(h('div', { class: 'stat-row' }, [
      statCard('Pending approvals', String(pending.length), 'across all teams'),
      statCard('Checked in today', `${checkedIn}/${this.interns.length}`, 'live'),
      statCard('Approved today', String(approvedToday), ''),
      statCard('Teams', String(new Set(this.interns.map(internVertical)).size), ''),
    ]));

    // Per-team grouped cards
    const byTeam = {};
    this.interns.forEach((i) => { const v = internVertical(i); (byTeam[v] = byTeam[v] || []).push(i); });
    for (const [team, list] of Object.entries(byTeam)) {
      const sec = h('div', { class: 'team-section' });
      const rmName = this.profilesById[list[0]?.supervisor_id]?.full_name || '—';
      sec.appendChild(h('div', { class: 'team-h' }, [
        h('h2', {}, team),
        h('span', { class: 'team-meta' }, `${list.length} intern${list.length === 1 ? '' : 's'} · RM: ${rmName}`),
      ]));
      const grid = h('div', { class: 'intern-grid' });
      for (const intern of list) grid.appendChild(await this.buildInternCard(intern, todayMap[intern.id]));
      sec.appendChild(grid); root.appendChild(sec);
    }
  },

  async buildInternCard(intern, todayEntry) {
    const summary = await api.getMonthSummaryForIntern(intern.id);
    const card = h('div', { class: 'intern-card', onclick: () => this.openInternDrill(intern) });
    card.appendChild(h('div', { class: 'name' }, intern.name));
    card.appendChild(h('div', { class: 'vertical' }, [
      intern.intern_code, ' · ',
      todayEntry ? h('span', { class: 'badge badge-' + todayEntry.approval_status }, todayEntry.approval_status)
                  : h('span', { class: 'badge badge-pending' }, 'Not in yet'),
    ]));
    const pctCls = summary.pct == null ? '' : (summary.pct < 80 ? 'bad' : summary.pct < 95 ? 'warn' : 'good');
    card.appendChild(h('div', { class: 'metrics' }, [
      h('div', {}, [h('div', { class: 'metric-l' }, 'Attendance'), h('div', { class: 'metric-v ' + pctCls }, summary.pct == null ? '—' : `${summary.pct}%`)]),
      h('div', {}, [h('div', { class: 'metric-l' }, 'Days present'), h('div', { class: 'metric-v' }, String(summary.present))]),
    ]));
    return card;
  },

  openInternDrill(intern) {
    const modal = h('div');
    modal.appendChild(h('h3', {}, intern.name + ' · ' + internVertical(intern)));
    modal.appendChild(h('p', { class: 'help-text' }, intern.intern_code + ' · RM: ' + (this.profilesById[intern.supervisor_id]?.full_name || '—')));
    modal.appendChild(h('p', {}, h('em', {}, 'Loading…')));
    openModal(modal, { wide: true });
    (async () => {
      modal.innerHTML = '';
      modal.appendChild(h('h3', {}, intern.name + ' · ' + internVertical(intern)));
      modal.appendChild(h('p', { class: 'help-text' }, intern.intern_code + ' · RM: ' + (this.profilesById[intern.supervisor_id]?.full_name || '—')));
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
      if (kras.length) {
        modal.appendChild(h('h4', { style: 'margin-top:18px;' }, 'KRAs progress'));
        kras.forEach((k) => modal.appendChild(h('div', { style: 'margin:8px 0;' }, [
          h('div', { style: 'display:flex; justify-content:space-between; font-size:13px;' }, [
            h('span', {}, `KRA ${k.kra_index}. ${k.title}`),
            h('span', { class: 'badge badge-' + (k.status || 'on_track') }, (k.status || 'on_track').replace('_', ' ')),
          ]),
          h('div', { class: 'progress', style: 'margin-top:4px;' }, h('div', { class: 'bar', style: { width: (k.percent_done || 0) + '%' } })),
        ])));
      }
      modal.appendChild(h('div', { class: 'modal-actions' }, [h('button', { class: 'btn-ghost', onclick: closeModal }, 'Close')]));
    })();
  },

  // ============== APPROVALS ==============
  async renderApprovals(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Approvals · Org-wide'));
    root.appendChild(h('div', { class: 'greeting-sub' }, 'Pending attendance across all teams.'));
    const pending = await api.listAllPending();
    if (!pending.length) { root.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty-state' }, '✓ No pending approvals.'))); return; }
    const card = h('div', { class: 'table-card' });
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Date'), h('th', {}, 'Intern'), h('th', {}, 'Team'), h('th', {}, 'RM'),
      h('th', {}, 'Hrs'), h('th', {}, 'Summary'), h('th', {}, ''),
    ])));
    const tb = h('tbody');
    pending.forEach((e) => {
      const tr = h('tr');
      tr.appendChild(h('td', { style: 'white-space:nowrap;' }, formatDate(e.attendance_date)));
      tr.appendChild(h('td', { style: 'font-weight:500;' }, e.interns.name));
      tr.appendChild(h('td', {}, internVertical(e.interns)));
      tr.appendChild(h('td', {}, this.profilesById[e.interns.supervisor_id]?.full_name || '—'));
      tr.appendChild(h('td', {}, e.hours_worked != null ? String(e.hours_worked) : '—'));
      tr.appendChild(h('td', { style: 'max-width:280px;' }, e.daily_work_summary || h('em', { style: 'color:var(--bad);' }, '(empty)')));
      tr.appendChild(h('td', {}, h('div', { class: 'approve-actions' }, [
        h('button', { class: 'btn-tiny ok', onclick: () => this.adminApprove(e.id, 'approved') }, 'Approve'),
        h('button', { class: 'btn-tiny no', onclick: () => this.adminApprove(e.id, 'rejected') }, 'Reject'),
      ])));
      tb.appendChild(tr);
    });
    table.appendChild(tb); card.appendChild(table); root.appendChild(card);
  },

  async adminApprove(id, action) {
    const remarks = action === 'rejected' ? prompt('Reject reason:') : (prompt('Optional remark (Enter to skip):', '') || '');
    if (action === 'rejected' && !remarks) return;
    try { await api.approveAttendance(id, action, remarks, auth.user.id); app.renderView(); }
    catch (e) { alert('Failed: ' + e.message); }
  },

  // ============== ACTIVITY ==============
  async renderActivity(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Activity Feed'));
    root.appendChild(h('div', { class: 'greeting-sub' }, 'Everything happening across all 9 interns and 4 teams.'));
    const events = await api.listAllActivity(100);
    if (!events.length) { root.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty-state' }, 'Nothing yet.'))); return; }
    const internsById = {}; this.interns.forEach((i) => { internsById[i.id] = i; });
    const list = h('div', { class: 'feed-list' });
    events.forEach((e) => list.appendChild(h('div', { class: 'feed-item ' + e.source }, [
      h('div', { class: 'feed-meta' }, `${formatDateTime(e.created_at)} · ${e.source.toUpperCase()} · ${internsById[e.intern_id]?.name || ''} · ${internVertical(internsById[e.intern_id])}`),
      h('div', { style: 'font-weight:500;' }, e.title || e.source),
      e.body ? h('div', { class: 'help-text', style: 'margin-top:4px;' }, e.body) : null,
    ])));
    root.appendChild(list);
  },

  // ============== SETTINGS ==============
  async renderSettings(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Settings'));
    root.appendChild(h('div', { class: 'greeting-sub' }, 'Roster overview. Edit access lives in Supabase Auth (talk to admin).'));
    const card = h('div', { class: 'table-card' });
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Intern'), h('th', {}, 'Code'), h('th', {}, 'Team'), h('th', {}, 'RM'),
      h('th', {}, 'Email'), h('th', {}, 'Start'),
    ])));
    const tb = h('tbody');
    this.interns.forEach((i) => tb.appendChild(h('tr', {}, [
      h('td', { style: 'font-weight:500;' }, i.name),
      h('td', {}, i.intern_code),
      h('td', {}, internVertical(i)),
      h('td', {}, this.profilesById[i.supervisor_id]?.full_name || '—'),
      h('td', {}, i.email_alias || '—'),
      h('td', {}, formatDate(i.start_date)),
    ])));
    table.appendChild(tb); card.appendChild(table); root.appendChild(card);
  },
};
