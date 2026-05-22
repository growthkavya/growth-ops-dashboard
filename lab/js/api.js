// All Supabase queries live here. Growth Lab cohort filter via tag = 'growth_lab'.

const api = {
  // ===================================================================
  // INTERNS
  // ===================================================================
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
      .select('id, name, intern_code, tags, supervisor_id, start_date, auth_user_id, email_alias')
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
      .select('id, name, intern_code, tags, supervisor_id, start_date, email_alias, auth_user_id')
      .eq('supervisor_id', supId)
      .contains('tags', ['growth_lab'])
      .eq('status', 'active')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async getInternById(id) {
    const { data, error } = await getSupabase()
      .from('interns')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  // ===================================================================
  // ATTENDANCE
  // ===================================================================
  async getTodayAttendance(internId) {
    const { data, error } = await getSupabase()
      .from('gl_attendance').select('*')
      .eq('intern_id', internId).eq('attendance_date', todayStr()).maybeSingle();
    if (error) throw error;
    return data;
  },
  async getMonthAttendance(internId, year, month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const last = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    const { data, error } = await getSupabase().from('gl_attendance').select('*')
      .eq('intern_id', internId).gte('attendance_date', start).lte('attendance_date', end).order('attendance_date');
    if (error) throw error;
    return data || [];
  },
  async checkIn(internId) {
    const { data, error } = await getSupabase().from('gl_attendance').upsert(
      { intern_id: internId, attendance_date: todayStr(), check_in_time: new Date().toISOString(), status: 'present', approval_status: 'pending' },
      { onConflict: 'intern_id,attendance_date', ignoreDuplicates: false }
    ).select().single();
    if (error) throw error;
    return data;
  },
  async checkOut(internId, summary) {
    const today = todayStr();
    const { data: existing } = await getSupabase().from('gl_attendance').select('*')
      .eq('intern_id', internId).eq('attendance_date', today).single();
    if (!existing) throw new Error('No check-in record. Check in first.');
    const hours = Math.round(((new Date() - new Date(existing.check_in_time)) / 3600000) * 100) / 100;
    const { data, error } = await getSupabase().from('gl_attendance')
      .update({ check_out_time: new Date().toISOString(), hours_worked: hours, daily_work_summary: summary })
      .eq('id', existing.id).select().single();
    if (error) throw error;
    return data;
  },
  async editAttendance(id, fields) {
    const { data, error } = await getSupabase().from('gl_attendance')
      .update(fields).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async approveAttendance(id, action, remarks, approverId) {
    const update = { approval_status: action, approved_by_id: approverId, approved_at: new Date().toISOString() };
    if (remarks != null) update.rm_remarks = remarks;
    const { data, error } = await getSupabase().from('gl_attendance').update(update).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async rmMarkOnBehalf(internId, date, status, summary) {
    // RM can backfill attendance on behalf of an intern (e.g. intern forgot to check in)
    const { data, error } = await getSupabase().from('gl_attendance').upsert(
      { intern_id: internId, attendance_date: date, status, daily_work_summary: summary || 'Marked on behalf by RM',
        approval_status: 'approved', approved_at: new Date().toISOString() },
      { onConflict: 'intern_id,attendance_date', ignoreDuplicates: false }
    ).select().single();
    if (error) throw error;
    return data;
  },
  async listAuditForAttendance(id) {
    const { data, error } = await getSupabase().from('gl_attendance_audit')
      .select('*').eq('attendance_id', id).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async listPendingForSupervisor(supId) {
    const { data, error } = await getSupabase().from('gl_attendance')
      .select('*, interns!inner(id, name, intern_code, supervisor_id, tags)')
      .eq('approval_status', 'pending').eq('interns.supervisor_id', supId)
      .order('attendance_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async listAllPending() {
    const { data, error } = await getSupabase().from('gl_attendance')
      .select('*, interns!inner(id, name, intern_code, tags, supervisor_id)')
      .eq('approval_status', 'pending').contains('interns.tags', ['growth_lab'])
      .order('attendance_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async listTeamAttendanceToday(internIds) {
    if (!internIds?.length) return [];
    const { data, error } = await getSupabase().from('gl_attendance').select('*')
      .in('intern_id', internIds).eq('attendance_date', todayStr());
    if (error) throw error;
    return data || [];
  },
  async listTeamAttendanceRecent(internIds, days = 14) {
    if (!internIds?.length) return [];
    const start = new Date(); start.setDate(start.getDate() - days);
    const startStr = start.toISOString().slice(0, 10);
    const { data, error } = await getSupabase().from('gl_attendance')
      .select('*, interns!inner(name, intern_code)')
      .in('intern_id', internIds).gte('attendance_date', startStr)
      .order('attendance_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async getMonthSummaryForIntern(internId) {
    const d = new Date();
    const records = await this.getMonthAttendance(internId, d.getFullYear(), d.getMonth() + 1);
    const counts = { present: 0, 'half-day': 0, absent: 0, leave: 0, wfh: 0, sick: 0 };
    records.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const totalCounted = counts.present + counts.absent + counts['half-day'];
    const pct = totalCounted === 0 ? null : Math.round(((counts.present + counts['half-day'] * 0.5) / totalCounted) * 100);
    return { ...counts, totalDays: records.length, pct };
  },

  // ===================================================================
  // DAILY CHECK-IN (narrative)
  // ===================================================================
  async getTodayCheckin(internId) {
    const { data, error } = await getSupabase().from('gl_daily_checkin').select('*')
      .eq('intern_id', internId).eq('checkin_date', todayStr()).maybeSingle();
    if (error) throw error;
    return data;
  },
  async listCheckins(internId, limit = 30) {
    const { data, error } = await getSupabase().from('gl_daily_checkin').select('*')
      .eq('intern_id', internId).order('checkin_date', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },
  async upsertCheckin(internId, fields) {
    const body = { intern_id: internId, checkin_date: fields.checkin_date || todayStr(), ...fields };
    const { data, error } = await getSupabase().from('gl_daily_checkin').upsert(body, { onConflict: 'intern_id,checkin_date' }).select().single();
    if (error) throw error;
    return data;
  },
  async acknowledgeCheckin(id, rmComment) {
    const { data, error } = await getSupabase().from('gl_daily_checkin').update({
      rm_acknowledged: true, rm_acknowledged_at: new Date().toISOString(), rm_comment: rmComment || null,
    }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async listTeamCheckinsRecent(internIds, days = 14) {
    if (!internIds?.length) return [];
    const start = new Date(); start.setDate(start.getDate() - days);
    const { data, error } = await getSupabase().from('gl_daily_checkin')
      .select('*, interns!inner(name)')
      .in('intern_id', internIds).gte('checkin_date', start.toISOString().slice(0, 10))
      .order('checkin_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // ===================================================================
  // TASKS
  // ===================================================================
  async listTasksForIntern(internId, filter = {}) {
    let q = getSupabase().from('gl_task').select('*').eq('intern_id', internId).order('due_date', { ascending: true });
    if (filter.activeOnly) q = q.not('status', 'in', '("done","cancelled")');
    if (filter.type) q = q.eq('task_type', filter.type);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async listTasksForTeam(internIds, filter = {}) {
    if (!internIds?.length) return [];
    let q = getSupabase().from('gl_task').select('*, interns!inner(name)').in('intern_id', internIds).order('due_date', { ascending: true });
    if (filter.activeOnly) q = q.not('status', 'in', '("done","cancelled")');
    if (filter.type) q = q.eq('task_type', filter.type);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async createTask(payload) {
    const body = { ...payload, week_of: payload.task_type === 'weekly' ? (payload.week_of || mondayOf(new Date())) : null };
    const { data, error } = await getSupabase().from('gl_task').insert(body).select().single();
    if (error) throw error;
    return data;
  },
  async updateTask(id, fields) {
    if (fields.status === 'done' && !fields.done_at) fields.done_at = new Date().toISOString();
    const { data, error } = await getSupabase().from('gl_task').update(fields).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteTask(id) {
    const { error } = await getSupabase().from('gl_task').delete().eq('id', id);
    if (error) throw error;
  },

  // ===================================================================
  // KRAs (high-level monthly goals)
  // ===================================================================
  async listKRAs(internId, month) {
    const monthStart = month || monthStartStr();
    const { data, error } = await getSupabase().from('gl_kra')
      .select('*').eq('intern_id', internId).eq('period_month', monthStart).order('kra_index');
    if (error) throw error;
    return data || [];
  },
  async upsertKRA(payload) {
    const { data, error } = await getSupabase().from('gl_kra')
      .upsert(payload, { onConflict: 'intern_id,period_month,kra_index' }).select().single();
    if (error) throw error;
    return data;
  },

  // ===================================================================
  // KPIs (measurables under KRAs)
  // ===================================================================
  async listKPIs(internId, month) {
    const monthStart = month || monthStartStr();
    const { data, error } = await getSupabase().from('gl_kpi')
      .select('*').eq('intern_id', internId).eq('period_month', monthStart).order('kpi_index');
    if (error) throw error;
    return data || [];
  },
  async upsertKPI(payload) {
    const { data, error } = await getSupabase().from('gl_kpi')
      .upsert(payload, { onConflict: 'intern_id,period_month,kpi_index' }).select().single();
    if (error) throw error;
    return data;
  },

  // ===================================================================
  // IDEAS
  // ===================================================================
  async listIdeasForIntern(internId) {
    const { data, error } = await getSupabase().from('gl_idea').select('*').eq('intern_id', internId).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async listIdeasForTeam(internIds, status = null) {
    if (!internIds?.length) return [];
    let q = getSupabase().from('gl_idea').select('*, interns!inner(name)').in('intern_id', internIds).order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async createIdea(internId, fields) {
    const { data, error } = await getSupabase().from('gl_idea').insert({ intern_id: internId, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
  async decideIdea(id, status, decisionNotes, deciderId) {
    const { data, error } = await getSupabase().from('gl_idea').update({
      status, decision_notes: decisionNotes, decided_by_id: deciderId, decided_at: new Date().toISOString(),
    }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ===================================================================
  // LEARNINGS
  // ===================================================================
  async listLearnings(internId, limit = 100) {
    const { data, error } = await getSupabase().from('gl_learning').select('*').eq('intern_id', internId)
      .order('learning_date', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },
  async createLearning(internId, fields) {
    const { data, error } = await getSupabase().from('gl_learning').insert({ intern_id: internId, ...fields }).select().single();
    if (error) throw error;
    return data;
  },
  async listLearningsForTeam(internIds, limit = 50) {
    if (!internIds?.length) return [];
    const { data, error } = await getSupabase().from('gl_learning')
      .select('*, interns!inner(name)').in('intern_id', internIds)
      .order('learning_date', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  // ===================================================================
  // DOCS
  // ===================================================================
  async listDocsForIntern(internId, vertical) {
    // RLS does the filtering server-side. Just pull everything we're allowed to see.
    // Direct shares (intern_id = me), vertical shares (my vertical), and cohort-wide ('all') all return.
    const { data, error } = await getSupabase()
      .from('gl_doc')
      .select('*')
      .or(`intern_id.eq.${internId},vertical.eq.${vertical || 'none'},vertical.eq.all`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async listDocsForTeam(vertical) {
    // RM view: see all docs they shared OR all docs targeted at their vertical
    let q = getSupabase().from('gl_doc').select('*, interns(name)').order('created_at', { ascending: false });
    if (vertical) q = q.or(`vertical.eq.${vertical},shared_by_id.eq.${auth.user.id}`);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async shareDoc(payload) {
    const body = { shared_by_id: auth.user.id, ...payload };
    const { data, error } = await getSupabase().from('gl_doc').insert(body).select().single();
    if (error) throw error;
    return data;
  },
  async deleteDoc(id) {
    const { error } = await getSupabase().from('gl_doc').delete().eq('id', id);
    if (error) throw error;
  },
  async ackDoc(docId, internId) {
    const { data, error } = await getSupabase().from('gl_doc_ack').upsert({ doc_id: docId, intern_id: internId }, { onConflict: 'doc_id,intern_id' }).select().single();
    if (error) throw error;
    return data;
  },
  async listDocAcks(docId) {
    const { data, error } = await getSupabase().from('gl_doc_ack')
      .select('*, interns(name)').eq('doc_id', docId).order('acknowledged_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async getMyDocAcks(internId) {
    const { data, error } = await getSupabase().from('gl_doc_ack')
      .select('doc_id, acknowledged_at').eq('intern_id', internId);
    if (error) throw error;
    return data || [];
  },

  // ===================================================================
  // NOTIFICATIONS
  // ===================================================================
  async listNotifications(limit = 30) {
    const { data, error } = await getSupabase().from('gl_notification').select('*')
      .eq('recipient_id', auth.user.id).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },
  async unreadCount() {
    const { count, error } = await getSupabase().from('gl_notification')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', auth.user.id).eq('is_read', false);
    if (error) throw error;
    return count || 0;
  },
  async markNotifRead(id) {
    const { error } = await getSupabase().from('gl_notification').update({ is_read: true }).eq('id', id);
    if (error) throw error;
  },
  async markAllNotifsRead() {
    const { error } = await getSupabase().from('gl_notification').update({ is_read: true })
      .eq('recipient_id', auth.user.id).eq('is_read', false);
    if (error) throw error;
  },

  // ===================================================================
  // ACTIVITY FEED (uses the view from migration)
  // ===================================================================
  async listActivityForTeam(internIds, limit = 50) {
    if (!internIds?.length) return [];
    const { data, error } = await getSupabase().from('gl_activity_feed')
      .select('*').in('intern_id', internIds).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },
  async listAllActivity(limit = 100) {
    const { data, error } = await getSupabase().from('gl_activity_feed')
      .select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },

  // ===================================================================
  // 1:1 RECORDS
  // ===================================================================
  async list1on1s(internId) {
    const { data, error } = await getSupabase().from('gl_one_on_one').select('*').eq('intern_id', internId).order('meeting_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async upsert1on1(payload) {
    const { data, error } = await getSupabase().from('gl_one_on_one').upsert(payload).select().single();
    if (error) throw error;
    return data;
  },

  // ===================================================================
  // PERFORMANCE REVIEWS
  // ===================================================================
  async listReviews(internId) {
    const { data, error } = await getSupabase().from('gl_perf_review').select('*').eq('intern_id', internId).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async upsertReview(payload) {
    const { data, error } = await getSupabase().from('gl_perf_review').upsert(payload, { onConflict: 'intern_id,review_period' }).select().single();
    if (error) throw error;
    return data;
  },
  async ackReview(id) {
    const { data, error } = await getSupabase().from('gl_perf_review').update({ intern_acknowledged_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ===================================================================
  // TASK TEMPLATES
  // ===================================================================
  async listTaskTemplates(vertical) {
    let q = getSupabase().from('gl_task_template').select('*').eq('is_archived', false).order('use_count', { ascending: false });
    if (vertical) q = q.or(`vertical.eq.${vertical},vertical.is.null,owner_id.eq.${auth.user.id}`);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async createTaskTemplate(payload) {
    const body = { owner_id: auth.user.id, ...payload };
    const { data, error } = await getSupabase().from('gl_task_template').insert(body).select().single();
    if (error) throw error;
    return data;
  },
  async incrementTaskTemplateUse(id) {
    // best-effort; ignore failure
    try {
      const { data } = await getSupabase().from('gl_task_template').select('use_count').eq('id', id).single();
      if (data) await getSupabase().from('gl_task_template').update({ use_count: (data.use_count || 0) + 1 }).eq('id', id);
    } catch {}
  },

  // ===================================================================
  // COMMENTS (generic threading)
  // ===================================================================
  async listComments(entityType, entityId) {
    const { data, error } = await getSupabase().from('gl_comment').select('*')
      .eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async postComment(payload) {
    const body = {
      author_id: auth.user.id,
      author_name: auth.profile?.full_name,
      author_role: auth.profile?.role,
      ...payload,
    };
    const { data, error } = await getSupabase().from('gl_comment').insert(body).select().single();
    if (error) throw error;
    return data;
  },

  // ===================================================================
  // PROFILES (lookup helpers)
  // ===================================================================
  async profilesById(ids) {
    if (!ids?.length) return {};
    const { data, error } = await getSupabase().from('profiles').select('id, full_name').in('id', ids);
    if (error) throw error;
    const map = {};
    (data || []).forEach((p) => { map[p.id] = p; });
    return map;
  },
};

// Helpers
function internVertical(intern) {
  if (!intern?.tags) return '—';
  for (const tag of intern.tags) if (TAG_TO_VERTICAL[tag]) return TAG_TO_VERTICAL[tag];
  return '—';
}
function internVerticalTag(intern) {
  if (!intern?.tags) return null;
  for (const tag of intern.tags) if (TAG_TO_VERTICAL[tag]) return tag;
  return null;
}

// Default KPI templates per vertical
const KPI_TEMPLATES = {
  'Growth Ops': [
    { label: 'Projects/automations shipped/week', target: '2' },
    { label: 'Process SOPs documented/week', target: '1' },
    { label: 'Cross-team tickets closed/week', target: '5' },
    { label: 'Data/dashboard tasks delivered on time', target: '90%' },
    { label: 'RM Quality Score (1-5)', target: '4' },
  ],
  'Performance': [
    { label: 'Ads + creative variants launched/week', target: '5' },
    { label: 'CTR', target: '2%' },
    { label: 'CAC / Cost per lead', target: 'set by RM' },
    { label: 'Spend within budget', target: '100%' },
    { label: 'A/B tests completed/week', target: '1' },
  ],
  'Organic': [
    { label: 'Content pieces shipped/week', target: '5' },
    { label: 'Reach — combined platform views/week', target: 'set by RM' },
    { label: 'Engagement rate', target: 'set by RM' },
    { label: 'Audit pass rate ≥8.5/10', target: '90%' },
    { label: 'New formats/experiments tried/week', target: '1' },
  ],
  'Product & Content': [
    { label: 'Content drafts shipped/week', target: '3' },
    { label: 'LLM Council audit pass ≥8.5/10', target: '90%' },
    { label: 'Source files processed/week', target: '5' },
    { label: 'Curriculum coverage progress', target: 'set by RM' },
    { label: 'RM Quality Score (1-5)', target: '4' },
  ],
};

const KRA_TEMPLATES = {
  'Growth Ops': [
    { title: 'Data hygiene + reporting', target_outcome: 'Single source of truth for every dashboard' },
    { title: 'Process automation', target_outcome: 'Cut manual hours per week by 30%' },
    { title: 'Cross-team coordination', target_outcome: 'Unblock other teams within 24h' },
    { title: 'Project execution', target_outcome: 'Ship Growth Ops projects on time' },
    { title: 'Learning velocity', target_outcome: '1 new tool or framework per month' },
  ],
  'Performance': [
    { title: 'Campaign performance', target_outcome: 'Hit ROAS target on every active campaign' },
    { title: 'Creative experimentation', target_outcome: 'Run weekly A/B tests' },
    { title: 'Budget management', target_outcome: 'Stay within budget every week' },
    { title: 'Audience research', target_outcome: 'Build 2 new segments per month' },
    { title: 'Reporting clarity', target_outcome: 'Weekly performance report shared every Monday' },
  ],
  'Organic': [
    { title: 'Content output cadence', target_outcome: 'Consistent shipping rhythm' },
    { title: 'Engagement growth', target_outcome: 'Quarterly engagement up 20%' },
    { title: 'Format experimentation', target_outcome: 'New format every week' },
    { title: 'Community building', target_outcome: 'Respond to every DM and comment' },
    { title: 'Brand voice consistency', target_outcome: '90% audit pass on tone' },
  ],
  'Product & Content': [
    { title: 'Curriculum coverage', target_outcome: 'X% of syllabus drafted by month-end' },
    { title: 'Quality threshold', target_outcome: '≥8.5/10 on LLM Council audit, 90% pass rate' },
    { title: 'Production velocity', target_outcome: 'Shipping rhythm hit consistently' },
    { title: 'Source extraction', target_outcome: 'Process source files within 48h of receipt' },
    { title: 'Domain expertise', target_outcome: 'Demonstrate deepening understanding of subject' },
  ],
};
