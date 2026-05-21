// All Supabase queries live here.
// All queries filter for Growth Lab cohort via tag = 'growth_lab'.

const api = {
  // ===== INTERNS =====
  async listInterns() {
    const { data, error } = await getSupabase()
      .from('interns')
      .select('id, name, intern_code, email_alias, auth_user_id, supervisor_id, status, start_date, tags')
      .contains('tags', ['growth_lab'])
      .eq('status', 'active')
      .order('intern_code');
    if (error) throw error;
    return data || [];
  },

  async listInternsForAuthUser(authUserId) {
    const { data, error } = await getSupabase()
      .from('interns')
      .select('id, name, intern_code, tags, supervisor_id, start_date')
      .eq('auth_user_id', authUserId)
      .contains('tags', ['growth_lab'])
      .eq('status', 'active')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async listInternsForSupervisor(supId) {
    const { data, error } = await getSupabase()
      .from('interns')
      .select('id, name, intern_code, tags, supervisor_id, start_date, email_alias')
      .eq('supervisor_id', supId)
      .contains('tags', ['growth_lab'])
      .eq('status', 'active')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  // ===== ATTENDANCE =====
  async getTodayAttendance(internId) {
    const today = todayStr();
    const { data, error } = await getSupabase()
      .from('gl_attendance')
      .select('*')
      .eq('intern_id', internId)
      .eq('attendance_date', today)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getMonthAttendance(internId, year, month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const last = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    const { data, error } = await getSupabase()
      .from('gl_attendance')
      .select('*')
      .eq('intern_id', internId)
      .gte('attendance_date', start)
      .lte('attendance_date', end)
      .order('attendance_date');
    if (error) throw error;
    return data || [];
  },

  async checkIn(internId) {
    const today = todayStr();
    const now = new Date().toISOString();
    const { data, error } = await getSupabase()
      .from('gl_attendance')
      .upsert(
        {
          intern_id: internId,
          attendance_date: today,
          check_in_time: now,
          status: 'present',
          approval_status: 'pending',
        },
        { onConflict: 'intern_id,attendance_date', ignoreDuplicates: false }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async checkOut(internId, summary) {
    const today = todayStr();
    const { data: existing } = await getSupabase()
      .from('gl_attendance')
      .select('*')
      .eq('intern_id', internId)
      .eq('attendance_date', today)
      .single();
    if (!existing) throw new Error('No check-in record for today. Check in first.');
    const checkInTime = new Date(existing.check_in_time);
    const now = new Date();
    const hours = Math.round(((now - checkInTime) / 3600000) * 100) / 100;
    const { data, error } = await getSupabase()
      .from('gl_attendance')
      .update({
        check_out_time: now.toISOString(),
        hours_worked: hours,
        daily_work_summary: summary,
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async approveAttendance(attendanceId, action, remarks, approverId) {
    const update = {
      approval_status: action, // 'approved' | 'rejected'
      approved_by_id: approverId,
      approved_at: new Date().toISOString(),
    };
    if (remarks) update.rm_remarks = remarks;
    const { data, error } = await getSupabase()
      .from('gl_attendance')
      .update(update)
      .eq('id', attendanceId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async listPendingForSupervisor(supId) {
    // Get pending attendance for interns supervised by this person
    const { data, error } = await getSupabase()
      .from('gl_attendance')
      .select('*, interns!inner(id, name, intern_code, supervisor_id, tags)')
      .eq('approval_status', 'pending')
      .eq('interns.supervisor_id', supId)
      .order('attendance_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async listAllPending() {
    const { data, error } = await getSupabase()
      .from('gl_attendance')
      .select('*, interns!inner(id, name, intern_code, tags, supervisor_id)')
      .eq('approval_status', 'pending')
      .contains('interns.tags', ['growth_lab'])
      .order('attendance_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async listTeamAttendanceToday(internIds) {
    if (!internIds || !internIds.length) return [];
    const today = todayStr();
    const { data, error } = await getSupabase()
      .from('gl_attendance')
      .select('*')
      .in('intern_id', internIds)
      .eq('attendance_date', today);
    if (error) throw error;
    return data || [];
  },

  async getMonthSummaryForIntern(internId) {
    // Returns {present, half, absent, leave, wfh, sick, totalDays, pct}
    const d = new Date();
    const records = await this.getMonthAttendance(internId, d.getFullYear(), d.getMonth() + 1);
    const counts = { present: 0, 'half-day': 0, absent: 0, leave: 0, wfh: 0, sick: 0 };
    records.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const totalCounted = counts.present + counts.absent + counts['half-day'];
    const pct = totalCounted === 0 ? null : Math.round(((counts.present + counts['half-day'] * 0.5) / totalCounted) * 100);
    return { ...counts, totalDays: records.length, pct };
  },

  // ===== PROFILES =====
  async getProfile(userId) {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  },
};

// Helper: derive vertical from intern.tags
function internVertical(intern) {
  if (!intern || !intern.tags) return '—';
  for (const tag of intern.tags) {
    if (TAG_TO_VERTICAL[tag]) return TAG_TO_VERTICAL[tag];
  }
  return '—';
}

// Helper: RM name from supervisor_id (resolved against a profiles map)
function rmNameFor(intern, profilesById) {
  const p = profilesById[intern.supervisor_id];
  return p ? p.full_name : '—';
}
