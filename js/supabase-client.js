// Supabase Client - Initialize and export as window.sb
(function() {
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.sb = client;
})();

// Global reference for other modules
var supabase = window.sb;

// Database helper functions
const db = {
    // ========================================
    // KRAs (Year 2 framework)
    // ========================================
    async getKRAs() {
        const { data, error } = await supabase
            .from('kras')
            .select('*')
            .order('sort_order');
        if (error) throw error;
        return data;
    },

    // ========================================
    // Actions
    // ========================================
    async getActions() {
        // Disambiguate the FK from actions → profiles. Two FKs exist:
        //   assignee_id (original) and assigned_by (RBAC migration).
        // Without aliases PostgREST returns 406 'ambiguous relationship'.
        const { data, error } = await supabase
            .from('actions')
            .select(`
                *,
                kpis(name, member, kpi_code),
                kras(kra_code, name, short_name, sort_order),
                assignee:assignee_id(full_name),
                assigner:assigned_by(full_name)
            `)
            .order('action_id');
        if (error) throw error;
        return data;
    },

    async createAction(action) {
        const { data, error } = await supabase
            .from('actions')
            .insert(action)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateAction(id, updates) {
        const { data, error } = await supabase
            .from('actions')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ========================================
    // Goals
    // ========================================
    async getGoals() {
        const { data, error } = await supabase
            .from('goals')
            .select('*, profiles(full_name)')
            .order('created_at');
        if (error) throw error;
        return data;
    },

    async createGoal(goal) {
        const { data, error } = await supabase
            .from('goals')
            .insert(goal)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateGoal(id, updates) {
        const { data, error } = await supabase
            .from('goals')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteGoal(id) {
        const { error } = await supabase
            .from('goals')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ========================================
    // KPIs
    // ========================================
    async getKPIs() {
        // Ordered by KRA → member → sort_order so the UI can group cleanly.
        const { data, error } = await supabase
            .from('kpis')
            .select('*, kras(kra_code, name, short_name, sort_order)')
            .order('sort_order');
        if (error) throw error;
        // Sort in JS: KRA order → member order → kpi sort_order
        const memberOrder = { kavya: 1, riya: 2 };
        return (data || []).sort((a, b) => {
            const aOrder = a.kras?.sort_order ?? 99;
            const bOrder = b.kras?.sort_order ?? 99;
            if (aOrder !== bOrder) return aOrder - bOrder;
            const am = memberOrder[a.member] || 99;
            const bm = memberOrder[b.member] || 99;
            if (am !== bm) return am - bm;
            return (a.sort_order || 0) - (b.sort_order || 0);
        });
    },

    async getKPIScores() {
        const { data, error } = await supabase
            .from('kpi_scores')
            .select('*, kpis(name, member, kpi_code)')
            .order('year', { ascending: false })
            .order('month', { ascending: false });
        if (error) throw error;
        return data;
    },

    async upsertKPIScore(score) {
        const { data, error } = await supabase
            .from('kpi_scores')
            .upsert(score, { onConflict: 'kpi_id,month,year' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ========================================
    // Ideas
    // ========================================
    async getIdeas(status = 'all') {
        let query = supabase
            .from('ideas')
            .select('*, profiles(full_name)')
            .order('updated_at', { ascending: false });

        if (status !== 'all') {
            query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async createIdea(idea) {
        const { data, error } = await supabase
            .from('ideas')
            .insert(idea)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateIdea(id, updates) {
        const { data, error } = await supabase
            .from('ideas')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteIdea(id) {
        const { error } = await supabase
            .from('ideas')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ========================================
    // Documents
    // ========================================
    async getDocuments() {
        const { data, error } = await supabase
            .from('documents')
            .select('*, profiles(full_name)')
            .order('type')
            .order('name');
        if (error) throw error;
        return data;
    },

    async createDocument(doc) {
        const { data, error } = await supabase
            .from('documents')
            .insert(doc)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteDocument(id) {
        const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ========================================
    // Weekly Logs
    // ========================================
    async getWeeklyLog(weekNumber, year) {
        const { data, error } = await supabase
            .from('weekly_logs')
            .select('*, daily_entries(*)')
            .eq('week_number', weekNumber)
            .eq('year', year)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async upsertWeeklyLog(log) {
        const { data, error } = await supabase
            .from('weekly_logs')
            .upsert(log, { onConflict: 'week_number,year' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async upsertDailyEntry(entry) {
        const { data, error } = await supabase
            .from('daily_entries')
            .upsert(entry, { onConflict: 'weekly_log_id,day' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ========================================
    // Activity Log
    // ========================================
    async getActivityLog(limit = 50) {
        const { data, error } = await supabase
            .from('activity_log')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    },

    async logActivity(userId, userName, action, entityType, entityId, entityTitle, changes = null) {
        const { error } = await supabase
            .from('activity_log')
            .insert({
                user_id: userId,
                user_name: userName,
                action,
                entity_type: entityType,
                entity_id: entityId,
                entity_title: entityTitle,
                changes
            });
        if (error) console.error('Failed to log activity:', error);
    },

    // ========================================
    // Profiles
    // ========================================
    async getProfiles() {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('full_name');
        if (error) throw error;
        return data;
    },

    async getProfile(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    },

    async updateProfile(userId, updates) {
        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ========================================
    // Team Management
    // ========================================
    async getTeamMembers(managerId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('manager_id', managerId)
            .order('full_name');
        if (error) throw error;
        return data || [];
    },

    async setManager(userId, managerId) {
        const { data, error } = await supabase
            .from('profiles')
            .update({ manager_id: managerId })
            .eq('id', userId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ========================================
    // Work Logs
    // ========================================
    async getWorkLogs(userId, daysBack = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        const { data, error } = await supabase
            .from('work_logs')
            .select('*')
            .eq('user_id', userId)
            .gte('log_date', startDate.toISOString().split('T')[0])
            .order('log_date', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getTeamWorkLogs(managerId, daysBack = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        // Get team members first
        const teamMembers = await this.getTeamMembers(managerId);
        if (teamMembers.length === 0) return [];

        const teamIds = teamMembers.map(m => m.id);

        const { data, error } = await supabase
            .from('work_logs')
            .select('*, profiles(full_name)')
            .in('user_id', teamIds)
            .gte('log_date', startDate.toISOString().split('T')[0])
            .order('log_date', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getTodayWorkLog(userId) {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('work_logs')
            .select('*')
            .eq('user_id', userId)
            .eq('log_date', today)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async upsertWorkLog(log) {
        const { data, error } = await supabase
            .from('work_logs')
            .upsert(log, { onConflict: 'user_id,log_date' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getTeamActionsProgress(managerId) {
        // Get team members
        const teamMembers = await this.getTeamMembers(managerId);
        if (teamMembers.length === 0) return [];

        const teamIds = teamMembers.map(m => m.id);

        // Get actions assigned to team members
        const { data, error } = await supabase
            .from('actions')
            .select('*, profiles(full_name)')
            .in('assignee_id', teamIds)
            .order('action_id');
        if (error) throw error;
        return data || [];
    },

    // ========================================
    // Interns
    // ========================================
    async getInterns(activeOnly = false) {
        let q = supabase.from('interns').select('*').order('created_at');
        if (activeOnly) q = q.in('status', ['onboarding', 'active']);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    },

    async createIntern(intern) {
        const { data, error } = await supabase
            .from('interns')
            .insert(intern)
            .select()
            .single();
        if (error) throw error;

        // Clone the active onboarding template into onboarding_items for this intern
        const { data: tmpls } = await supabase
            .from('onboarding_templates')
            .select('*')
            .eq('is_active', true)
            .order('sort_order');
        if (tmpls && tmpls.length) {
            const items = tmpls.map(t => ({
                intern_id: data.id,
                template_id: t.id,
                title: t.title,
                description: t.description,
                category: t.category,
                sort_order: t.sort_order
            }));
            await supabase.from('onboarding_items').insert(items);
        }
        return data;
    },

    async updateIntern(id, updates) {
        const { data, error } = await supabase
            .from('interns')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getOnboardingItems(internId) {
        const { data, error } = await supabase
            .from('onboarding_items')
            .select('*')
            .eq('intern_id', internId)
            .order('sort_order');
        if (error) throw error;
        return data || [];
    },

    async updateOnboardingItem(id, updates) {
        const { data, error } = await supabase
            .from('onboarding_items')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // ========================================
    // Notifications
    // ========================================
    async getNotifications(limit = 50) {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    },

    async getUnreadNotificationCount() {
        const { count, error } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('is_read', false);
        if (error) return 0;
        return count || 0;
    },

    async markNotificationRead(id) {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);
        if (error) throw error;
    },

    async markAllNotificationsRead() {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('is_read', false);
        if (error) throw error;
    },

    /**
     * Write notification rows for Kavya + Riya (both supervise interns by default).
     * Fields: event_type, entity_type, entity_id, entity_title, intern_id, message, link
     */
    async notifySupervisors(fields) {
        // Get Kavya + Riya profile IDs
        const { data: supervisors } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('member_key', ['kavya', 'riya']);
        if (!supervisors || supervisors.length === 0) return;

        // Get intern name if intern_id provided
        let internName = null;
        if (fields.intern_id) {
            const { data: i } = await supabase
                .from('interns')
                .select('name')
                .eq('id', fields.intern_id)
                .single();
            internName = i?.name;
        }

        const actorName = (typeof auth !== 'undefined' && auth.currentProfile?.full_name) || 'Unknown';
        const rows = supervisors.map(s => ({
            recipient_id: s.id,
            actor_id: (typeof auth !== 'undefined' && auth.currentUser?.id) || null,
            actor_name: actorName,
            intern_id: fields.intern_id || null,
            intern_name: internName,
            event_type: fields.event_type,
            entity_type: fields.entity_type || null,
            entity_id: fields.entity_id || null,
            entity_title: fields.entity_title || null,
            message: fields.message || null,
            link: fields.link || null
        }));
        const { error } = await supabase.from('notifications').insert(rows);
        if (error) console.error('notifySupervisors failed:', error);
    },

    // ========================================
    // Master Sheets (leadership hub)
    // ========================================
    async getMasterSheets() {
        const { data, error } = await supabase
            .from('master_sheets')
            .select('*')
            .order('vertical')
            .order('sort_order')
            .order('name');
        if (error) throw error;
        return data || [];
    },

    async createMasterSheet(sheet) {
        const { data, error } = await supabase
            .from('master_sheets')
            .insert({
                ...sheet,
                created_by: auth.currentUser?.id || null
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async updateMasterSheet(id, updates) {
        const { data, error } = await supabase
            .from('master_sheets')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteMasterSheet(id) {
        const { error } = await supabase
            .from('master_sheets')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }
};

// Real-time subscriptions
const realtime = {
    subscriptions: [],

    /**
     * Subscribe to a Supabase Realtime channel idempotently.
     * If a channel with the same name already exists, it's removed first.
     * Fixes 'cannot add postgres_changes callbacks after subscribe()' error
     * when init() runs more than once (e.g. SPA navigation).
     */
    _subscribe(channelName, filter, callback) {
        // Remove any existing channel with the same name
        const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
        if (existing) {
            supabase.removeChannel(existing);
        }
        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', filter, callback)
            .subscribe();
        this.subscriptions.push(channel);
        return channel;
    },

    subscribeToActions(callback) {
        return this._subscribe('actions-changes',
            { event: '*', schema: 'public', table: 'actions' }, callback);
    },

    subscribeToGoals(callback) {
        return this._subscribe('goals-changes',
            { event: '*', schema: 'public', table: 'goals' }, callback);
    },

    subscribeToIdeas(callback) {
        return this._subscribe('ideas-changes',
            { event: '*', schema: 'public', table: 'ideas' }, callback);
    },

    subscribeToActivity(callback) {
        return this._subscribe('activity-changes',
            { event: 'INSERT', schema: 'public', table: 'activity_log' }, callback);
    },

    unsubscribeAll() {
        this.subscriptions.forEach(channel => {
            supabase.removeChannel(channel);
        });
        this.subscriptions = [];
    }
};
