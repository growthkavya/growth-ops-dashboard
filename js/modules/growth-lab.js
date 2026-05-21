/**
 * Growth Lab Module — embedded in Kavya's main dashboard.
 *
 * Reflects activity of Growth Ops interns (Akash + Palak) from the Growth Lab
 * cohort. Read-only — to take action, open the full Growth Lab dashboard at /lab/.
 *
 * Pulls from gl_* tables filtered to interns where tags @> [growth_lab, growth_ops].
 */

const growthLabModule = {
    interns: [],
    initialized: false,

    async init() {
        if (this.initialized) return;
        if (auth.currentProfile?.role === 'intern') return;
        this.initialized = true;
        await this.refresh();
    },

    async refresh() {
        const container = document.getElementById('growth-lab-container');
        if (!container) return;
        container.innerHTML = '<p style="color:#64748b;">Loading…</p>';
        try {
            // Get Growth Ops interns from the growth_lab cohort
            const { data: interns, error } = await window.sb
                .from('interns')
                .select('id, name, intern_code, start_date, tags, auth_user_id')
                .contains('tags', ['growth_lab', 'growth_ops'])
                .eq('status', 'active')
                .order('name');
            if (error) throw error;
            this.interns = interns || [];
            if (!this.interns.length) {
                container.innerHTML = '<p style="color:#64748b;">No Growth Lab interns in Growth Ops yet.</p>';
                return;
            }
            await this.render(container);
        } catch (e) {
            if (e.message?.includes('schema cache') || e.message?.includes('does not exist')) {
                container.innerHTML = '<p style="color:#dc2626;">Growth Lab database not initialized. Run lab/supabase/migration_growth_lab_v2.sql in Supabase SQL Editor.</p>';
                return;
            }
            console.error(e);
            container.innerHTML = `<p style="color:#dc2626;">Failed: ${e.message}</p>`;
        }
    },

    async render(container) {
        container.innerHTML = '';
        const today = new Date().toISOString().slice(0, 10);
        const monthStart = today.slice(0, 7) + '-01';
        const internIds = this.interns.map((i) => i.id);

        // Parallel fetch
        const [attnToday, attnMonth, tasks, ideas, learnings, checkins, kras, kpis] = await Promise.all([
            window.sb.from('gl_attendance').select('*').in('intern_id', internIds).eq('attendance_date', today),
            window.sb.from('gl_attendance').select('*').in('intern_id', internIds).gte('attendance_date', monthStart),
            window.sb.from('gl_task').select('*').in('intern_id', internIds).not('status', 'in', '("done","cancelled")'),
            window.sb.from('gl_idea').select('*').in('intern_id', internIds).order('created_at', { ascending: false }).limit(10),
            window.sb.from('gl_learning').select('*').in('intern_id', internIds).order('learning_date', { ascending: false }).limit(10),
            window.sb.from('gl_daily_checkin').select('*').in('intern_id', internIds).order('checkin_date', { ascending: false }).limit(10),
            window.sb.from('gl_kra').select('*').in('intern_id', internIds).eq('period_month', monthStart),
            window.sb.from('gl_kpi').select('*').in('intern_id', internIds).eq('period_month', monthStart),
        ]);

        const todayMap = {}; (attnToday.data || []).forEach((e) => { todayMap[e.intern_id] = e; });

        // Build the grid
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; gap:20px; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));';

        this.interns.forEach((intern) => {
            const monthEntries = (attnMonth.data || []).filter((e) => e.intern_id === intern.id);
            const internTasks = (tasks.data || []).filter((t) => t.intern_id === intern.id);
            const internIdeas = (ideas.data || []).filter((i) => i.intern_id === intern.id);
            const internLearns = (learnings.data || []).filter((l) => l.intern_id === intern.id);
            const internCheckins = (checkins.data || []).filter((c) => c.intern_id === intern.id);
            const internKRAs = (kras.data || []).filter((k) => k.intern_id === intern.id).sort((a, b) => a.kra_index - b.kra_index);
            const internKPIs = (kpis.data || []).filter((k) => k.intern_id === intern.id).sort((a, b) => a.kpi_index - b.kpi_index);

            const present = monthEntries.filter((e) => e.status === 'present').length;
            const half = monthEntries.filter((e) => e.status === 'half-day').length;
            const absent = monthEntries.filter((e) => e.status === 'absent').length;
            const totalCounted = present + half + absent;
            const pct = totalCounted ? Math.round(((present + half * 0.5) / totalCounted) * 100) : null;
            const todayE = todayMap[intern.id];
            const today_status = todayE ? `<span style="background:${todayE.approval_status === 'approved' ? '#dcfce7' : todayE.approval_status === 'rejected' ? '#fee2e2' : '#fef9c3'}; color:${todayE.approval_status === 'approved' ? '#14532d' : todayE.approval_status === 'rejected' ? '#7f1d1d' : '#854d0e'}; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600;">${todayE.approval_status}</span>`
                : '<span style="background:#fef9c3; color:#854d0e; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600;">Not in yet</span>';
            const pctColor = pct == null ? '#64748b' : pct < 80 ? '#dc2626' : pct < 95 ? '#d97706' : '#16a34a';

            const card = document.createElement('div');
            card.style.cssText = 'background:white; border-radius:12px; padding:18px; box-shadow:0 1px 3px rgba(0,0,0,0.06); border:1px solid #e4e7ee;';
            card.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                    <strong style="font-size:15px;">${escapeHtml(intern.name)}</strong>
                    ${today_status}
                </div>
                <div style="color:#64748b; font-size:12px; margin-bottom:14px;">${intern.intern_code} · Growth Ops</div>

                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid #e4e7ee;">
                    <div><div style="font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.4px;">Attendance</div><div style="font-size:18px; font-weight:700; color:${pctColor};">${pct == null ? '—' : pct + '%'}</div></div>
                    <div><div style="font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.4px;">Tasks</div><div style="font-size:18px; font-weight:700;">${internTasks.length}</div></div>
                    <div><div style="font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.4px;">Ideas</div><div style="font-size:18px; font-weight:700;">${internIdeas.length}</div></div>
                    <div><div style="font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.4px;">Learnings</div><div style="font-size:18px; font-weight:700;">${internLearns.length}</div></div>
                </div>

                ${internKRAs.length ? `
                    <div style="font-weight:600; font-size:12px; margin-bottom:6px; color:#0e1729;">KRAs progress</div>
                    ${internKRAs.map((k) => `
                        <div style="margin:4px 0;">
                            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                                <span>${k.kra_index}. ${escapeHtml(k.title)}</span>
                                <span style="color:#64748b;">${k.percent_done || 0}%</span>
                            </div>
                            <div style="background:#e8ecf3; height:5px; border-radius:3px; overflow:hidden;">
                                <div style="width:${k.percent_done || 0}%; height:100%; background:${(k.percent_done || 0) >= 80 ? '#16a34a' : (k.percent_done || 0) >= 50 ? '#2563eb' : '#d97706'};"></div>
                            </div>
                        </div>
                    `).join('')}
                ` : '<div style="font-size:12px; color:#64748b; font-style:italic;">No KRAs set for this month yet.</div>'}

                ${internCheckins[0] ? `
                    <div style="margin-top:14px; padding-top:14px; border-top:1px solid #e4e7ee;">
                        <div style="font-weight:600; font-size:12px; margin-bottom:4px;">Latest check-in (${formatLabDate(internCheckins[0].checkin_date)})</div>
                        <div style="font-size:12px; color:#0e1729;">${escapeHtml((internCheckins[0].what_done || '').slice(0, 160))}${(internCheckins[0].what_done || '').length > 160 ? '…' : ''}</div>
                    </div>
                ` : ''}

                ${internTasks[0] ? `
                    <div style="margin-top:10px; font-size:12px; color:#64748b;">
                        <strong style="color:#0e1729;">Active task:</strong> ${escapeHtml(internTasks[0].title)}
                        <span style="margin-left:4px;">(${internTasks[0].percent_done || 0}%)</span>
                    </div>
                ` : ''}

                <div style="margin-top:14px; text-align:right;">
                    <a href="lab/" target="_blank" style="color:#2563eb; font-size:12px; text-decoration:none;">Open in Growth Lab →</a>
                </div>
            `;
            grid.appendChild(card);
        });
        container.appendChild(grid);
    },
};

function formatLabDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Hook into existing navigation: render when growth-lab section becomes visible
document.addEventListener('DOMContentLoaded', () => {
    // Initial render on hash change
    function maybeRefresh() {
        if (location.hash === '#growth-lab') growthLabModule.refresh();
    }
    window.addEventListener('hashchange', maybeRefresh);
    // Also tap into nav clicks
    document.querySelectorAll('.nav-link[data-section="growth-lab"]').forEach((a) => {
        a.addEventListener('click', () => setTimeout(() => growthLabModule.refresh(), 80));
    });
    // First load if hash already set
    setTimeout(maybeRefresh, 500);
});
