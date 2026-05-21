// Super-Admin view — 4 tabs. CEO-grade insights on "All Interns".
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
      case 'all': await this.renderInsights(rootEl); break;
      case 'approvals': await this.renderApprovals(rootEl); break;
      case 'activity': await this.renderActivity(rootEl); break;
      case 'settings': await this.renderSettings(rootEl); break;
      default: await this.renderInsights(rootEl);
    }
  },

  // ============== COHORT INSIGHTS (was "All Interns") ==============
  async renderInsights(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Cohort Insights'));
    root.appendChild(h('div', { class: 'greeting-sub' },
      `${this.interns.length} active interns · ${new Set(this.interns.map(internVertical)).size} teams · Cohort 1, May 2026`));

    // Compute everything once
    const intelligence = await this.computeIntelligence();

    // ===== Hero stat row =====
    root.appendChild(this.renderHeroStats(intelligence));

    // ===== Two-col layout: Top Performers (left) + At Risk (right) =====
    const splitRow = h('div', { class: 'grid-2' });
    splitRow.appendChild(this.renderTopPerformers(intelligence));
    splitRow.appendChild(this.renderAtRisk(intelligence));
    root.appendChild(splitRow);

    // ===== Trend chart: attendance % over last 14 days =====
    const trendCard = h('div', { class: 'chart-card' });
    trendCard.appendChild(h('h3', { class: 'section-h' }, 'Attendance trend · last 14 days'));
    trendCard.appendChild(h('p', { class: 'section-sub' }, 'Daily attendance % per team. Watch for downward trends — early signal.'));
    const trendWrap = h('div', { class: 'chart-canvas-wrap', style: 'height:280px;' });
    const trendCanvas = h('canvas');
    trendWrap.appendChild(trendCanvas);
    trendCard.appendChild(trendWrap);
    root.appendChild(trendCard);

    // ===== Per-team breakdown =====
    root.appendChild(this.renderTeamScorecard(intelligence));

    // ===== Intern cards grid (unchanged) =====
    const grid = h('div', { class: 'intern-grid' });
    for (const intern of this.interns) grid.appendChild(await this.buildInternCard(intern, intelligence.todayMap[intern.id], intelligence.scoreByIntern[intern.id]));
    root.appendChild(h('h3', { class: 'section-h', style: 'margin-top:24px;' }, 'All interns'));
    root.appendChild(grid);

    // Render trend chart after DOM attached
    setTimeout(() => this.drawTrend(trendCanvas, intelligence.trend), 0);
  },

  async computeIntelligence() {
    // Pre-fetch everything once
    const internIds = this.interns.map((i) => i.id);
    const monthStart = monthStartStr();
    const past14 = new Date(); past14.setDate(past14.getDate() - 14);
    const past14Str = past14.toISOString().slice(0, 10);

    const [todayEntries, monthEntries, pending, tasks, kras, kpis, ideas, checkinsRecent] = await Promise.all([
      api.listTeamAttendanceToday(internIds).catch(() => []),
      this.fetchRange('gl_attendance', '*', { in: ['intern_id', internIds], gte: ['attendance_date', past14Str] }),
      api.listAllPending().catch(() => []),
      this.fetchRange('gl_task', '*', { in: ['intern_id', internIds] }),
      this.fetchRange('gl_kra', '*', { in: ['intern_id', internIds], eq: ['period_month', monthStart] }),
      this.fetchRange('gl_kpi', '*', { in: ['intern_id', internIds], eq: ['period_month', monthStart] }),
      this.fetchRange('gl_idea', '*', { in: ['intern_id', internIds] }),
      this.fetchRange('gl_daily_checkin', 'intern_id,checkin_date,created_at', { in: ['intern_id', internIds], gte: ['checkin_date', past14Str] }),
    ]);

    const todayMap = {}; todayEntries.forEach((e) => { todayMap[e.intern_id] = e; });
    const scoreByIntern = {};
    const flagsByIntern = {};
    const today = new Date();

    // Per-intern composite + at-risk flags
    for (const intern of this.interns) {
      const monthly = monthEntries.filter((e) => e.intern_id === intern.id);
      const present = monthly.filter((e) => e.status === 'present').length;
      const half = monthly.filter((e) => e.status === 'half-day').length;
      const absent = monthly.filter((e) => e.status === 'absent').length;
      const totalCounted = present + absent + half;
      const attnPct = totalCounted ? Math.round(((present + half * 0.5) / totalCounted) * 100) : null;

      const myTasks = tasks.filter((t) => t.intern_id === intern.id);
      const tasksDone = myTasks.filter((t) => t.status === 'done').length;
      const tasksTotal = myTasks.filter((t) => t.status !== 'cancelled').length;
      const taskRate = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : null;

      const myKRAs = kras.filter((k) => k.intern_id === intern.id);
      const kraAvg = myKRAs.length ? Math.round(myKRAs.reduce((s, k) => s + (k.percent_done || 0), 0) / myKRAs.length) : null;

      const myKPIs = kpis.filter((k) => k.intern_id === intern.id);
      const kpiFilled = myKPIs.filter((k) => k.actual && k.actual.trim()).length;
      const kpiFillRate = myKPIs.length ? Math.round((kpiFilled / myKPIs.length) * 100) : null;
      const avgRmScore = (() => {
        const scored = myKPIs.filter((k) => k.rm_score != null);
        return scored.length ? Math.round((scored.reduce((s, k) => s + k.rm_score, 0) / scored.length) * 20) : null;  // 1-5 → 0-100
      })();

      const myIdeas = ideas.filter((i) => i.intern_id === intern.id).length;

      const myCheckins = checkinsRecent.filter((c) => c.intern_id === intern.id);
      const lastCheckinDate = myCheckins.length ? myCheckins.sort((a, b) => b.checkin_date.localeCompare(a.checkin_date))[0].checkin_date : null;

      // Composite score: weighted
      // attn 25% · kra 30% · taskRate 20% · kpiFillRate 15% · rmScore 10%
      const parts = [];
      if (attnPct != null)      parts.push({ w: 0.25, v: attnPct });
      if (kraAvg != null)       parts.push({ w: 0.30, v: kraAvg });
      if (taskRate != null)     parts.push({ w: 0.20, v: taskRate });
      if (kpiFillRate != null)  parts.push({ w: 0.15, v: kpiFillRate });
      if (avgRmScore != null)   parts.push({ w: 0.10, v: avgRmScore });
      const wSum = parts.reduce((s, p) => s + p.w, 0);
      const composite = parts.length ? Math.round(parts.reduce((s, p) => s + p.w * p.v, 0) / (wSum || 1)) : null;

      scoreByIntern[intern.id] = {
        attnPct, kraAvg, taskRate, kpiFillRate, avgRmScore, composite,
        tasksOpen: myTasks.filter((t) => !['done','cancelled'].includes(t.status)).length,
        ideasCount: myIdeas, daysPresent: present, daysAbsent: absent,
        lastCheckinDate,
      };

      // At-risk flags
      const flags = [];
      const daysSinceCheckin = lastCheckinDate ? daysBetween(today, lastCheckinDate) : 999;
      if (daysSinceCheckin >= 3) flags.push({ kind: 'no_checkin', label: `No check-in for ${daysSinceCheckin}d` });
      if (attnPct != null && attnPct < 80) flags.push({ kind: 'low_attn', label: `Attendance ${attnPct}%` });
      if (kraAvg != null && kraAvg < 50 && today.getDate() > 15) flags.push({ kind: 'kra_behind', label: `KRA avg ${kraAvg}%` });
      if (myIdeas === 0 && daysBetween(today, intern.start_date) > 14) flags.push({ kind: 'no_ideas', label: 'No ideas in 14d' });
      const todayE = todayMap[intern.id];
      if (today.getDay() !== 0 && !todayE) flags.push({ kind: 'today_missing', label: 'Not checked in today' });

      if (flags.length) flagsByIntern[intern.id] = flags;
    }

    // Trend: per-team attendance % over last 14 days
    const trend = this.computeTrend(monthEntries, past14Str);

    return { todayMap, monthEntries, pending, tasks, kras, kpis, ideas, scoreByIntern, flagsByIntern, trend };
  },

  async fetchRange(table, select, filters) {
    let q = getSupabase().from(table).select(select);
    if (filters.in) q = q.in(filters.in[0], filters.in[1]);
    if (filters.gte) q = q.gte(filters.gte[0], filters.gte[1]);
    if (filters.eq) q = q.eq(filters.eq[0], filters.eq[1]);
    const { data, error } = await q;
    if (error) { console.warn(table, error.message); return []; }
    return data || [];
  },

  computeTrend(monthEntries, startStr) {
    // Build day-by-day attendance % per team
    const teams = Array.from(new Set(this.interns.map(internVertical)));
    const internsByTeam = {};
    teams.forEach((t) => { internsByTeam[t] = this.interns.filter((i) => internVertical(i) === t); });

    const days = [];
    const cur = new Date(startStr);
    const today = new Date();
    while (cur <= today) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    const dayLabels = days.map((d) => `${d.getDate()}/${d.getMonth() + 1}`);

    const datasets = teams.map((team) => {
      const teamIds = internsByTeam[team].map((i) => i.id);
      const data = days.map((d) => {
        const ds = d.toISOString().slice(0, 10);
        if (d.getDay() === 0) return null;  // skip Sundays
        const entries = monthEntries.filter((e) => e.attendance_date === ds && teamIds.includes(e.intern_id));
        const present = entries.filter((e) => e.status === 'present').length;
        const half = entries.filter((e) => e.status === 'half-day').length;
        const expected = teamIds.length;
        return Math.round(((present + half * 0.5) / expected) * 100);
      });
      return { label: team, data };
    });

    return { labels: dayLabels, datasets };
  },

  renderHeroStats(intel) {
    const total = this.interns.length;
    const checkedIn = Object.keys(intel.todayMap).length;
    const approvedToday = Object.values(intel.todayMap).filter((e) => e.approval_status === 'approved').length;
    const pendingCount = intel.pending.length;
    const tasksDoneThisWeek = (() => {
      const start = new Date(); start.setDate(start.getDate() - 7);
      return intel.tasks.filter((t) => t.status === 'done' && t.done_at && new Date(t.done_at) >= start).length;
    })();
    const avgComposite = (() => {
      const vals = Object.values(intel.scoreByIntern).map((s) => s.composite).filter((v) => v != null);
      return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    })();
    const atRiskCount = Object.keys(intel.flagsByIntern).length;
    const ideasTotal = intel.ideas.length;

    return h('div', { class: 'stat-row', style: 'grid-template-columns: repeat(4, 1fr); gap:12px;' }, [
      statCard('Composite score (avg)', avgComposite == null ? '—' : `${avgComposite}/100`, 'cohort overall', 'gold'),
      statCard('Attendance today', `${checkedIn}/${total}`, `${approvedToday} approved`),
      statCard('Pending approvals', String(pendingCount), `across ${Object.values(intel.pending.reduce((m, e) => { m[e.interns.supervisor_id] = 1; return m; }, {})).length} RMs`),
      statCard('At-risk interns', String(atRiskCount), atRiskCount ? 'needs attention' : 'all clear', atRiskCount ? 'bad' : null),
      statCard('Tasks shipped (7d)', String(tasksDoneThisWeek), 'cohort'),
      statCard('Ideas submitted', String(ideasTotal), 'all-time'),
      statCard('Active KRAs', String(intel.kras.length), 'this month'),
      statCard('Days into cohort', String(daysBetween(todayStr(), '2026-05-22') + 1), 'started 22 May'),
    ]);
  },

  renderTopPerformers(intel) {
    const card = h('div', { class: 'card' });
    card.appendChild(h('h3', { class: 'section-h' }, '🏆 Top performers'));
    card.appendChild(h('p', { class: 'section-sub' }, 'Composite of attendance · KRAs · tasks · KPI fill rate · RM score.'));

    const ranked = this.interns
      .map((i) => ({ intern: i, score: intel.scoreByIntern[i.id] }))
      .filter((r) => r.score.composite != null)
      .sort((a, b) => b.score.composite - a.score.composite);

    if (!ranked.length) { card.appendChild(h('div', { class: 'empty-state' }, 'Not enough data yet.')); return card; }

    const list = h('div');
    ranked.forEach((r, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
      const compositeColor = r.score.composite >= 80 ? 'var(--good)' : r.score.composite >= 60 ? 'var(--gold)' : 'var(--bad)';
      list.appendChild(h('div', { style: 'display:grid; grid-template-columns: 36px 1fr auto; gap:12px; align-items:center; padding:10px 0; border-bottom:1px solid var(--border);' }, [
        h('div', { style: 'font-size:18px; text-align:center;' }, medal),
        h('div', {}, [
          h('div', { style: 'font-weight:500;' }, r.intern.name),
          h('div', { style: 'color:var(--text-mute); font-size:11px;' }, `${internVertical(r.intern)} · attn ${r.score.attnPct ?? '—'}% · KRA ${r.score.kraAvg ?? '—'}%`),
        ]),
        h('div', { style: `font-weight:700; font-size:20px; color:${compositeColor};` }, `${r.score.composite}`),
      ]));
    });
    card.appendChild(list);
    return card;
  },

  renderAtRisk(intel) {
    const card = h('div', { class: 'card' });
    card.appendChild(h('h3', { class: 'section-h' }, '⚠️ At-risk interns'));
    card.appendChild(h('p', { class: 'section-sub' }, 'Auto-flagged based on engagement signals. Drill in to act.'));

    const atRisk = Object.entries(intel.flagsByIntern);
    if (!atRisk.length) {
      card.appendChild(h('div', { class: 'empty-state' }, '✓ No interns flagged. All on track.'));
      return card;
    }
    atRisk.forEach(([internId, flags]) => {
      const intern = this.interns.find((i) => i.id === internId);
      if (!intern) return;
      card.appendChild(h('div', { style: 'padding:10px 0; border-bottom:1px solid var(--border);', onclick: () => this.openInternDrill(intern), css: 'cursor:pointer;' }, [
        h('div', { style: 'display:flex; align-items:center; justify-content:space-between;' }, [
          h('div', { style: 'font-weight:500;' }, intern.name),
          h('span', { class: 'badge badge-rejected' }, `${flags.length} flag${flags.length === 1 ? '' : 's'}`),
        ]),
        h('div', { style: 'color:var(--text-mute); font-size:11px; margin-top:2px;' }, internVertical(intern) + ' · RM: ' + (this.profilesById[intern.supervisor_id]?.full_name || '—')),
        h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;' },
          flags.map((f) => h('span', { class: 'badge badge-' + (f.kind === 'no_checkin' ? 'rejected' : f.kind === 'low_attn' ? 'rejected' : 'pending') }, f.label)),
        ),
      ]));
    });
    return card;
  },

  renderTeamScorecard(intel) {
    const card = h('div', { class: 'table-card' });
    card.appendChild(h('h3', { class: 'section-h' }, '🎯 Team scorecard'));
    card.appendChild(h('p', { class: 'section-sub' }, 'How each vertical is performing relative to the others.'));

    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Team'), h('th', {}, 'RM'), h('th', {}, 'Interns'),
      h('th', {}, 'Avg attn'), h('th', {}, 'Avg KRA %'), h('th', {}, 'Tasks open'), h('th', {}, 'Avg score'),
    ])));
    const tb = h('tbody');

    const byTeam = {};
    this.interns.forEach((i) => { const v = internVertical(i); (byTeam[v] = byTeam[v] || []).push(i); });

    Object.entries(byTeam).forEach(([team, list]) => {
      const scores = list.map((i) => intel.scoreByIntern[i.id]).filter(Boolean);
      const avg = (key) => {
        const vals = scores.map((s) => s[key]).filter((v) => v != null);
        return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
      };
      const attnAvg = avg('attnPct');
      const kraAvg = avg('kraAvg');
      const tasksOpenAvg = scores.reduce((s, x) => s + (x.tasksOpen || 0), 0);
      const compAvg = avg('composite');
      const rmName = this.profilesById[list[0]?.supervisor_id]?.full_name || '—';
      const compCls = compAvg == null ? '' : compAvg >= 80 ? 'badge-approved' : compAvg >= 60 ? 'badge-pending' : 'badge-rejected';

      tb.appendChild(h('tr', {}, [
        h('td', { style: 'font-weight:500;' }, team),
        h('td', {}, rmName),
        h('td', {}, String(list.length)),
        h('td', {}, attnAvg == null ? '—' : `${attnAvg}%`),
        h('td', {}, kraAvg == null ? '—' : `${kraAvg}%`),
        h('td', {}, String(tasksOpenAvg)),
        h('td', {}, h('span', { class: 'badge ' + compCls }, compAvg == null ? '—' : `${compAvg}/100`)),
      ]));
    });
    table.appendChild(tb); card.appendChild(table);
    return card;
  },

  drawTrend(canvas, trend) {
    if (!window.Chart) return;
    const palette = ['#09256B', '#C99959', '#1B3F8C', '#16a34a', '#dc2626'];
    this.charts.trend = new Chart(canvas, {
      type: 'line',
      data: {
        labels: trend.labels,
        datasets: trend.datasets.map((ds, i) => ({
          label: ds.label,
          data: ds.data,
          borderColor: palette[i % palette.length],
          backgroundColor: palette[i % palette.length] + '20',
          tension: 0.3,
          spanGaps: true,
          pointRadius: 3,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' } } },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
      },
    });
  },

  async buildInternCard(intern, todayEntry, score) {
    const card = h('div', { class: 'intern-card', onclick: () => this.openInternDrill(intern) });
    card.appendChild(h('div', { class: 'name' }, intern.name));
    card.appendChild(h('div', { class: 'vertical' }, [
      intern.intern_code, ' · ',
      todayEntry ? h('span', { class: 'badge badge-' + todayEntry.approval_status }, todayEntry.approval_status)
                  : h('span', { class: 'badge badge-pending' }, 'Not in yet'),
    ]));
    const compCls = score?.composite == null ? '' : (score.composite < 60 ? 'bad' : score.composite < 80 ? 'warn' : 'good');
    card.appendChild(h('div', { class: 'metrics' }, [
      h('div', {}, [h('div', { class: 'metric-l' }, 'Score'), h('div', { class: 'metric-v ' + compCls }, score?.composite == null ? '—' : String(score.composite))]),
      h('div', {}, [h('div', { class: 'metric-l' }, 'Attn'), h('div', { class: 'metric-v' }, score?.attnPct == null ? '—' : `${score.attnPct}%`)]),
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
      modal.appendChild(h('div', { class: 'modal-actions' }, [
        h('button', { class: 'btn-accent', onclick: () => api.exportInternData ? api.exportInternData(intern.id) : alert('Export coming Phase 3b') }, 'Export data ↓'),
        h('button', { class: 'btn-ghost', onclick: closeModal }, 'Close'),
      ]));
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
    root.appendChild(h('div', { class: 'greeting-sub' }, 'Roster overview + data export.'));
    const card = h('div', { class: 'table-card' });
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Intern'), h('th', {}, 'Code'), h('th', {}, 'Team'), h('th', {}, 'RM'),
      h('th', {}, 'Email'), h('th', {}, 'Start'), h('th', {}, 'Export'),
    ])));
    const tb = h('tbody');
    this.interns.forEach((i) => tb.appendChild(h('tr', {}, [
      h('td', { style: 'font-weight:500;' }, i.name),
      h('td', {}, i.intern_code),
      h('td', {}, internVertical(i)),
      h('td', {}, this.profilesById[i.supervisor_id]?.full_name || '—'),
      h('td', {}, i.email_alias || '—'),
      h('td', {}, formatDate(i.start_date)),
      h('td', {}, h('button', { class: 'btn-tiny neutral', onclick: () => this.exportIntern(i) }, '↓ JSON')),
    ])));
    table.appendChild(tb); card.appendChild(table); root.appendChild(card);
  },

  async exportIntern(intern) {
    const [att, checkins, tasks, kras, kpis, ideas, learnings] = await Promise.all([
      api.getMonthAttendance(intern.id, new Date().getFullYear(), new Date().getMonth() + 1).catch(() => []),
      api.listCheckins(intern.id, 9999).catch(() => []),
      api.listTasksForIntern(intern.id).catch(() => []),
      api.listKRAs(intern.id).catch(() => []),
      api.listKPIs(intern.id).catch(() => []),
      api.listIdeasForIntern(intern.id).catch(() => []),
      api.listLearnings(intern.id, 9999).catch(() => []),
    ]);
    const dump = { intern, exported_at: new Date().toISOString(), attendance: att, checkins, tasks, kras, kpis, ideas, learnings };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `growth-lab-${intern.intern_code}-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// statCard with optional variant ('gold' or 'bad')
function statCard(label, value, sub, variant) {
  const cls = 'stat-card' + (variant === 'gold' ? ' metric-gold' : '');
  const valStyle = variant === 'bad' ? 'color: var(--bad);' : '';
  return h('div', { class: cls }, [
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value', style: valStyle }, value),
    sub && h('div', { class: 'stat-sub' }, sub),
  ]);
}
