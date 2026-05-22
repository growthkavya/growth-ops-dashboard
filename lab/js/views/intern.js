// Intern view — 7 tabs.
const internView = {
  selectedIntern: null,
  myInterns: [],
  charts: {},

  destroyCharts() { Object.values(this.charts).forEach((c) => { try { c.destroy(); } catch {} }); this.charts = {}; },

  async mount(rootEl) {
    this.destroyCharts();
    rootEl.innerHTML = '';
    this.myInterns = await api.listInternsForAuthUser(auth.user.id);
    if (!this.myInterns.length) {
      rootEl.appendChild(h('div', { class: 'empty-state' }, "No active intern profiles linked to this account. Tell Kavya or Vidyut."));
      return;
    }
    const savedId = localStorage.getItem('gl_selected_intern_id');
    if (this.myInterns.length === 1) this.selectedIntern = this.myInterns[0];
    else if (savedId && this.myInterns.find((i) => i.id === savedId)) this.selectedIntern = this.myInterns.find((i) => i.id === savedId);
    else { this.showPicker(); return; }

    const tab = app.currentTab || 'home';
    switch (tab) {
      case 'home': await this.renderHome(rootEl); break;
      case 'attendance': await this.renderAttendance(rootEl); break;
      case 'daily': await this.renderDaily(rootEl); break;
      case 'tasks': await this.renderTasks(rootEl); break;
      case 'goals': await this.renderGoals(rootEl); break;
      case 'submissions': await this.renderSubmissions(rootEl); break;
      case 'docs': await this.renderDocs(rootEl); break;
      case 'cohort': await this.renderCohort(rootEl); break;
      default: await this.renderHome(rootEl);
    }
  },

  // ============== COHORT (peer visibility) ==============
  async renderCohort(root) {
    root.appendChild(h('div', { class: 'greeting' }, '🌟 The Cohort'));
    root.appendChild(h('div', { class: 'greeting-sub' }, "What the other 8 interns are shipping. See what's possible. Get inspired."));

    const interns = await api.listInterns();
    const past7 = new Date(); past7.setDate(past7.getDate() - 7);
    const past7Str = past7.toISOString().slice(0, 10);
    const internIds = interns.map((i) => i.id);

    // Pull cohort-wide activity for past 7 days
    const [ideas, learnings, tasksDone] = await Promise.all([
      getSupabase().from('gl_idea').select('*, interns!inner(name, tags)').in('intern_id', internIds).gte('created_at', past7.toISOString()).order('created_at', { ascending: false }).then((r) => r.data || []),
      getSupabase().from('gl_learning').select('*, interns!inner(name, tags)').in('intern_id', internIds).gte('learning_date', past7Str).order('learning_date', { ascending: false }).then((r) => r.data || []),
      getSupabase().from('gl_task').select('*, interns!inner(name, tags)').in('intern_id', internIds).eq('status', 'done').gte('done_at', past7.toISOString()).order('done_at', { ascending: false }).then((r) => r.data || []),
    ]);

    // Stat row
    root.appendChild(h('div', { class: 'stat-row' }, [
      statCard('Active interns', String(interns.length), 'across the cohort'),
      statCard('Tasks shipped this week', String(tasksDone.length), '7 days'),
      statCard('Ideas submitted', String(ideas.length), '7 days'),
      statCard('Learnings logged', String(learnings.length), '7 days'),
    ]));

    // Recent ideas
    const ideasCard = h('div', { class: 'card' });
    ideasCard.appendChild(h('h3', { class: 'section-h' }, '💡 Recent ideas from the cohort'));
    if (!ideas.length) ideasCard.appendChild(h('div', { class: 'empty-state' }, 'No ideas this week. Be the first.'));
    else ideas.slice(0, 10).forEach((i) => ideasCard.appendChild(h('div', { style: 'padding:10px 0; border-bottom:1px solid var(--border);' }, [
      h('div', { style: 'display:flex; justify-content:space-between; align-items:center;' }, [
        h('div', { style: 'font-weight:500;' }, i.title),
        h('span', { class: 'help-text' }, i.interns?.name + ' · ' + (i.interns?.tags?.find((t) => TAG_TO_VERTICAL[t]) ? TAG_TO_VERTICAL[i.interns.tags.find((t) => TAG_TO_VERTICAL[t])] : '')),
      ]),
      i.description ? h('div', { class: 'help-text', style: 'margin-top:4px;' }, i.description) : null,
    ])));
    root.appendChild(ideasCard);

    // Recent tasks shipped
    const tasksCard = h('div', { class: 'card' });
    tasksCard.appendChild(h('h3', { class: 'section-h' }, '✅ Shipped this week'));
    if (!tasksDone.length) tasksCard.appendChild(h('div', { class: 'empty-state' }, 'Nothing shipped yet this week.'));
    else tasksDone.slice(0, 15).forEach((t) => tasksCard.appendChild(h('div', { style: 'padding:8px 0; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; gap:8px;' }, [
      h('div', { style: 'font-size:13px;' }, [
        h('strong', {}, t.interns?.name),
        ': ', t.title,
      ]),
      h('span', { class: 'help-text', style: 'white-space:nowrap;' }, formatDate(t.done_at)),
    ])));
    root.appendChild(tasksCard);

    // Recent learnings
    const learnCard = h('div', { class: 'card' });
    learnCard.appendChild(h('h3', { class: 'section-h' }, '📚 Things the cohort learnt'));
    if (!learnings.length) learnCard.appendChild(h('div', { class: 'empty-state' }, 'Nothing logged this week.'));
    else learnings.slice(0, 10).forEach((l) => learnCard.appendChild(h('div', { style: 'padding:8px 0; border-bottom:1px solid var(--border);' }, [
      h('div', { style: 'font-size:13px;' }, [
        h('strong', {}, l.interns?.name),
        ': ', l.what_learnt,
      ]),
      h('div', { class: 'help-text', style: 'margin-top:2px;' }, (l.source || '—') + ' · ' + (l.category || 'general')),
    ])));
    root.appendChild(learnCard);
  },

  showPicker() {
    $('#picker-screen').classList.remove('hidden');
    $('#app').classList.add('hidden');
    const list = $('#picker-list'); list.innerHTML = '';
    this.myInterns.forEach((intern) => {
      const initials = intern.name.split(' ').slice(0, 2).map((s) => s[0]).join('');
      list.appendChild(h('button', { class: 'picker-option', onclick: () => this.choose(intern) }, [
        h('span', { class: 'picker-avatar' }, initials),
        h('div', {}, [
          h('div', {}, intern.name),
          h('div', { class: 'picker-meta' }, internVertical(intern) + ' · ' + intern.intern_code),
        ]),
      ]));
    });
  },
  choose(intern) {
    this.selectedIntern = intern;
    localStorage.setItem('gl_selected_intern_id', intern.id);
    localStorage.setItem('gl_selected_intern_name', intern.name);
    $('#picker-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    app.refreshChrome(); app.renderView();
  },

  // ============== HOME ==============
  async renderHome(root) {
    const intern = this.selectedIntern;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    root.appendChild(h('div', { class: 'greeting' }, `${greeting}, ${intern.name.split(' ')[0]}.`));
    const dayNum = Math.max(1, daysBetween(todayStr(), intern.start_date) + 1);
    root.appendChild(h('div', { class: 'greeting-sub' }, `Day ${dayNum} · ${internVertical(intern)}`));

    const ci = h('div', { class: 'checkin-card' }); root.appendChild(ci); await this.renderCheckinCard(ci);
    const stats = h('div', { class: 'stat-row' }); root.appendChild(stats); await this.renderStats(stats);

    root.appendChild(h('div', { class: 'grid-2' }, [
      await this.buildTodayTasksCard(),
      await this.buildTodayCheckinCard(),
    ]));
  },

  async renderCheckinCard(card) {
    card.innerHTML = '';
    let today;
    try { today = await api.getTodayAttendance(this.selectedIntern.id); }
    catch (e) {
      if (e.message?.includes('schema cache') || e.message?.includes('not find')) {
        const banner = h('div', { class: 'banner bad' }, '⚠️ Database not initialized. Tell admin to run migration_growth_lab_v2.sql.');
        if (card.parentElement) card.parentElement.insertBefore(banner, card);
      }
      card.appendChild(h('div', { class: 'error-text' }, 'Failed: ' + e.message));
      return;
    }
    const info = h('div'); const btnCol = h('div');
    if (!today) {
      info.appendChild(h('div', { class: 'checkin-status' }, 'Status'));
      info.appendChild(h('div', { class: 'checkin-state' }, 'Not checked in'));
      info.appendChild(h('div', { class: 'checkin-meta' }, "Tap CHECK IN when you've started your day."));
      btnCol.appendChild(h('button', { class: 'btn-checkin', onclick: () => this.handleCheckIn(card) }, 'CHECK IN'));
    } else if (today.check_in_time && !today.check_out_time) {
      info.appendChild(h('div', { class: 'checkin-status' }, 'Status'));
      info.appendChild(h('div', { class: 'checkin-state' }, '✓ Checked in'));
      info.appendChild(h('div', { class: 'checkin-meta' }, 'Started at ' + formatTime(today.check_in_time)));
      btnCol.appendChild(h('button', { class: 'btn-checkin checkout', onclick: () => this.handleCheckOut(card, today) }, 'CHECK OUT'));
    } else {
      info.appendChild(h('div', { class: 'checkin-status' }, "Today's attendance"));
      info.appendChild(h('div', { class: 'checkin-state' }, ['✓ Done for today ', approvalBadge(today.approval_status)]));
      info.appendChild(h('div', { class: 'checkin-meta' },
        `In ${formatTime(today.check_in_time)} · Out ${formatTime(today.check_out_time)} · ${today.hours_worked || '?'} hrs`));
      if (today.last_edited_at)
        info.appendChild(h('div', { class: 'checkin-meta', style: 'margin-top:6px; font-style:italic;' },
          `✏️ Edited by RM · ${formatDateTime(today.last_edited_at)}`));
      if (today.rm_remarks)
        info.appendChild(h('div', { class: 'checkin-meta', style: 'margin-top:6px; font-style:italic;' }, `RM note: ${today.rm_remarks}`));
    }
    card.appendChild(info); card.appendChild(btnCol);
  },

  async handleCheckIn(card) {
    try { await api.checkIn(this.selectedIntern.id); await this.renderCheckinCard(card); }
    catch (e) { alert('Check-in failed: ' + e.message); }
  },
  handleCheckOut(card, today) {
    card.innerHTML = '';
    const form = h('div', { class: 'checkout-form' });
    form.appendChild(h('label', {}, [
      h('span', {}, 'What did you do today? (required)'),
      h('textarea', { id: 'cko-summary', placeholder: 'Brief — 1-3 lines. RM uses this to approve.' }),
    ]));
    form.appendChild(h('div', { class: 'form-actions' }, [
      h('button', { class: 'btn-ghost', onclick: () => this.renderCheckinCard(card) }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        const s = $('#cko-summary').value.trim();
        if (!s) { alert('Daily work summary is required.'); return; }
        try { await api.checkOut(this.selectedIntern.id, s); await this.renderCheckinCard(card); }
        catch (e) { alert('Check-out failed: ' + e.message); }
      } }, 'Submit & Check out'),
    ]));
    card.appendChild(h('div', {}, [
      h('div', { class: 'checkin-status' }, 'Status'),
      h('div', { class: 'checkin-state' }, 'Checking out…'),
      h('div', { class: 'checkin-meta' }, 'Started at ' + formatTime(today.check_in_time)),
    ]));
    card.appendChild(form);
  },

  async renderStats(row) {
    row.innerHTML = '';
    const summary = await api.getMonthSummaryForIntern(this.selectedIntern.id);
    const monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });
    const streak = await this.streak();
    const records = await api.getMonthAttendance(this.selectedIntern.id, new Date().getFullYear(), new Date().getMonth() + 1);
    const approved = records.filter((r) => r.approval_status === 'approved').length;
    row.appendChild(statCard('Attendance', summary.pct == null ? '—' : `${summary.pct}%`, monthName));
    row.appendChild(statCard('Days Present', String(summary.present), monthName));
    row.appendChild(statCard('Approved', String(approved), monthName));
    // Streak card with milestone badge
    const badge = streak >= 90 ? '🏆' : streak >= 30 ? '💎' : streak >= 14 ? '⭐' : streak >= 7 ? '🔥' : '';
    const nextMilestone = streak < 7 ? 7 : streak < 14 ? 14 : streak < 30 ? 30 : streak < 90 ? 90 : null;
    const streakSub = nextMilestone ? `${nextMilestone - streak} more for next milestone` : 'legendary';
    row.appendChild(statCard('Streak', `${badge} ${streak} day${streak === 1 ? '' : 's'}`, streakSub, streak >= 7 ? 'gold' : null));
  },

  async streak() {
    const d = new Date();
    const records = await api.getMonthAttendance(this.selectedIntern.id, d.getFullYear(), d.getMonth() + 1);
    const byDate = {}; records.forEach((r) => { byDate[r.attendance_date] = r; });
    let streak = 0; const cur = new Date();
    for (let i = 0; i < 31; i++) {
      const ds = cur.toISOString().slice(0, 10);
      if (cur.getDay() === 0) { cur.setDate(cur.getDate() - 1); continue; }
      const rec = byDate[ds];
      if (rec && rec.approval_status !== 'rejected' && ['present','half-day','wfh'].includes(rec.status)) {
        streak++; cur.setDate(cur.getDate() - 1);
      } else break;
    }
    return streak;
  },

  async buildTodayTasksCard() {
    const card = h('div', { class: 'card' });
    card.appendChild(h('h3', { class: 'section-h' }, 'My active tasks'));
    let tasks = [];
    try { tasks = await api.listTasksForIntern(this.selectedIntern.id, { activeOnly: true }); } catch {}
    if (!tasks.length) { card.appendChild(h('div', { class: 'empty-state', style: 'padding:20px;' }, "No active tasks. Ask your RM to assign.")); return card; }
    tasks.slice(0, 5).forEach((t) => {
      card.appendChild(h('div', { style: 'padding:10px 0; border-bottom:1px solid var(--border); font-size:13px;' }, [
        h('div', { style: 'display:flex; align-items:center; justify-content:space-between; gap:8px;' }, [
          h('div', { style: 'font-weight:500;' }, t.title),
          h('span', { class: 'badge badge-' + (t.priority || 'med') }, t.priority || 'med'),
        ]),
        h('div', { style: 'color:var(--text-mute); font-size:12px; margin-top:2px;' },
          `${t.task_type === 'weekly' ? 'Weekly' : 'Daily'} · due ${formatDate(t.due_date) || '—'} · ${t.percent_done || 0}%`),
      ]));
    });
    if (tasks.length > 5)
      card.appendChild(h('div', { style: 'margin-top:8px; font-size:12px;' },
        h('a', { href: '#', onclick: (e) => { e.preventDefault(); app.setTab('tasks'); } }, `View all ${tasks.length} →`)));
    return card;
  },

  async buildTodayCheckinCard() {
    const card = h('div', { class: 'card' });
    card.appendChild(h('h3', { class: 'section-h' }, "Today's daily check-in"));
    let c = null; try { c = await api.getTodayCheckin(this.selectedIntern.id); } catch {}
    if (c) {
      card.appendChild(h('div', { class: 'banner ok' }, '✓ Submitted at ' + formatTime(c.created_at)));
      card.appendChild(h('div', { style: 'font-size:13px; color:var(--text-soft);' }, c.what_done || '(no narrative)'));
    } else {
      card.appendChild(h('p', { class: 'help-text' }, 'Not submitted yet. Capture what you did today.'));
      card.appendChild(h('button', { class: 'btn-accent', onclick: () => app.setTab('daily') }, 'Submit check-in'));
    }
    return card;
  },

  // ============== ATTENDANCE ==============
  async renderAttendance(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'My Attendance'));
    root.appendChild(h('div', { class: 'greeting-sub' }, 'Calendar of your attendance this month + audit trail.'));
    const ci = h('div', { class: 'checkin-card' }); root.appendChild(ci); await this.renderCheckinCard(ci);
    const cal = h('div', { class: 'card' }); root.appendChild(cal); await this.renderCalendar(cal);
    const aud = h('div', { class: 'card' }); root.appendChild(aud); await this.renderAuditList(aud);
  },

  async renderCalendar(card) {
    card.innerHTML = '';
    const d = new Date();
    const year = d.getFullYear(), month = d.getMonth() + 1;
    card.appendChild(h('h3', { class: 'section-h' }, `Attendance — ${d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`));
    const records = await api.getMonthAttendance(this.selectedIntern.id, year, month);
    const byDate = {}; records.forEach((r) => { byDate[r.attendance_date] = r; });
    const grid = h('div', { class: 'calendar-grid' });
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach((dd) => grid.appendChild(h('div', { class: 'cal-day-name' }, dd)));
    const first = new Date(year, month - 1, 1);
    const firstDow = (first.getDay() + 6) % 7;
    for (let i = 0; i < firstDow; i++) grid.appendChild(h('div', { class: 'cal-day empty' }));
    const lastDay = new Date(year, month, 0).getDate();
    const todayDate = todayStr();
    for (let day = 1; day <= lastDay; day++) {
      const ds = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const rec = byDate[ds];
      const dt = new Date(ds);
      let cls = 'cal-day';
      if (dt.getDay() === 0) cls += ' sunday';
      else if (ds > todayDate) cls += ' future';
      else if (rec) {
        if (rec.approval_status === 'approved') cls += ' approved';
        else if (rec.approval_status === 'rejected') cls += ' rejected';
        else if (rec.status === 'absent') cls += ' absent';
        else cls += ' pending';
      }
      if (ds === todayDate) cls += ' today';
      grid.appendChild(h('div', { class: cls, title: rec ? `${rec.status} · ${rec.approval_status}` : '' },
        [h('div', { class: 'cal-num' }, String(day))]));
    }
    card.appendChild(grid);
    card.appendChild(h('div', { class: 'legend-row' }, [
      legendDot('#dcfce7', 'Approved'), legendDot('#fef9c3', 'Pending'),
      legendDot('#fee2e2', 'Absent / Rejected'), legendDot('#f8fafc', 'Off day'),
    ]));
  },

  async renderAuditList(card) {
    card.appendChild(h('h3', { class: 'section-h' }, 'Recent attendance audit'));
    card.appendChild(h('p', { class: 'section-sub' }, "Every edit, approval, and rejection on your attendance is logged."));
    const records = await api.getMonthAttendance(this.selectedIntern.id, new Date().getFullYear(), new Date().getMonth() + 1);
    const last5 = records.slice(-5).reverse();
    if (!last5.length) { card.appendChild(h('div', { class: 'empty-state' }, 'Nothing yet.')); return; }
    for (const r of last5) {
      const audit = await api.listAuditForAttendance(r.id);
      const block = h('div', { style: 'margin-bottom:14px;' }, [
        h('div', { style: 'font-weight:600; margin-bottom:6px;' }, formatDate(r.attendance_date) + ' · ' + r.status),
      ]);
      const t = h('div', { class: 'audit-timeline' });
      if (audit.length === 0) t.appendChild(h('div', { class: 'audit-row' }, [h('div', { class: 'audit-when' }, '—'), h('div', {}, 'No events.')]));
      else audit.forEach((a) => t.appendChild(h('div', { class: 'audit-row' }, [
        h('div', { class: 'audit-when' }, formatDateTime(a.created_at)),
        h('div', {}, [
          h('strong', {}, a.action), ' · ', a.actor_name || 'system',
          a.note ? h('div', { style: 'color:var(--text-mute); margin-top:2px;' }, a.note) : null,
        ]),
      ])));
      block.appendChild(t); card.appendChild(block);
    }
  },

  // ============== DAILY LOG ==============
  async renderDaily(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Daily Check-in'));
    root.appendChild(h('div', { class: 'greeting-sub' }, "Quick narrative of what you did today. RM reads these."));
    const todayC = await api.getTodayCheckin(this.selectedIntern.id);
    const form = h('div', { class: 'card' });
    form.appendChild(h('h3', { class: 'section-h' }, todayC ? "Today's entry (you can edit until midnight)" : "Submit today's check-in"));
    form.appendChild(this.buildCheckinForm(todayC));
    root.appendChild(form);

    const hist = h('div', { class: 'card' });
    hist.appendChild(h('h3', { class: 'section-h' }, 'Recent entries'));
    const list = await api.listCheckins(this.selectedIntern.id, 14);
    if (!list.length) hist.appendChild(h('div', { class: 'empty-state' }, "No entries yet."));
    else {
      const table = h('table'); table.appendChild(h('thead', {}, h('tr', {}, [
        h('th', {}, 'Date'), h('th', {}, 'What done'), h('th', {}, 'Learnt'), h('th', {}, 'Blockers'), h('th', {}, 'Tomorrow'), h('th', {}, 'Hrs'), h('th', {}, 'Ack'),
      ])));
      const tb = h('tbody');
      list.forEach((c) => tb.appendChild(h('tr', {}, [
        h('td', { style: 'white-space:nowrap;' }, formatDate(c.checkin_date)),
        h('td', { style: 'max-width:240px;' }, c.what_done || '—'),
        h('td', { style: 'max-width:180px;' }, c.what_learnt || '—'),
        h('td', { style: 'max-width:180px;' }, c.blockers || '—'),
        h('td', { style: 'max-width:180px;' }, c.tomorrow_plan || '—'),
        h('td', {}, c.hours_spent != null ? String(c.hours_spent) : '—'),
        h('td', {}, c.rm_acknowledged ? h('span', { class: 'badge badge-approved' }, '✓ Ack') : h('span', { class: 'badge badge-pending' }, '—')),
      ])));
      table.appendChild(tb); hist.appendChild(table);
    }
    root.appendChild(hist);
  },

  buildCheckinForm(existing) {
    const wrap = h('div');
    const what = h('textarea', { name: 'what_done', placeholder: 'What did you do today?' });
    if (existing?.what_done) what.value = existing.what_done;
    const learnt = h('textarea', { name: 'what_learnt', placeholder: 'What did you learn?' });
    if (existing?.what_learnt) learnt.value = existing.what_learnt;
    const block = h('textarea', { name: 'blockers', placeholder: 'Any blockers? Type "none" if all clear.' });
    if (existing?.blockers) block.value = existing.blockers;
    const tom = h('textarea', { name: 'tomorrow_plan', placeholder: 'Top 1-3 things you plan to do tomorrow.' });
    if (existing?.tomorrow_plan) tom.value = existing.tomorrow_plan;
    const hours = h('input', { type: 'number', name: 'hours_spent', step: '0.5', placeholder: 'e.g. 5.5' });
    if (existing?.hours_spent != null) hours.value = existing.hours_spent;
    const link = h('input', { type: 'url', name: 'linked_doc', placeholder: 'https://...' });
    if (existing?.linked_doc) link.value = existing.linked_doc;

    wrap.appendChild(h('label', {}, [h('span', {}, 'What did you do today?'), what]));
    wrap.appendChild(h('label', {}, [h('span', {}, 'What did you learn?'), learnt]));
    wrap.appendChild(h('label', {}, [h('span', {}, 'Blockers'), block]));
    wrap.appendChild(h('label', {}, [h('span', {}, "Tomorrow's plan"), tom]));
    wrap.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Hours spent'), hours]),
      h('label', {}, [h('span', {}, 'Drive / doc link (optional)'), link]),
    ]));
    wrap.appendChild(h('button', { class: 'btn-primary', onclick: async () => {
      try {
        await api.upsertCheckin(this.selectedIntern.id, {
          what_done: what.value, what_learnt: learnt.value, blockers: block.value, tomorrow_plan: tom.value,
          hours_spent: hours.value === '' ? null : Number(hours.value),
          linked_doc: link.value || null,
        });
        app.renderView();
      } catch (e) { alert('Failed: ' + e.message); }
    } }, existing ? 'Update' : 'Submit'));
    return wrap;
  },

  // ============== TASKS ==============
  async renderTasks(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'My Tasks'));
    root.appendChild(h('div', { class: 'greeting-sub' }, "All tasks your RM assigned. Update progress as you go."));
    const all = await api.listTasksForIntern(this.selectedIntern.id);
    if (!all.length) {
      root.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty-state' }, "Nothing assigned yet. Your RM will assign tasks soon.")));
      return;
    }
    const active = all.filter((t) => !['done','cancelled'].includes(t.status));
    const done = all.filter((t) => t.status === 'done').slice(0, 10);
    const cancelled = all.filter((t) => t.status === 'cancelled');
    if (active.length) root.appendChild(this.tasksTable('Active tasks', active));
    if (done.length) root.appendChild(this.tasksTable('Recently completed', done, true));
    if (cancelled.length) root.appendChild(this.tasksTable('Cancelled', cancelled, true));
  },

  tasksTable(title, tasks, readOnly = false) {
    const card = h('div', { class: 'table-card' });
    card.appendChild(h('h3', { class: 'section-h' }, title));
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Type'), h('th', {}, 'Task'), h('th', {}, 'Due'), h('th', {}, 'Priority'),
      h('th', {}, 'Status'), h('th', {}, '% done'), h('th', {}, 'Link'), h('th', {}, ''),
    ])));
    const tb = h('tbody');
    tasks.forEach((t) => {
      const tr = h('tr');
      tr.appendChild(h('td', {}, t.task_type));
      tr.appendChild(h('td', { style: 'max-width:280px;' }, [
        h('div', { style: 'font-weight:500;' }, t.title),
        t.description ? h('div', { style: 'font-size:12px; color:var(--text-mute); margin-top:2px;' }, t.description) : null,
      ]));
      tr.appendChild(h('td', { style: 'white-space:nowrap;' }, formatDate(t.due_date) || '—'));
      tr.appendChild(h('td', {}, h('span', { class: 'badge badge-' + (t.priority || 'med') }, t.priority || 'med')));
      tr.appendChild(h('td', {}, h('span', { class: 'badge badge-' + t.status }, t.status)));
      tr.appendChild(h('td', { style: 'min-width:110px;' }, h('div', { class: 'progress-row' }, [
        h('div', { class: 'progress' }, h('div', { class: 'bar' + (t.percent_done >= 100 ? ' good' : ''), style: { width: (t.percent_done || 0) + '%' } })),
        h('span', { class: 'pct' }, (t.percent_done || 0) + '%'),
      ])));
      tr.appendChild(h('td', {}, t.output_link ? h('a', { href: t.output_link, target: '_blank' }, 'open ↗') : '—'));
      tr.appendChild(h('td', {}, readOnly ? null : h('button', { class: 'btn-tiny neutral', onclick: () => this.editTaskModal(t) }, 'Update')));
      tb.appendChild(tr);
    });
    table.appendChild(tb); card.appendChild(table);
    return card;
  },

  editTaskModal(t) {
    const card = h('div');
    card.appendChild(h('h3', {}, 'Update task'));
    card.appendChild(h('p', { class: 'help-text' }, t.title));
    const status = h('select', { name: 'status' }, ['not_started','in_progress','blocked','done','cancelled'].map((s) =>
      h('option', { value: s, selected: t.status === s }, s)));
    const pct = h('input', { type: 'number', name: 'percent_done', min: 0, max: 100, step: 5, value: String(t.percent_done || 0) });
    const link = h('input', { type: 'url', name: 'output_link', placeholder: 'https://...' });
    if (t.output_link) link.value = t.output_link;
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Status'), status]),
      h('label', {}, [h('span', {}, '% done'), pct]),
    ]));
    card.appendChild(h('label', {}, [h('span', {}, 'Output link (optional)'), link]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: () => openCommentThread('task', t.id, this.selectedIntern.id, t.title) }, '💬 Comments'),
      h('div', { style: 'flex:1;' }),
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        try {
          await api.updateTask(t.id, { status: status.value, percent_done: Number(pct.value), output_link: link.value || null });
          closeModal(); app.renderView();
        } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Save'),
    ]));
    openModal(card);
  },

  // ============== GOALS (KRA + KPI) ==============
  async renderGoals(root) {
    const monthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    root.appendChild(h('div', { class: 'greeting' }, 'My Goals'));
    root.appendChild(h('div', { class: 'greeting-sub' }, `Monthly KRAs and KPIs for ${monthName}.`));

    const [kras, kpis] = await Promise.all([api.listKRAs(this.selectedIntern.id), api.listKPIs(this.selectedIntern.id)]);

    const kraCard = h('div', { class: 'card' });
    kraCard.appendChild(h('h3', { class: 'section-h' }, 'Key Result Areas (KRAs)'));
    kraCard.appendChild(h('p', { class: 'section-sub' }, "High-level goals for the month. RM sets these. Update progress as you go."));
    if (!kras.length) kraCard.appendChild(h('div', { class: 'banner info' }, "Your RM hasn't set KRAs for this month yet. Once they do, you can update progress here."));
    else {
      const grid = h('div', { class: 'goal-grid' });
      kras.forEach((k) => grid.appendChild(this.buildKRAcard(k)));
      kraCard.appendChild(grid);
    }
    root.appendChild(kraCard);

    const kpiCard = h('div', { class: 'card' });
    kpiCard.appendChild(h('h3', { class: 'section-h' }, 'KPIs'));
    kpiCard.appendChild(h('p', { class: 'section-sub' }, "Measurable targets. Fill your actuals weekly."));
    if (!kpis.length) kpiCard.appendChild(h('div', { class: 'banner info' }, 'KPIs not yet set for this month. Ask your RM.'));
    else kpis.forEach((k) => kpiCard.appendChild(this.buildKPIrow(k)));
    root.appendChild(kpiCard);

    if (kras.length) {
      const chartCard = h('div', { class: 'chart-card' });
      chartCard.appendChild(h('h3', { class: 'section-h' }, 'Monthly progress'));
      const wrap = h('div', { class: 'chart-canvas-wrap' }); chartCard.appendChild(wrap);
      const canvas = h('canvas'); wrap.appendChild(canvas);
      root.appendChild(chartCard);
      setTimeout(() => this.renderProgressChart(canvas, kras), 0);
    }
  },

  buildKRAcard(k) {
    const card = h('div', { class: 'goal-card ' + (k.status || 'on_track') });
    card.appendChild(h('div', { class: 'goal-title' }, [
      h('span', {}, `KRA ${k.kra_index}. ${k.title}`),
      h('span', { class: 'badge badge-' + (k.status || 'on_track') }, (k.status || 'on_track').replace('_', ' ')),
    ]));
    if (k.description) card.appendChild(h('div', { class: 'goal-desc' }, k.description));
    if (k.target_outcome) card.appendChild(h('div', { class: 'goal-target' }, '🎯 ' + k.target_outcome));
    card.appendChild(h('div', { class: 'progress-row' }, [
      h('div', { class: 'progress' }, h('div', { class: 'bar' + (k.percent_done >= 80 ? ' good' : k.percent_done >= 50 ? '' : ' warn'), style: { width: (k.percent_done || 0) + '%' } })),
      h('span', { class: 'pct' }, (k.percent_done || 0) + '%'),
    ]));
    if (k.progress_notes) card.appendChild(h('div', { class: 'help-text', style: 'margin-top:8px;' }, k.progress_notes));
    if (k.rm_comments) card.appendChild(h('div', { class: 'help-text', style: 'margin-top:6px; font-style:italic;' }, 'RM: ' + k.rm_comments));
    card.appendChild(h('button', { class: 'btn-tiny neutral', style: 'margin-top:10px;', onclick: () => this.updateKRAModal(k) }, 'Update progress'));
    return card;
  },

  updateKRAModal(k) {
    const card = h('div');
    card.appendChild(h('h3', {}, `Update KRA ${k.kra_index} progress`));
    card.appendChild(h('p', { class: 'help-text' }, k.title));
    const pct = h('input', { type: 'number', name: 'percent_done', min: 0, max: 100, step: 5, value: String(k.percent_done || 0) });
    const status = h('select', { name: 'status' }, ['on_track','at_risk','behind','done','dropped'].map((s) =>
      h('option', { value: s, selected: k.status === s }, s.replace('_', ' '))));
    const notes = h('textarea', { name: 'progress_notes', placeholder: 'What progress this week / what changed?' });
    if (k.progress_notes) notes.value = k.progress_notes;
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, '% done'), pct]),
      h('label', {}, [h('span', {}, 'Status'), status]),
    ]));
    card.appendChild(h('label', {}, [h('span', {}, 'Progress notes'), notes]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        try {
          await api.upsertKRA({
            id: k.id, intern_id: this.selectedIntern.id, period_month: k.period_month, kra_index: k.kra_index,
            title: k.title, description: k.description, target_outcome: k.target_outcome,
            percent_done: Number(pct.value), status: status.value, progress_notes: notes.value || null,
          });
          closeModal(); app.renderView();
        } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Save'),
    ]));
    openModal(card);
  },

  buildKPIrow(k) {
    const row = h('div', { class: 'kpi-row' });
    row.appendChild(h('div', { class: 'kpi-label' }, [
      `KPI ${k.kpi_index}. ${k.label}`,
      h('span', { class: 'sub' }, k.kra_index ? `Rolls up to KRA ${k.kra_index}` : ''),
    ]));
    row.appendChild(h('div', { class: 'kpi-target' }, [h('strong', {}, 'Target: '), k.target || '—']));
    const input = h('input', { type: 'text', value: k.actual || '', placeholder: 'Your actual…' });
    const save = h('button', { class: 'btn-tiny ok', onclick: async () => {
      try {
        await api.upsertKPI({
          id: k.id, intern_id: this.selectedIntern.id, period_month: k.period_month, kpi_index: k.kpi_index,
          label: k.label, target: k.target, actual: input.value, kra_index: k.kra_index,
        });
        save.textContent = '✓ saved'; setTimeout(() => save.textContent = 'Save', 1500);
      } catch (e) { alert('Failed: ' + e.message); }
    } }, 'Save');
    row.appendChild(h('div', { class: 'kpi-input' }, [input, save]));
    return row;
  },

  renderProgressChart(canvas, kras) {
    if (!window.Chart) return;
    const labels = kras.map((k) => `KRA ${k.kra_index}`);
    const data = kras.map((k) => k.percent_done || 0);
    this.charts.progress = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: '% complete', data, backgroundColor: data.map((v) => v >= 80 ? '#16a34a' : v >= 50 ? '#2563eb' : '#d97706'), borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' } } }, plugins: { legend: { display: false } } },
    });
  },

  // ============== SUBMISSIONS (Ideas + Learnings) ==============
  async renderSubmissions(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'My Submissions'));
    root.appendChild(h('div', { class: 'greeting-sub' }, "Ideas you've shared + learnings you've logged."));

    const grid = h('div', { class: 'grid-2' });
    root.appendChild(grid);

    const ideaCard = h('div', { class: 'card' });
    ideaCard.appendChild(h('h3', { class: 'section-h' }, '💡 Ideas Bank'));
    ideaCard.appendChild(h('button', { class: 'btn-accent', onclick: () => this.newIdeaModal() }, '+ New idea'));
    const ideaList = h('div', { style: 'margin-top:14px;' }); ideaCard.appendChild(ideaList);
    let ideas = []; try { ideas = await api.listIdeasForIntern(this.selectedIntern.id); } catch {}
    if (!ideas.length) ideaList.appendChild(h('div', { class: 'empty-state' }, 'No ideas yet. Click + to share one.'));
    else ideas.forEach((i) => ideaList.appendChild(this.buildIdeaRow(i)));
    grid.appendChild(ideaCard);

    const learnCard = h('div', { class: 'card' });
    learnCard.appendChild(h('h3', { class: 'section-h' }, '📚 Learnings'));
    learnCard.appendChild(h('button', { class: 'btn-accent', onclick: () => this.newLearningModal() }, '+ Log a learning'));
    const learnList = h('div', { style: 'margin-top:14px;' }); learnCard.appendChild(learnList);
    let learns = []; try { learns = await api.listLearnings(this.selectedIntern.id, 50); } catch {}
    if (!learns.length) learnList.appendChild(h('div', { class: 'empty-state' }, 'No learnings logged yet.'));
    else learns.slice(0, 10).forEach((l) => learnList.appendChild(this.buildLearningRow(l)));
    grid.appendChild(learnCard);

    if (learns.length) {
      const chartRow = h('div', { class: 'chart-row' });
      const c1 = h('div', { class: 'chart-card' });
      c1.appendChild(h('h3', { class: 'section-h' }, 'Learnings by category'));
      const w1 = h('div', { class: 'chart-canvas-wrap' }); c1.appendChild(w1);
      const cn1 = h('canvas'); w1.appendChild(cn1);
      const c2 = h('div', { class: 'chart-card' });
      c2.appendChild(h('h3', { class: 'section-h' }, 'Learnings by source'));
      const w2 = h('div', { class: 'chart-canvas-wrap' }); c2.appendChild(w2);
      const cn2 = h('canvas'); w2.appendChild(cn2);
      chartRow.appendChild(c1); chartRow.appendChild(c2); root.appendChild(chartRow);
      setTimeout(() => { this.renderLearningsPie(cn1, learns, 'category'); this.renderLearningsPie(cn2, learns, 'source'); }, 0);
    }
  },

  buildIdeaRow(i) {
    return h('div', { style: 'padding:10px 0; border-bottom:1px solid var(--border);' }, [
      h('div', { style: 'display:flex; align-items:center; justify-content:space-between;' }, [
        h('div', { style: 'font-weight:500;' }, i.title),
        h('span', { class: 'badge badge-' + i.status }, i.status.replace('_', ' ')),
      ]),
      i.description ? h('div', { style: 'color:var(--text-soft); font-size:12px; margin-top:4px;' }, i.description) : null,
      i.decision_notes ? h('div', { style: 'font-size:12px; margin-top:4px; font-style:italic; color:var(--text-mute);' }, 'RM: ' + i.decision_notes) : null,
    ]);
  },

  buildLearningRow(l) {
    return h('div', { style: 'padding:10px 0; border-bottom:1px solid var(--border);' }, [
      h('div', { style: 'display:flex; align-items:center; justify-content:space-between; gap:8px;' }, [
        h('div', { style: 'font-weight:500; flex:1;' }, l.what_learnt),
        h('span', { class: 'badge', style: 'background:var(--surface-3); color:var(--text-soft);' }, l.category || 'general'),
      ]),
      h('div', { style: 'color:var(--text-mute); font-size:11px; margin-top:4px;' },
        [formatDate(l.learning_date), l.source ? ' · ' + l.source : ''].join('')),
      l.how_to_apply ? h('div', { style: 'font-size:12px; color:var(--text-soft); margin-top:4px;' }, '→ ' + l.how_to_apply) : null,
    ]);
  },

  newIdeaModal() {
    const card = h('div');
    card.appendChild(h('h3', {}, '💡 New idea'));
    const title = h('input', { type: 'text', name: 'title', placeholder: 'Short, sharp idea title' });
    const desc = h('textarea', { name: 'description', placeholder: 'What is it?' });
    const why = h('textarea', { name: 'why_matters', placeholder: 'Why this matters / impact?' });
    const eff = h('input', { type: 'text', name: 'estimated_effort', placeholder: 'e.g. Low / 2 hrs / 1 week' });
    card.appendChild(h('label', {}, [h('span', {}, 'Title'), title]));
    card.appendChild(h('label', {}, [h('span', {}, 'Description'), desc]));
    card.appendChild(h('label', {}, [h('span', {}, 'Why it matters'), why]));
    card.appendChild(h('label', {}, [h('span', {}, 'Effort estimate'), eff]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        if (!title.value.trim()) { alert('Title required'); return; }
        try {
          await api.createIdea(this.selectedIntern.id, {
            title: title.value, description: desc.value || null, why_matters: why.value || null, estimated_effort: eff.value || null,
          });
          closeModal(); app.renderView();
        } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Submit'),
    ]));
    openModal(card);
  },

  newLearningModal() {
    const card = h('div');
    card.appendChild(h('h3', {}, '📚 Log a learning'));
    const what = h('textarea', { name: 'what_learnt', placeholder: 'What did you learn?' });
    const cat = h('select', { name: 'category' }, ['general','tools','frameworks','domain','soft_skills','technical'].map((c) => h('option', { value: c }, c)));
    const src = h('input', { type: 'text', name: 'source', placeholder: 'book / video / work / mentor' });
    const apply = h('textarea', { name: 'how_to_apply', placeholder: 'How will you apply this?' });
    const link = h('input', { type: 'url', name: 'linked_doc', placeholder: 'https://...' });
    card.appendChild(h('label', {}, [h('span', {}, 'What you learnt'), what]));
    card.appendChild(h('div', { class: 'form-row' }, [
      h('label', {}, [h('span', {}, 'Category'), cat]),
      h('label', {}, [h('span', {}, 'Source'), src]),
    ]));
    card.appendChild(h('label', {}, [h('span', {}, 'How to apply'), apply]));
    card.appendChild(h('label', {}, [h('span', {}, 'Linked doc'), link]));
    card.appendChild(h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: async () => {
        if (!what.value.trim()) { alert('Required'); return; }
        try {
          await api.createLearning(this.selectedIntern.id, {
            what_learnt: what.value, category: cat.value, source: src.value || null,
            how_to_apply: apply.value || null, linked_doc: link.value || null,
          });
          closeModal(); app.renderView();
        } catch (e) { alert('Failed: ' + e.message); }
      } }, 'Save'),
    ]));
    openModal(card);
  },

  renderLearningsPie(canvas, learns, field) {
    if (!window.Chart) return;
    const counts = {};
    learns.forEach((l) => { const v = l[field] || 'unspecified'; counts[v] = (counts[v] || 0) + 1; });
    const labels = Object.keys(counts);
    const data = Object.values(counts);
    const palette = ['#2563eb','#16a34a','#d97706','#dc2626','#8b5cf6','#ec4899','#10b981','#6b7280'];
    this.charts['learn_' + field] = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: labels.map((_, i) => palette[i % palette.length]), borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } },
    });
  },

  // ============== DOCS ==============
  async renderDocs(root) {
    root.appendChild(h('div', { class: 'greeting' }, 'Docs from my RM'));
    root.appendChild(h('div', { class: 'greeting-sub' }, "SOPs, briefs, references shared with you or your team."));
    const vTag = internVerticalTag(this.selectedIntern);
    const [docs, acks] = await Promise.all([api.listDocsForIntern(this.selectedIntern.id, vTag), api.getMyDocAcks(this.selectedIntern.id)]);
    const ackedIds = new Set(acks.map((a) => a.doc_id));
    if (!docs.length) { root.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty-state' }, 'No docs shared yet.'))); return; }
    // Resolve sharer names
    const sharerIds = Array.from(new Set(docs.map((d) => d.shared_by_id).filter(Boolean)));
    const sharersById = sharerIds.length ? await api.profilesById(sharerIds) : {};
    const card = h('div', { class: 'table-card' });
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, [
      h('th', {}, 'Date'), h('th', {}, 'Title'), h('th', {}, 'Shared by'),
      h('th', {}, 'Type'), h('th', {}, 'Link'), h('th', {}, 'Read?'),
    ])));
    const tb = h('tbody');
    docs.forEach((d) => {
      const read = ackedIds.has(d.id);
      const sharer = sharersById[d.shared_by_id]?.full_name || '—';
      const tr = h('tr');
      tr.appendChild(h('td', { style: 'white-space:nowrap;' }, formatDate(d.created_at)));
      tr.appendChild(h('td', {}, [
        h('div', { style: 'font-weight:500;' }, d.title),
        d.notes ? h('div', { style: 'font-size:12px; color:var(--text-mute); margin-top:2px;' }, d.notes) : null,
        d.vertical === 'all' ? h('div', { style: 'font-size:11px; color:var(--text-mute); margin-top:2px;' }, '🌐 Shared with whole cohort') : null,
      ]));
      tr.appendChild(h('td', {}, sharer));
      tr.appendChild(h('td', {}, h('span', { class: 'badge', style: 'background:var(--surface-3); color:var(--text-soft);' }, d.doc_type)));
      tr.appendChild(h('td', {}, d.drive_link ? h('a', { href: d.drive_link, target: '_blank' }, 'open ↗') : '—'));
      tr.appendChild(h('td', {}, read ? h('span', { class: 'badge badge-approved' }, '✓ Read') :
        h('button', { class: 'btn-tiny ok', onclick: async () => { await api.ackDoc(d.id, this.selectedIntern.id); app.renderView(); } }, 'Mark read')));
      tb.appendChild(tr);
    });
    table.appendChild(tb); card.appendChild(table); root.appendChild(card);
  },
};

function approvalBadge(status) {
  const map = { pending: ['Pending RM approval', 'badge-pending'], approved: ['Approved', 'badge-approved'], rejected: ['Rejected', 'badge-rejected'] };
  const [text, cls] = map[status] || ['—', 'badge-pending'];
  return h('span', { class: 'badge ' + cls, style: 'margin-left:8px; font-size:11px;' }, text);
}
function statCard(label, value, sub) {
  return h('div', { class: 'stat-card' }, [
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, value),
    sub && h('div', { class: 'stat-sub' }, sub),
  ]);
}
function legendDot(color, label) {
  return h('span', {}, [h('span', { class: 'dot', style: { background: color } }), label]);
}
