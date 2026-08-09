/**
 * Data layer. Every Supabase query in the app lives here.
 *
 * Modules never call `supabase` directly — they call `data.*` and get
 * back plain objects. That keeps query shapes (and the FK-disambiguation
 * needed on `actions`) in one place instead of scattered across views.
 */

(function () {
    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();

const sb = window.sb;

const data = {

    /* ---------- Reference ---------------------------------- */

    async kras() {
        const { data: rows, error } = await sb
            .from('kras').select('*').order('sort_order');
        if (error) throw error;
        return rows || [];
    },

    async profiles() {
        const { data: rows, error } = await sb
            .from('profiles').select('*').order('full_name');
        if (error) throw error;
        return rows || [];
    },

    /* ---------- Work items --------------------------------- */

    /**
     * The single work tracker. `actions` has two FKs to profiles
     * (assignee_id and assigned_by), so both must be aliased or
     * PostgREST returns "ambiguous relationship".
     */
    async workItems() {
        const { data: rows, error } = await sb
            .from('actions')
            .select(`
                *,
                kpis(name, member, kpi_code),
                kras(kra_code, name, short_name, sort_order),
                goals(id, title, scope),
                assignee:assignee_id(full_name),
                assigner:assigned_by(full_name)
            `)
            .order('due_date', { nullsFirst: false });
        if (error) throw error;
        return rows || [];
    },

    async createWorkItem(fields) {
        const { data: row, error } = await sb
            .from('actions').insert(fields).select().single();
        if (error) throw error;
        return row;
    },

    async updateWorkItem(id, fields) {
        const { data: row, error } = await sb
            .from('actions')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', id).select().single();
        if (error) throw error;
        return row;
    },

    async deleteWorkItem(id) {
        const { error } = await sb.from('actions').delete().eq('id', id);
        if (error) throw error;
    },

    /* ---------- Goals -------------------------------------- */

    async goals() {
        const { data: rows, error } = await sb
            .from('goals')
            .select('*, owner:owner_id(full_name), kras(kra_code, short_name)')
            .is('archived_at', null)
            .order('sort_order');
        if (error) throw error;
        return rows || [];
    },

    async createGoal(fields) {
        const { data: row, error } = await sb
            .from('goals').insert(fields).select().single();
        if (error) throw error;
        return row;
    },

    async updateGoal(id, fields) {
        const { data: row, error } = await sb
            .from('goals')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', id).select().single();
        if (error) throw error;
        return row;
    },

    /** Goals are archived, never deleted — last quarter's targets are the record. */
    async archiveGoal(id) {
        return this.updateGoal(id, { archived_at: new Date().toISOString() });
    },

    /* ---------- Scorecard ---------------------------------- */

    async kpis() {
        const { data: rows, error } = await sb
            .from('kpis')
            .select('*, kras(kra_code, name, short_name, sort_order)')
            .order('sort_order');
        if (error) throw error;

        // Sort by KRA order, then by the team order in CONFIG, then by
        // the KPI's own order. Done here rather than in SQL because the
        // member sequence is a display choice, not a data property.
        const seat = {};
        CONFIG.team.forEach((m, i) => { seat[m.key] = i; });

        return (rows || []).sort((a, b) =>
            (a.kras?.sort_order ?? 99) - (b.kras?.sort_order ?? 99)
            || (seat[a.member] ?? 99) - (seat[b.member] ?? 99)
            || (a.sort_order || 0) - (b.sort_order || 0)
        );
    },

    async scores() {
        const { data: rows, error } = await sb
            .from('kpi_scores').select('*')
            .order('year', { ascending: false })
            .order('month', { ascending: false });
        if (error) throw error;
        return rows || [];
    },

    async saveScore(score) {
        const { data: row, error } = await sb
            .from('kpi_scores')
            .upsert(score, { onConflict: 'kpi_id,month,year' })
            .select().single();
        if (error) throw error;
        return row;
    },

    /* ---------- Documents ---------------------------------- */

    async documents() {
        const { data: rows, error } = await sb
            .from('documents')
            .select('*, owner:owner_id(full_name)')
            .order('type').order('name');
        if (error) throw error;
        return rows || [];
    },

    async createDocument(fields) {
        const { data: row, error } = await sb
            .from('documents').insert(fields).select().single();
        if (error) throw error;
        return row;
    },

    async updateDocument(id, fields) {
        const { data: row, error } = await sb
            .from('documents').update(fields).eq('id', id).select().single();
        if (error) throw error;
        return row;
    },

    async deleteDocument(id) {
        const { error } = await sb.from('documents').delete().eq('id', id);
        if (error) throw error;
    },

    async sheets() {
        const { data: rows, error } = await sb
            .from('master_sheets')
            .select('*, owner:owner_id(full_name)')
            .order('vertical').order('sort_order').order('name');
        if (error) throw error;
        return rows || [];
    },

    async createSheet(fields) {
        const { data: row, error } = await sb
            .from('master_sheets')
            .insert({ ...fields, created_by: auth.userId })
            .select().single();
        if (error) throw error;
        return row;
    },

    async updateSheet(id, fields) {
        const { data: row, error } = await sb
            .from('master_sheets').update(fields).eq('id', id).select().single();
        if (error) throw error;
        return row;
    },

    async deleteSheet(id) {
        const { error } = await sb.from('master_sheets').delete().eq('id', id);
        if (error) throw error;
    },

    /* ---------- People ------------------------------------- */

    async interns(activeOnly = false) {
        let q = sb.from('interns').select('*').order('created_at');
        if (activeOnly) q = q.in('status', ['onboarding', 'active']);
        const { data: rows, error } = await q;
        if (error) throw error;
        return rows || [];
    },

    async createIntern(fields) {
        const { data: row, error } = await sb
            .from('interns').insert(fields).select().single();
        if (error) throw error;

        // Clone the active onboarding checklist for the new joiner.
        const { data: templates } = await sb
            .from('onboarding_templates').select('*')
            .eq('is_active', true).order('sort_order');

        if (templates?.length) {
            await sb.from('onboarding_items').insert(templates.map(t => ({
                intern_id: row.id,
                template_id: t.id,
                title: t.title,
                description: t.description,
                category: t.category,
                sort_order: t.sort_order
            })));
        }
        return row;
    },

    async updateIntern(id, fields) {
        const { data: row, error } = await sb
            .from('interns').update(fields).eq('id', id).select().single();
        if (error) throw error;
        return row;
    },

    async onboardingItems(internId) {
        const { data: rows, error } = await sb
            .from('onboarding_items').select('*')
            .eq('intern_id', internId).order('sort_order');
        if (error) throw error;
        return rows || [];
    },

    async updateOnboardingItem(id, fields) {
        const { data: row, error } = await sb
            .from('onboarding_items').update(fields).eq('id', id).select().single();
        if (error) throw error;
        return row;
    },

    /* ---------- Activity ----------------------------------- */

    async activity(limit = 40) {
        const { data: rows, error } = await sb
            .from('activity_log').select('*')
            .order('timestamp', { ascending: false }).limit(limit);
        if (error) throw error;
        return rows || [];
    },

    /**
     * Record what someone did. Fire-and-forget: a failed audit write
     * must never block the action the person actually took, but it is
     * surfaced in the console so it can't fail silently forever.
     */
    async log(verb, entityType, entityId, title) {
        const { error } = await sb.from('activity_log').insert({
            user_id: auth.userId,
            user_name: auth.name,
            action: verb,
            entity_type: entityType,
            entity_id: entityId,
            entity_title: title
        });
        if (error) console.warn('Activity not recorded:', error.message);
    },

    /* ---------- Notifications ------------------------------ */

    async notifications(limit = 20) {
        const { data: rows, error } = await sb
            .from('notifications').select('*')
            .order('created_at', { ascending: false }).limit(limit);
        if (error) throw error;
        return rows || [];
    },

    async unreadCount() {
        const { count, error } = await sb
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('is_read', false);
        return error ? 0 : (count || 0);
    },

    async markRead(id) {
        await sb.from('notifications').update({ is_read: true }).eq('id', id);
    },

    async markAllRead() {
        await sb.from('notifications').update({ is_read: true }).eq('is_read', false);
    },

    /* ---------- Legacy ------------------------------------- */

    /**
     * Daily work logs from before the single tracker existed. Read-only:
     * nothing writes here any more, but the history stays reachable from
     * a person's page so no record is lost.
     */
    async legacyWorkLogs(userId, daysBack = 90) {
        const from = new Date();
        from.setDate(from.getDate() - daysBack);
        const { data: rows, error } = await sb
            .from('work_logs').select('*')
            .eq('user_id', userId)
            .gte('log_date', from.toISOString().slice(0, 10))
            .order('log_date', { ascending: false });
        if (error) return [];
        return rows || [];
    }
};
