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

    const internIds = this.team.map((i) => i.id);
    const [todayAttn, pending, openTasks, recentCheckins, flags] = await Promise.all([
      api.listTeamAttendanceToday(internIds).catch(() => []),
      api.listPendingForSupervisor(auth.user.id).catch(() => []),
      api.listTasksForTeam(internIds, { activeOnly: true }).catch(() => []),
      api.listTeamCheckinsRecent(internIds, 14).catch(() => []),
      this.computeFlagsForTeam(internIds).catch(() => ({})),
    ]);
    const flaggedCount = Object.keys(flags).length;

    // Stat row
    const row = h('div', { class: 'stat-row' }, [
      statCard('Pending approvals', String(pending.length), 'click Approvals tab'),
      statCard('Open tasks', String(openTasks.length), 'across team'),
      statCard('Checked in today', String(todayAttn.length) + '/' + this.team.length, ''),
      statCard('At-risk', String(flaggedCount), flaggedCount ? '⚠️ needs attention' : 'all clear', flaggedCount ? 'bad' : null),
    ]);
    root.appendChild(row);

    // Workload widget
    root.appendChild(this.renderWorkloadWidget(openTasks));

    // At-risk panel (if any)
    if (flaggedCount) root.appendChild(this.renderAtRiskPanel(flags));

    // Intern cards
    const grid = h('div', { class: 'intern-grid' });
    for (const intern of this.team) grid.appendChild(await this.buildInternCard(intern, todayAttn, flags[intern.id], openTasks));
    root.appendChild(grid);
  },

  renderWorkloadWidget(openTasks) {
    const card = h('div', { class: 'card' });
    card.appendChild(h('h3', { class: 'section-h' }, '⚖️ Workload balance'));
    card.appendChild(h('p', { class: 'section-sub' }, 'Open task count per intern. Spot imbalance.'));
    const counts = {};
    this.team.forEach((i) => { counts[i.id] = 0; });
    openTasks.forEach((t) => { if (counts[t.intern_id] != null) counts[t.intern_id]++; });
    const max = Math.max(1, ...Object.values(counts));
    this.team.forEach((i) => {
      const c = counts[i.id] || 0;
      const widthPct = Math.round((c / max) * 100);
      const overload = c >= max && c >= 5;
      card.appendChild(h('div', { style: 'margin:8px 0;' }, [
        h('div', { style: 'display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;' }, [
          h('span', { style: 'font-weight:500;' }, i.name),
          h('span', { style: overload ? 'color:var(--bad); font-weight:600;' : '' }, `${c} task${c === 1 ? '' : 's'}${overload ? ' · 🔥 overloaded' : ''}`),
        ]),
        h('div', { class: 'progress' }, h('div', { class: 'bar' + (overload ? ' bad' : '') , style: { width: widthPct + '%' } })),
      ]));
    });
    return card;
  },

  renderAtRiskPanel(flags) {
    const card = h('div', { class: 'card' });
    card.appendChild(h('h3', { class: 'section-h' }, '⚠️ At-risk interns'));
    card.appendChild(h('p', { class: 'section-sub' }, 'Auto-flagged from signals. Act on these before they snowball.'));
    Object.entries(flags).forEach(([internId, internFlags]) => {
      const intern = this.team.find((i) => i.id === internId);
      if (!intern) return;
      card.appendChild(h('div', { style: 'padding:10px 0; border-bottom:1px solid var(--border);' }, [
        h('div', { style: 'display:flex; align-items:center; justify-content:space-between;' }, [
          h('div', { style: 'font-weight:500;' }, intern.name),
          h('span', { class: 'badge badge-rejected' }, `${internFlags.length} flag${internFlags.length === 1 ? '' : 's'}`),
        ]),
        h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;' },
          internFlags.map((f) => h('span', { class: 'badge badge-' + (f.kind === 'no_checkin' || f.kind === 'low_attn' ? 'rejected' : 'pending') }, f.label)),
        ),
      ]));
    });
    return card;
  },

  async computeFlagsForTeam(internIds) {
    const today = new Date();
    const past14 = new Date(); past14.setDate(past14.getDate() - 14);
    const past14Str = past14.toISOString().slice(0, 10);
    const monthStart = monthStartStr();

    const [monthEntries, todayEntries, checkinsRecent, kras, ideas] = await Promise.all([
      getSupabase().from('gl_attendance').select('*').in('intern_id', internIds).gte('attendance_date', past14Str).then((r) => r.data || []),
      api.listTeamAttendanceToday(internIds),
      getSupabase().from('gl_daily_checkin').select('intern_id,checkin_date').in('intern_id', internIds).gte('checkin_date', past14Str).then((r) => r.data || []),
      getSupabase().from('gl_kra').select('intern_id,percent_done').in('intern_id', internIds).eq('period_month', monthStart).then((r) => r.data || []),
      getSupabase().from('gl_idea').select('intern_id,created_at').in('intern_id', internIds).then((r) => r.data || []),
    ]);

    const todayMap = {}; todayEntries.forEach((e) => { todayMap[e.intern_id] = e; });
    const flagsByIntern = {};
    for (const intern of this.team) {
      const flags = [];
      const monthly = monthEntries.filter((e) => e.intern_id === intern.id);
      const present = monthly.filter((e) => e.status === 'present').length;
      const half = monthly.filter((e) => e.status === 'half-day').length;
      const absent = monthly.filter((e) => e.status === 'absent').length;
      const totalCounted = present + absent + half;
      const attnPct = totalCounted ? Math.round(((present + half * 0.5) / totalCounted) * 100) : null;
      const myCheckins = checkinsRecent.filter((c) => c.intern_id === intern.id);
      const lastCheckinDate = myCheckins.length ? myCheckins.sort((a, b) => b.checkin_date.localeCompare(a.checkin_date))[0].checkin_date : null;
      const daysSince = lastCheckinDate ? daysBetween(today, lastCheckinDate) : 999;
      if (daysSince >= 3) flags.push({ kind: 'no_checkin', label: `No check-in for ${daysSince}d` });
      if (attnPct != null && attnPct < 80) flags.push({ kind: 'low_attn', label: `Attendance ${attnPct}%` });
      const myKRAs = kras.filter((k) => k.intern_id === intern.id);
      const kraAvg = myKRAs.length ? Math.round(myKRAs.reduce((s, k) => s + (k.percent_done || 0), 0) / myKRAs.length) : null;
      if (kraAvg != null && kraAvg < 50 && today.getDate() > 15) flags.push({ kind: 'kra_behind', label: `KRA avg ${kraAvg}%` });
      const myIdeas = ideas.filter((i) => i.intern_id === intern.id).length;
      if (myIdeas === 0 && daysBetween(today, intern.start_date) > 14) flags.push({ kind: 'no_ideas', label: 'No ideas in 14d' });
      if (today.getDay() !== 0 && !todayMap[intern.id]) flags.push({ kind: 'today_missing', label: 'Not checked in today' });
      if (flags.length) flagsByIntern[intern.id] = flags;
    }
    return flagsByIntern;
  },

  async buildInternCard(intern, todayEntries, internFlags, openTasks) {
    const today = (todayEntries || []).find((e) => e.intern_id === intern.id);
    const summary = await api.getMonthSummaryForIntern(intern.id);
    const taskCount = (openTasks || []).filter((t) => t.intern_id === intern.id).length;
    const card = h('div', { class: 'intern-card', onclick: () => this.openInternDrill(intern) });
    card.appendChild(h('div', { class: 'name' }, [
      intern.name,
      internFlags?.length ? h('span', { class: 'badge badge-rejected', style: 'margin-left:8px; font-size:10px;' }, '⚠ ' + internFlags.length) : null,
    ]));
    card.appendChild(h('div', { class: 'vertical' }, [
      intern.intern_code, ' · ',
      today ? h('span', { class: 'badge badge-' + today.approval_status }, today.approval_status) : h('span', { class: 'badge badge-pending' }, 'Not in yet'),
    ]));
    const pctCls = summary.pct == null ? '' : (summary.pct < 80 ? 'bad' : summary.pct < 95 ? 'warn' : 'good');
    card.appendChild(h('div', { class: 'metrics' }, [
      h('div', {}, [h('div', { class: 'metric-l' }, 'Attendance'), h('div', { class: 'metric-v ' + pctCls }, summary.pct == null ? '—' : `${summary.pct}%`)]),
      h('div', {}, [h('div', { class: 'metric-l' }, 'Open tasks'), h('div', { class: 'metric-v' }, String(taskCount))]),
    ]));
    return card;
  },

  openInternDrill(intern) {
    const modal = h('div');
    modal.appendChild(h('h3', {}, intern.name));
    modal.appendChild(h('p', { class: 'help-text' }, intern.intern_code + ' · ' + internVertical(intern)));
    modal.appendChild(h('p', {}, h('em', {}, 'Loading…')));
    openModal(modal, { wide: true });
    (async () => {
      modal.innerHTML = '';
      modal.appendChild(h('h3', {}, intern.name + ' · ' + internVertical(intern)));
      const [att, kras, tasks, ideas, learns, oos, reviews] = await Promise.all([
        api.getMonthSummaryForIntern(intern.id), api.listKRAs(intern.id),
        api.listTasksForIntern(intern.id), api.listIdeasForIntern(intern.id), api.listLearnings(intern.id, 50),
        api.list1on1s(intern.id).catch(() => []), api.listReviews(intern.id).catch(() => []),
      ]);
      modal.appendChild(h('div', { class: 'stat-row', style: 'margin-top:12px;' }, [
        statCard('Attendance', att.pct == null ? '—' : att.pct + '%', 'this month'),
        statCard('Open tasks', String(tasks.filter((t) => !['done','cancelled'].includes(t.status)).length), ''),
        statCard('Ideas', String(ideas.length), ''),
        statCard('1:1s', String(oos.length), 'logged'),
      ]));
      // Quick actions
      modal.appendChild(h('div', { class: 'card-actions', style: 'padding:14px 0;' }, [
        h('button', { class: 'btn-accent', onclick: () => { closeModal(); this.openOneOnOne(intern); } }, '+ Log 1:1'),
        h('button', { class: 'btn-accent', onclick: () => { closeModal(); this.openPerfReview(intern); } }, '+ Performance review'),
      ]));
      // KRAs progress
      if (kras.length) {
        modal.appendChild(h('h4', { style: 'margin-top:14px;' }, 'KRAs progress'));
        kras.forEach((k) => modal.appendChild(h('div', { style: 'margin:8px 0;' }, [
          h('div', { style: 'display:flex; justify-content:space-between; font-size:13px;' }, [
            h('span', {}, `KRA ${k.kra_index}. ${k.title}`),
            h('span', { class: 'badge badge-' + (k.status || 'on_track') }, (k.status || 'on_track').replace('_', ' ')),
          ]),
          h('div', { class: 'progress', style: 'margin-top:4px;' },
            h('div', { class: 'bar', style: { width: (k.percent_done || 0) + '%' } })),
        ])));
      }
      // Recent 1:1s
      if (oos.length) {
        modal.appendChild(h('h4', { style: 'margin-top:18px;' }, 'Recent 1:1s'));
        oos.slice(0, 3).forEach((o) => modal.appendChild(h('div', { style: 'padding:8px 0; border-bottom:1px solid var(--border); font-size:13px;' }, [
          h('div', { style: 'font-weight:500;' }, formatDate(o.meeting_date) + (o.intern_mood ? ' · mood: ' + o.intern_mood : '')),
          o.discussion_notes ? h('div', { class: 'help-text' }, o.discussion_notes.slice(0, 200)) : null,
        ])));
      }
      // Reviews
      if (reviews.length) {
        modal.appendChild(h('h4', { style: 'margin-top:18px;' }, 'Performance reviews'));
        reviews.forEach((r) => modal.appendChild(h('div', { style: 'padding:8px 0; border-bottom:1px solid var(--border); font-size:13px;' }, [
          h('div', { style: 'display:flex; justify-content:space-between;' }, [
            h('span', { style: 'font-weight:500;' }, r.review_period),
            h('span', { class: 'badge badge-' + (r.overall_rating >= 4 ? 'approved' : r.overall_rating >= 3 ? 'pending' : 'rejected') },
              `${r.overall_rating || '—'}/5`),
          ]),
          r.rm_summary ? h('div', { class: 'help-text' }, r.rm_summary.slice(0, 200)) : null,
        ])));
      }
      modal.appendChild(h('div', { class: 'modal-actions' }, [h('button', { class: 'btn-ghost', onclick: closeModal }, 'Close')]));
    })();
  },

  openOneOnOne(intern) {
    const card = h('div');
    card.appendChild(h('h3', {}, `+ Log 1:1 with ${intern.name}`));
    const date = h('input', { type: 'date', name: 'meeting_date', value: todayStr() });
    const dur = h('input', { type: 'number', name: 'duration_minutes', value: '30', min: '5', step: '5' });
    const mood = h('select', { name: 'intern_mood' }, [
      h('option', { value: '' }, '— mood —'),
      ...['great','good','ok','struggling','stuck'].map((m) => h('option', { value: m }, m)),
    ]);
    const disc = h('textarea', { name: 'discussion_notes', placeholder: 'What you talked about', style: 'min-height:80px;' });
    const fb = h('textarea', { name: 'rm_feedback', placeholder: 'Your feedback to intern this week' });
    const block = h('textarea', { name: 'blockers_raised', placeholder: 'Blockers intern raised' });
    const act = h('textarea', { name: 'action_items', placeholder: 'Agreed next steps' });
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Date'), date]),
      h('label', {}, [h('span', {}, 'Duration (min)'), dur]),
    ]));
    card.appendChild(h('label', {}, [h('span', {}, 'Intern mood'), mood]));
    card.appendChild(h('label', {}, [h('span', {}, 'Discussion notes'), disc]));
    card.appendChild(h('label', {}, [h('span', {}, 'Your feedback to intern'), fb]));
    card.appendChild(h('label', {}, [h('span', {}, 'Blockers raised'), block]));
    card.appendChild(h('label', {}, [h('span', {}, 'Action items'), act]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        try {
          await api.upsert1on1({
            intern_id: intern.id, rm_id: auth.user.id, created_by_id: auth.user.id,
            meeting_date: date.value, duration_minutes: Number(dur.value),
            intern_mood: mood.value || null,
            discussion_notes: disc.value || null, rm_feedback: fb.value || null,
            blockers_raised: block.value || null, action_items: act.value || null,
          });
          closeModal(); app.renderView();
        } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Save 1:1'),
    ]));
    openModal(card, { wide: true });
  },

  openPerfReview(intern) {
    const card = h('div');
    card.appendChild(h('h3', {}, `+ Performance review · ${intern.name}`));
    card.appendChild(h('p', { class: 'help-text' }, 'Use this for monthly, mid-year, or end-of-internship review.'));
    const period = h('input', { type: 'text', name: 'review_period', placeholder: 'e.g. May-2026 · Mid-Year · End-of-Internship' });
    const rating = h('input', { type: 'number', name: 'overall_rating', min: '1', max: '5', step: '1', value: '4' });
    const rec = h('select', { name: 'promotion_recommendation' }, [
      h('option', { value: '' }, '— recommendation —'),
      ...['strong_yes','yes','neutral','no','strong_no'].map((r) => h('option', { value: r }, r.replace('_', ' '))),
    ]);
    const strengths = h('textarea', { name: 'strengths', placeholder: 'What did they do really well?' });
    const improve = h('textarea', { name: 'areas_to_improve', placeholder: 'Where can they grow?' });
    const ach = h('textarea', { name: 'achievements', placeholder: 'Specific wins this period' });
    const focus = h('textarea', { name: 'next_period_focus', placeholder: 'What should they focus on next?' });
    const summary = h('textarea', { name: 'rm_summary', placeholder: 'Your one-paragraph summary', style: 'min-height:80px;' });
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Review period'), period]),
      h('label', {}, [h('span', {}, 'Overall rating (1-5)'), rating]),
    ]));
    card.appendChild(h('label', {}, [h('span', {}, 'Promotion / continuation recommendation'), rec]));
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Strengths'), strengths]),
      h('label', {}, [h('span', {}, 'Areas to improve'), improve]),
    ]));
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Achievements'), ach]),
      h('label', {}, [h('span', {}, 'Next period focus'), focus]),
    ]));
    card.appendChild(h('label', {}, [h('span', {}, 'RM summary'), summary]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        if (!period.value.trim()) { alert('Review period required'); return; }
        try {
          await api.upsertReview({
            intern_id: intern.id, rm_id: auth.user.id, review_period: period.value,
            overall_rating: Number(rating.value), strengths: strengths.value || null,
            areas_to_improve: improve.value || null, achievements: ach.value || null,
            next_period_focus: focus.value || null, rm_summary: summary.value || null,
            promotion_recommendation: rec.value || null,
          });
          closeModal(); app.renderView();
        } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Save review'),
    ]));
    openModal(card, { wide: true });
  },

  // ============== APPROVALS ==============
  async renderApprovals(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Approvals'));
    root.appendChild(h('div', { class: 'greeting-sub' }, "Review attendance entries. You can also edit/override any past entry or mark on behalf."));

    const pending = await api.listPendingForSupervisor(auth.user.id);
    const card = h('div', { class: 'table-card' });
    card.appendChild(h('h3', { class: 'section-h' }, `${pending.length} pending`));

    // Bulk approve action — for entries that have a non-empty summary
    if (pending.length > 0) {
      const bulkable = pending.filter((e) => e.daily_work_summary && e.daily_work_summary.trim());
      card.appendChild(h('div', { class: 'card-actions' }, [
        h('button', {
          class: 'btn-success',
          disabled: !bulkable.length,
          onclick: () => this.bulkApprove(bulkable),
        }, `✓ Approve all ${bulkable.length} with summary`),
        h('span', { class: 'help-text', style: 'align-self:center;' },
          pending.length - bulkable.length > 0 ? `(${pending.length - bulkable.length} have empty summary — review individually)` : ''),
      ]));
    }

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

  async bulkApprove(entries) {
    if (!entries.length) return;
    if (!confirm(`Approve ${entries.length} attendance entries in one go? (Only entries with non-empty summaries.)`)) return;
    let ok = 0, fail = 0;
    for (const e of entries) {
      try { await api.approveAttendance(e.id, 'approved', null, auth.user.id); ok++; }
      catch (err) { fail++; console.warn(err); }
    }
    alert(`✓ Approved ${ok}${fail ? ` · ${fail} failed` : ''}.`);
    app.renderView();
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

    // ===== Template loader (top) =====
    const myVTag = internVerticalTag(this.team[0]);
    const tplSel = h('select', {}, [h('option', { value: '' }, '— Start from blank or pick a template —')]);
    const tplBlock = h('div', { class: 'card-actions', style: 'padding:0 0 14px; border-bottom:1px solid var(--border); margin-bottom:14px;' }, [
      h('label', { style: 'flex:1; margin:0;' }, [h('span', {}, '📋 Use template'), tplSel]),
      h('button', { class: 'btn-ghost', onclick: async () => { closeModal(); this.openTemplatesManager(); } }, 'Manage templates'),
    ]);
    card.appendChild(tplBlock);

    // ===== Main fields =====
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

    // Save-as-template checkbox + name
    const saveTpl = h('input', { type: 'checkbox', id: 'gl-save-tpl' });
    const tplName = h('input', { type: 'text', placeholder: 'Template name (defaults to task title)', style: 'flex:1;' });
    const saveTplRow = h('div', { style: 'margin-top:14px; padding:12px; background:var(--surface-2); border-radius:8px;' }, [
      h('label', { style: 'display:flex; align-items:center; gap:8px; margin:0;' }, [
        saveTpl, h('span', { style: 'margin:0;' }, '💾 Save this as a template for next time'),
      ]),
      h('div', { style: 'display:flex; gap:8px; margin-top:8px;' }, [tplName]),
    ]);
    card.appendChild(saveTplRow);

    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        if (!title.value.trim()) { alert('Title required'); return; }
        try {
          // Compute due date from template days_to_due if loaded
          let dueDate = due.value || null;
          await api.createTask({
            intern_id: internSel.value, assigned_by_id: auth.user.id, task_type: type.value,
            title: title.value, description: desc.value || null,
            due_date: dueDate, priority: pri.value,
          });
          // Optionally save as template
          if (saveTpl.checked) {
            const days = dueDate ? Math.max(1, Math.round((new Date(dueDate) - new Date()) / 86400000)) : 7;
            try {
              await api.createTaskTemplate({
                title: tplName.value.trim() || title.value,
                description: desc.value || null,
                default_task_type: type.value,
                default_priority: pri.value,
                default_days_to_due: days,
                vertical: myVTag,
              });
            } catch (e) { console.warn('Save template failed:', e.message); }
          }
          // Bump use_count if loaded from template
          const chosenTplId = tplSel.value;
          if (chosenTplId) api.incrementTaskTemplateUse(chosenTplId);
          closeModal(); app.renderView();
        } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Assign'),
    ]));

    openModal(card);

    // Load templates async + populate selector
    (async () => {
      try {
        const tpls = await api.listTaskTemplates(myVTag);
        tpls.forEach((t) => tplSel.appendChild(h('option', { value: t.id },
          `${t.title}${t.use_count ? ` · used ${t.use_count}×` : ''}${t.vertical ? '' : ' (global)'}`)));
        tplSel.addEventListener('change', () => {
          const tpl = tpls.find((x) => x.id === tplSel.value);
          if (!tpl) return;
          if (!title.value) title.value = tpl.title;
          if (!desc.value && tpl.description) desc.value = tpl.description;
          type.value = tpl.default_task_type || 'weekly';
          pri.value = tpl.default_priority || 'med';
          if (!due.value && tpl.default_days_to_due) {
            const d = new Date(); d.setDate(d.getDate() + tpl.default_days_to_due);
            due.value = d.toISOString().slice(0, 10);
          }
        });
      } catch (e) { console.debug('Templates load failed (run migration_v3?):', e.message); }
    })();
  },

  openTemplatesManager() {
    const card = h('div');
    card.appendChild(h('h3', {}, '📋 Task templates'));
    card.appendChild(h('p', { class: 'help-text' }, 'Templates you and other RMs have saved. Click to delete your own.'));
    const list = h('div'); card.appendChild(list);
    card.appendChild(h('div', { class: 'modal-actions' }, [h('button', { class: 'btn-ghost', onclick: closeModal }, 'Close')]));
    openModal(card, { wide: true });
    (async () => {
      const tpls = await api.listTaskTemplates(internVerticalTag(this.team[0]));
      list.innerHTML = '';
      if (!tpls.length) { list.appendChild(h('div', { class: 'empty-state' }, 'No templates yet. When assigning a task, tick "Save as template".')); return; }
      tpls.forEach((t) => list.appendChild(h('div', { style: 'padding:12px 0; border-bottom:1px solid var(--border);' }, [
        h('div', { style: 'display:flex; justify-content:space-between; gap:8px;' }, [
          h('div', { style: 'font-weight:500;' }, t.title),
          h('div', { style: 'display:flex; gap:6px; align-items:center;' }, [
            h('span', { class: 'badge', style: 'background:var(--surface-3); color:var(--text-soft);' }, `used ${t.use_count || 0}×`),
            t.owner_id === auth.user.id ? h('button', { class: 'btn-tiny no', onclick: async () => {
              if (!confirm('Delete this template? (does not affect tasks already assigned from it)')) return;
              try { await getSupabase().from('gl_task_template').delete().eq('id', t.id); closeModal(); this.openTemplatesManager(); }
              catch (e) { alert(e.message); }
            } }, 'Delete') : null,
          ]),
        ]),
        h('div', { class: 'help-text', style: 'margin-top:4px;' },
          `${t.default_task_type} · ${t.default_priority} priority · due in ${t.default_days_to_due || 7}d · ${TAG_TO_VERTICAL[t.vertical] || 'global'}`),
        t.description ? h('div', { style: 'font-size:13px; color:var(--text-soft); margin-top:6px;' }, t.description) : null,
      ])));
    })();
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
      h('button', { class: 'btn-ghost', onclick: () => openCommentThread('task', t.id, t.intern_id, t.title) }, '💬 Comments'),
      h('div', { style: 'flex:1;' }),
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

    const unread = checkins.filter((c) => !c.rm_acknowledged);
    const card = h('div', { class: 'table-card' });
    if (unread.length) {
      card.appendChild(h('div', { class: 'card-actions' }, [
        h('button', { class: 'btn-success', onclick: () => this.bulkAckCheckins(unread) }, `✓ Acknowledge all ${unread.length} unread`),
      ]));
    }
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Date'), h('th', {}, 'Intern'), h('th', {}, 'What done'),
      h('th', {}, 'Learnt'), h('th', {}, 'Blockers'), h('th', {}, 'Tomorrow'),
      h('th', {}, 'Hrs'), h('th', {}, 'File / link'), h('th', {}, 'Ack'),
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
      tr.appendChild(h('td', {}, c.linked_doc
        ? h('a', { href: c.linked_doc, target: '_blank', style: 'color:var(--accent); font-weight:500;' }, '📎 open ↗')
        : h('span', { class: 'help-text' }, '—')));
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

  async bulkAckCheckins(unread) {
    if (!confirm(`Acknowledge ${unread.length} daily check-ins in bulk?`)) return;
    let ok = 0;
    for (const c of unread) {
      try { await api.acknowledgeCheckin(c.id, null); ok++; }
      catch (e) { console.warn(e); }
    }
    alert(`✓ Acknowledged ${ok}.`);
    app.renderView();
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

    // Fetch all sharer profile names in one go
    const sharerIds = Array.from(new Set(docs.map((d) => d.shared_by_id).filter(Boolean)));
    const sharersById = sharerIds.length ? await api.profilesById(sharerIds) : {};

    const card = h('div', { class: 'table-card' });
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Shared'), h('th', {}, 'Title'), h('th', {}, 'For'),
      h('th', {}, 'Shared by'), h('th', {}, 'Type'), h('th', {}, 'Link'),
      h('th', {}, 'Read'), h('th', {}, ''),
    ])));
    const tb = h('tbody');
    for (const d of docs) {
      const acks = await api.listDocAcks(d.id);
      const isMine = d.shared_by_id === auth.user.id;
      const canDelete = isMine || auth.isSuper();
      const sharerName = sharersById[d.shared_by_id]?.full_name || (isMine ? 'You' : '—');
      const audience = d.intern_id ? (d.interns?.name || 'intern')
                       : d.vertical === 'all' ? '🌐 Whole cohort'
                       : d.vertical ? (TAG_TO_VERTICAL[d.vertical] || d.vertical)
                       : '—';
      tb.appendChild(h('tr', {}, [
        h('td', { style: 'white-space:nowrap;' }, formatDate(d.created_at)),
        h('td', {}, [h('div', { style: 'font-weight:500;' }, d.title), d.notes ? h('div', { class: 'help-text' }, d.notes) : null]),
        h('td', {}, audience),
        h('td', { style: isMine ? 'font-weight:600;' : '' }, sharerName),
        h('td', {}, h('span', { class: 'badge', style: 'background:var(--surface-3); color:var(--text-soft);' }, d.doc_type)),
        h('td', {}, d.drive_link ? h('a', { href: d.drive_link, target: '_blank' }, 'open ↗') : '—'),
        h('td', {}, `${acks.length} read`),
        h('td', {}, canDelete
          ? h('button', { class: 'btn-tiny no', onclick: () => confirmModal(
              `Delete "${d.title}"? Interns will lose access. This cannot be undone.`,
              async () => { try { await api.deleteDoc(d.id); app.renderView(); } catch (e) { alert(e.message); } }
            ) }, 'Delete')
          : h('span', { class: 'help-text' }, '—')),
      ]));
    }
    table.appendChild(tb); card.appendChild(table); root.appendChild(card);
  },

  shareDocModal() {
    const isAdmin = auth.isSuper();
    const myTeamTag = internVerticalTag(this.team[0]);
    const myTeamName = TAG_TO_VERTICAL[myTeamTag] || 'My team';

    const card = h('div');
    card.appendChild(h('h3', {}, '+ Share a doc'));
    const title = h('input', { type: 'text', name: 'title', placeholder: 'e.g. Onboarding brief' });
    const link = h('input', { type: 'url', name: 'drive_link', placeholder: 'https://drive.google.com/...' });
    const type = h('select', { name: 'doc_type' }, ['brief','sop','reference','reading','template','other'].map((t) => h('option', { value: t }, t)));

    // Share-with options:
    //   - Specific intern (always)
    //   - My team (always)
    //   - Specific other team (admin only)
    //   - All cohort (admin only)
    const targetOpts = [
      h('option', { value: 'team' }, `My team (${myTeamName})`),
      h('option', { value: 'intern' }, 'Specific intern'),
    ];
    if (isAdmin) {
      targetOpts.push(h('option', { value: 'other_team' }, 'Different team'));
      targetOpts.push(h('option', { value: 'all' }, '🌐 Whole cohort (all teams)'));
    }
    const targetMode = h('select', {}, targetOpts);

    const internSel = h('select', { name: 'intern_id' }, this.team.map((i) => h('option', { value: i.id }, i.name)));
    const internLbl = h('label', {}, [h('span', {}, 'Intern'), internSel]);
    internLbl.style.display = 'none';

    const teamSel = h('select', {}, ['growth_ops','performance','organic','product_content'].map(
      (t) => h('option', { value: t }, TAG_TO_VERTICAL[t] || t)));
    const teamLbl = h('label', {}, [h('span', {}, 'Which team'), teamSel]);
    teamLbl.style.display = 'none';

    targetMode.addEventListener('change', () => {
      internLbl.style.display = targetMode.value === 'intern' ? 'block' : 'none';
      teamLbl.style.display = targetMode.value === 'other_team' ? 'block' : 'none';
    });

    const notes = h('textarea', { name: 'notes', placeholder: 'Optional context' });

    card.appendChild(h('label', {}, [h('span', {}, 'Title'), title]));
    card.appendChild(h('label', {}, [h('span', {}, 'Drive link'), link]));
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Type'), type]),
      h('label', {}, [h('span', {}, 'Share with'), targetMode]),
    ]));
    card.appendChild(internLbl);
    card.appendChild(teamLbl);
    card.appendChild(h('label', {}, [h('span', {}, 'Notes'), notes]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        if (!title.value.trim()) { alert('Title required'); return; }
        // Resolve target
        let intern_id = null, vertical = null;
        if (targetMode.value === 'intern') intern_id = internSel.value;
        else if (targetMode.value === 'team') vertical = myTeamTag;
        else if (targetMode.value === 'other_team') vertical = teamSel.value;
        else if (targetMode.value === 'all') vertical = 'all';
        const payload = {
          title: title.value, drive_link: link.value || null, doc_type: type.value,
          notes: notes.value || null, intern_id, vertical,
        };
        try { await api.shareDoc(payload); closeModal(); app.renderView(); }
        catch (e) { alert('Failed: ' + e.message); }
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
