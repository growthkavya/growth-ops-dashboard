// Intern view: home (check-in/out + streak), attendance calendar.
const internView = {
  selectedIntern: null,
  myInterns: [],

  async mount(rootEl) {
    rootEl.innerHTML = '';
    // Load all interns tied to this auth user (1 or many for shared mailboxes)
    this.myInterns = await api.listInternsForAuthUser(auth.user.id);
    if (this.myInterns.length === 0) {
      rootEl.appendChild(h('div', { class: 'empty-state' },
        "You don't have any active intern profiles linked to this account yet. Tell Kavya or Vidyut."));
      return;
    }
    // Resolve which intern is selected (single or picker)
    const savedId = localStorage.getItem('gl_selected_intern_id');
    if (this.myInterns.length === 1) {
      this.selectedIntern = this.myInterns[0];
    } else if (savedId && this.myInterns.find((i) => i.id === savedId)) {
      this.selectedIntern = this.myInterns.find((i) => i.id === savedId);
    } else {
      this.showPicker();
      return;
    }
    await this.renderHome(rootEl);
  },

  showPicker() {
    $('#picker-screen').classList.remove('hidden');
    $('#app').classList.add('hidden');
    const list = $('#picker-list');
    list.innerHTML = '';
    this.myInterns.forEach((intern) => {
      const initials = intern.name.split(' ').slice(0, 2).map((s) => s[0]).join('');
      const btn = h('button', { class: 'picker-option', onclick: () => this.choose(intern) }, [
        h('span', { class: 'picker-avatar' }, initials),
        h('div', {}, [
          h('div', {}, intern.name),
          h('div', { class: 'picker-meta' }, internVertical(intern) + ' · ' + intern.intern_code),
        ]),
      ]);
      list.appendChild(btn);
    });
  },

  choose(intern) {
    this.selectedIntern = intern;
    localStorage.setItem('gl_selected_intern_id', intern.id);
    localStorage.setItem('gl_selected_intern_name', intern.name);
    $('#picker-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    app.refreshChrome();
    app.renderView();
  },

  async renderHome(rootEl) {
    rootEl.innerHTML = '';
    const intern = this.selectedIntern;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    rootEl.appendChild(h('div', { class: 'greeting' }, `${greeting}, ${intern.name.split(' ')[0]}.`));
    const dayNum = Math.max(1, daysBetween(todayStr(), intern.start_date) + 1);
    rootEl.appendChild(h('div', { class: 'greeting-sub' },
      `Day ${dayNum} of your internship · ${internVertical(intern)}`));

    // Check-in card
    const ci = h('div', { class: 'checkin-card' });
    rootEl.appendChild(ci);
    await this.renderCheckin(ci);

    // Stats row
    const stats = h('div', { class: 'stat-row' });
    rootEl.appendChild(stats);
    await this.renderStats(stats);

    // Calendar
    const cal = h('div', { class: 'calendar-card' });
    rootEl.appendChild(cal);
    await this.renderCalendar(cal);
  },

  async renderCheckin(card) {
    card.innerHTML = '';
    let today;
    try {
      today = await api.getTodayAttendance(this.selectedIntern.id);
    } catch (e) {
      card.appendChild(h('div', { class: 'error-text' }, 'Failed to load attendance: ' + e.message));
      return;
    }

    const info = h('div');
    const btnCol = h('div');

    if (!today) {
      info.appendChild(h('div', { class: 'checkin-status' }, 'Status'));
      info.appendChild(h('div', { class: 'checkin-state' }, 'Not checked in'));
      info.appendChild(h('div', { class: 'checkin-meta' }, "Tap CHECK IN when you've started your day."));
      const btn = h('button', { class: 'btn-checkin', onclick: () => this.handleCheckIn(card) }, 'CHECK IN');
      btnCol.appendChild(btn);
    } else if (today.check_in_time && !today.check_out_time) {
      info.appendChild(h('div', { class: 'checkin-status' }, 'Status'));
      info.appendChild(h('div', { class: 'checkin-state' }, '✓ Checked in'));
      info.appendChild(h('div', { class: 'checkin-meta' }, 'Started at ' + formatTime(today.check_in_time)));
      const btn = h('button', { class: 'btn-checkin checkout', onclick: () => this.handleCheckOut(card, today) }, 'CHECK OUT');
      btnCol.appendChild(btn);
    } else {
      // Already checked out
      const badge = approvalBadge(today.approval_status);
      info.appendChild(h('div', { class: 'checkin-status' }, "Today's attendance"));
      info.appendChild(h('div', { class: 'checkin-state' }, [
        '✓ Done for today ',
        badge,
      ]));
      info.appendChild(h('div', { class: 'checkin-meta' },
        `In ${formatTime(today.check_in_time)} · Out ${formatTime(today.check_out_time)} · ${today.hours_worked || '?'} hrs`));
      if (today.rm_remarks) {
        info.appendChild(h('div', { class: 'checkin-meta', style: 'margin-top:8px; font-style:italic;' },
          `RM note: ${today.rm_remarks}`));
      }
    }

    card.appendChild(info);
    card.appendChild(btnCol);
  },

  async handleCheckIn(card) {
    try {
      await api.checkIn(this.selectedIntern.id);
      await this.renderCheckin(card);
      this.refreshStatsAndCalendar();
    } catch (e) {
      alert('Check-in failed: ' + e.message);
    }
  },

  handleCheckOut(card, today) {
    // Show inline form for daily work summary
    card.innerHTML = '';
    const form = h('div', { class: 'checkout-form' });
    form.appendChild(h('label', {}, [
      h('span', {}, 'What did you do today? (required)'),
      h('textarea', { id: 'cko-summary', placeholder: 'Brief summary — 1-3 lines is fine. RM uses this to approve.' }),
    ]));
    form.appendChild(h('div', { class: 'form-actions' }, [
      h('button', { class: 'btn-ghost', onclick: () => this.renderCheckin(card) }, 'Cancel'),
      h('button', { class: 'btn-primary', style: 'width:auto;', onclick: async () => {
        const summary = $('#cko-summary').value.trim();
        if (!summary) { alert('Daily work summary is required.'); return; }
        try {
          await api.checkOut(this.selectedIntern.id, summary);
          await this.renderCheckin(card);
          this.refreshStatsAndCalendar();
        } catch (e) { alert('Check-out failed: ' + e.message); }
      } }, 'Submit & Check out'),
    ]));
    card.appendChild(h('div', {}, [
      h('div', { class: 'checkin-status' }, 'Status'),
      h('div', { class: 'checkin-state' }, 'Checking out…'),
      h('div', { class: 'checkin-meta' }, 'Started at ' + formatTime(today.check_in_time)),
    ]));
    card.appendChild(form);
  },

  async refreshStatsAndCalendar() {
    const statsEl = $('.stat-row', $('#view-mount'));
    const calEl = $('.calendar-card', $('#view-mount'));
    if (statsEl) await this.renderStats(statsEl);
    if (calEl) await this.renderCalendar(calEl);
  },

  async renderStats(row) {
    row.innerHTML = '';
    const summary = await api.getMonthSummaryForIntern(this.selectedIntern.id);
    const monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });
    row.appendChild(statCard('Attendance', summary.pct == null ? '—' : `${summary.pct}%`, monthName));
    row.appendChild(statCard('Days Present', String(summary.present), monthName));
    row.appendChild(statCard('Approved', String(await this.countApproved()), monthName));
    row.appendChild(statCard('Streak', String(await this.streak()) + ' day' + ((await this.streak()) === 1 ? '' : 's'), 'Consecutive'));
  },

  async countApproved() {
    const d = new Date();
    const records = await api.getMonthAttendance(this.selectedIntern.id, d.getFullYear(), d.getMonth() + 1);
    return records.filter((r) => r.approval_status === 'approved').length;
  },

  async streak() {
    // Count consecutive days backward where attendance was logged and not rejected
    const d = new Date();
    const records = await api.getMonthAttendance(this.selectedIntern.id, d.getFullYear(), d.getMonth() + 1);
    const byDate = {};
    records.forEach((r) => { byDate[r.attendance_date] = r; });
    let streak = 0;
    const cur = new Date();
    for (let i = 0; i < 31; i++) {
      const ds = cur.toISOString().slice(0, 10);
      const rec = byDate[ds];
      if (cur.getDay() === 0) { // Sunday — skip
        cur.setDate(cur.getDate() - 1);
        continue;
      }
      if (rec && rec.approval_status !== 'rejected' && (rec.status === 'present' || rec.status === 'half-day' || rec.status === 'wfh')) {
        streak++;
        cur.setDate(cur.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  },

  async renderCalendar(card) {
    card.innerHTML = '';
    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const monthName = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    card.appendChild(h('h3', { class: 'section-h' }, `Attendance — ${monthName}`));

    const records = await api.getMonthAttendance(this.selectedIntern.id, year, month);
    const byDate = {};
    records.forEach((r) => { byDate[r.attendance_date] = r; });

    const grid = h('div', { class: 'calendar-grid' });
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach((d) => grid.appendChild(h('div', { class: 'cal-day-name' }, d)));
    const first = new Date(year, month - 1, 1);
    const firstDow = (first.getDay() + 6) % 7; // Mon=0
    for (let i = 0; i < firstDow; i++) grid.appendChild(h('div', { class: 'cal-day empty' }));
    const lastDay = new Date(year, month, 0).getDate();
    const todayDate = todayStr();
    for (let day = 1; day <= lastDay; day++) {
      const ds = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const rec = byDate[ds];
      const dt = new Date(ds);
      const isSunday = dt.getDay() === 0;
      const isFuture = ds > todayDate;
      const isToday = ds === todayDate;
      let cls = 'cal-day';
      if (isSunday) cls += ' sunday';
      else if (isFuture) cls += ' future';
      else if (rec) {
        if (rec.approval_status === 'approved') cls += ' approved';
        else if (rec.approval_status === 'rejected') cls += ' rejected';
        else if (rec.status === 'absent') cls += ' absent';
        else cls += ' pending';
      }
      if (isToday) cls += ' today';
      grid.appendChild(h('div', { class: cls, title: rec ? `${rec.status} · ${rec.approval_status}` : (isSunday ? 'Off day' : '') }, [
        h('div', { class: 'cal-num' }, String(day)),
      ]));
    }
    card.appendChild(grid);

    // Legend
    const legend = h('div', { style: 'margin-top:14px; display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--text-soft);' }, [
      legendDot('#dcfce7', 'Approved'),
      legendDot('#fef9c3', 'Pending'),
      legendDot('#fee2e2', 'Absent / Rejected'),
      legendDot('#f8fafc', 'Off day'),
    ]);
    card.appendChild(legend);
  },
};

function approvalBadge(status) {
  const map = {
    pending: ['Pending RM approval', 'badge-pending'],
    approved: ['Approved', 'badge-approved'],
    rejected: ['Rejected', 'badge-rejected'],
  };
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
  return h('span', { style: 'display:inline-flex; align-items:center; gap:6px;' }, [
    h('span', { style: `display:inline-block; width:10px; height:10px; border-radius:3px; background:${color};` }),
    label,
  ]);
}
