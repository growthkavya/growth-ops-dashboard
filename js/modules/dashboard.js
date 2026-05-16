/**
 * Dashboard Module — Year 2 KRA framework
 *
 * Overview page: Today's Focus, Quick Stats, KRA Progress (5 rows),
 * Team Snapshot (Kavya / Riya weighted scores), Recent Activity.
 */

const dashboardModule = {
    actions: [],
    kpis: [],
    kpiScores: [],
    kras: [],
    goals: [],
    recentActivity: [],

    async init() {
        await this.loadData();
        this.render();
        this.setupRealtimeUpdates();
    },

    async loadData() {
        try {
            const [actions, kpis, kpiScores, kras, goals, activity] = await Promise.all([
                db.getActions(),
                db.getKPIs(),
                db.getKPIScores(),
                db.getKRAs(),
                db.getGoals(),
                db.getActivityLog(10)
            ]);

            this.actions = actions || [];
            this.kpis = kpis || [];
            this.kpiScores = kpiScores || [];
            this.kras = (kras || []).slice().sort((a, b) => a.sort_order - b.sort_order);
            this.goals = goals || [];
            this.recentActivity = activity || [];
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            toast.error('Failed to load dashboard data');
        }
    },

    render() {
        this.renderTodaysFocus();
        this.renderStats();
        this.renderKRAProgress();
        this.renderTeamSnapshot();
        this.renderKPIGauges();
        this.renderRecentActivity();
        this.renderLastUpdated();
    },

    renderTodaysFocus() {
        const dateEl = document.getElementById('focus-date');
        if (dateEl) {
            dateEl.textContent = new Date().toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });
        }

        // Priority: first in_progress, else first not_started ordered by KRA sort_order.
        let focusAction = this.actions.find(a => a.status === 'in_progress');
        if (!focusAction) {
            for (const kra of this.kras) {
                focusAction = this.actions.find(a =>
                    a.status === 'not_started' && a.kras?.kra_code === kra.kra_code
                );
                if (focusAction) break;
            }
        }

        const titleEl = document.getElementById('focus-title');
        const layerEl = document.getElementById('focus-layer');
        const kpiEl = document.getElementById('focus-kpi');
        const btnEl = document.getElementById('mark-focus-done');
        const cardEl = document.getElementById('focus-card');

        if (focusAction) {
            const kraCode = focusAction.kras?.kra_code || '';
            if (titleEl) titleEl.textContent = focusAction.title;
            if (layerEl) {
                layerEl.textContent = kraCode.toUpperCase();
                layerEl.className = `focus-layer kra-tag kra-${kraCode}`;
            }
            const kpi = this.kpis.find(k => k.id === focusAction.kpi_id);
            const owner = focusAction.owner_name ? memberName(focusAction.owner_name) : 'Unassigned';
            if (kpiEl) {
                kpiEl.innerHTML = `
                    <span class="owner-badge badge-${focusAction.owner_name || 'unassigned'}">${owner}</span>
                    ${kpi ? ` • KPI: ${kpi.name}` : ''}
                `;
            }
            if (btnEl) {
                btnEl.style.display = 'inline-block';
                btnEl.onclick = () => this.markFocusDone(focusAction);
            }
            if (cardEl) cardEl.classList.add('has-focus');
        } else {
            if (titleEl) titleEl.textContent = 'All caught up!';
            if (layerEl) { layerEl.textContent = ''; layerEl.className = 'focus-layer'; }
            if (kpiEl) kpiEl.textContent = '';
            if (btnEl) btnEl.style.display = 'none';
            if (cardEl) cardEl.classList.remove('has-focus');
        }
    },

    async markFocusDone(action) {
        try {
            await db.updateAction(action.id, { status: 'done' });
            toast.success(`Completed: ${action.title}`);
            this.refresh();
        } catch (error) {
            toast.error('Failed to update action');
        }
    },

    renderStats() {
        const stats = {
            done: this.actions.filter(a => a.status === 'done').length,
            progress: this.actions.filter(a => a.status === 'in_progress').length,
            pending: this.actions.filter(a => a.status === 'not_started').length,
            goals: this.goals.length
        };

        const ids = { done: 'stat-done', progress: 'stat-progress', pending: 'stat-pending', goals: 'stat-goals' };
        for (const k in ids) {
            const el = document.getElementById(ids[k]);
            if (el) el.textContent = stats[k];
        }
    },

    renderKRAProgress() {
        const container = document.getElementById('kra-progress');
        if (!container) return;

        container.innerHTML = this.kras.map(kra => {
            const kraActions = this.actions.filter(a => a.kras?.kra_code === kra.kra_code);
            const done = kraActions.filter(a => a.status === 'done').length;
            const total = kraActions.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            return `
                <div class="progress-item">
                    <span class="progress-label">
                        <strong>KRA ${kra.kra_code.replace('kra','')}:</strong> ${kra.short_name}
                    </span>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${pct}%"></div>
                    </div>
                    <span class="progress-percent">${done}/${total} · ${pct}%</span>
                </div>
            `;
        }).join('');
    },

    renderTeamSnapshot() {
        const container = document.getElementById('team-snapshot');
        if (!container) return;

        container.innerHTML = APP_CONFIG.team.map(m => {
            const score = this.calculateMemberWeightedScore(m.id);
            const inProg = this.actions.filter(a => a.owner_name === m.id && a.status === 'in_progress').length;
            const pending = this.actions.filter(a => a.owner_name === m.id && a.status === 'not_started').length;
            const done = this.actions.filter(a => a.owner_name === m.id && a.status === 'done').length;

            return `
                <div class="team-sum-card card-${m.id}">
                    <div class="team-sum-name">${m.name}</div>
                    <div class="team-sum-role">${m.role}</div>
                    <div class="team-sum-score">${score !== null ? score.toFixed(2) : '-'}</div>
                    <div class="team-sum-score-label">Weighted / 5.0</div>
                    <div class="team-sum-tasks">
                        <span>Active <strong>${inProg}</strong></span>
                        <span>Pending <strong>${pending}</strong></span>
                        <span>Done <strong>${done}</strong></span>
                    </div>
                </div>
            `;
        }).join('');
    },

    calculateMemberWeightedScore(memberId) {
        const scores = this.getLatestScores();
        const memberKpis = this.kpis.filter(k => k.member === memberId);
        let totalWeight = 0, weightedSum = 0;
        memberKpis.forEach(kpi => {
            const score = scores[kpi.id];
            if (score !== null && score !== undefined) {
                weightedSum += score * kpi.weight;
                totalWeight += kpi.weight;
            }
        });
        return totalWeight === 0 ? null : weightedSum / totalWeight;
    },

    renderKPIGauges() {
        // Kept for backwards compat if the card exists in HTML, but the new
        // Team Snapshot replaces the previous KPI summary card. If the
        // container is not present, skip.
        const container = document.getElementById('kpi-gauges');
        if (!container) return;
        container.innerHTML = '';
        const weightedScoreEl = document.getElementById('weighted-score');
        if (weightedScoreEl) {
            // Team-wide = simple average of the 3 member weighted scores
            const memberScores = APP_CONFIG.team
                .map(m => this.calculateMemberWeightedScore(m.id))
                .filter(s => s !== null);
            if (memberScores.length === 0) {
                weightedScoreEl.textContent = '-';
            } else {
                const avg = memberScores.reduce((a, b) => a + b, 0) / memberScores.length;
                weightedScoreEl.textContent = avg.toFixed(2);
            }
        }
    },

    getLatestScores() {
        const scores = {};
        const currentYear = 2026;
        this.kpis.forEach(kpi => { scores[kpi.id] = null; });

        this.kpiScores
            .filter(s => s.year === currentYear)
            .sort((a, b) => b.month - a.month)
            .forEach(s => {
                if (scores[s.kpi_id] === null) scores[s.kpi_id] = s.score;
            });

        return scores;
    },

    renderRecentActivity() {
        const container = document.getElementById('recent-activity');
        if (!container) return;

        if (this.recentActivity.length === 0) {
            container.innerHTML = '<li class="empty">No recent activity</li>';
            return;
        }

        container.innerHTML = this.recentActivity.map(activity => {
            const time = this.formatTimeAgo(new Date(activity.timestamp));
            const initials = this.getInitials(activity.user_name);
            const actionText = this.formatActivityText(activity);

            return `
                <li>
                    <span class="activity-avatar">${initials}</span>
                    <div class="activity-content">
                        ${actionText}
                        <span class="activity-time">${time}</span>
                    </div>
                </li>
            `;
        }).join('');
    },

    getInitials(name) {
        if (!name || name === 'Unknown') return '?';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    },

    formatTimeAgo(date) {
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    },

    formatActivityText(activity) {
        const actionMap = { created: 'created', updated: 'updated', deleted: 'deleted' };
        return `<strong>${activity.user_name || 'Someone'}</strong> ${actionMap[activity.action]} ${activity.entity_type} "${activity.entity_title || ''}"`;
    },

    renderLastUpdated() {
        const el = document.getElementById('last-updated');
        if (el) el.textContent = new Date().toLocaleDateString();
    },

    setupRealtimeUpdates() {
        realtime.subscribeToActions(() => {
            this.loadData().then(() => this.render());
        });

        realtime.subscribeToActivity((payload) => {
            if (payload.new) {
                this.recentActivity.unshift(payload.new);
                this.recentActivity = this.recentActivity.slice(0, 10);
                this.renderRecentActivity();
            }
        });
    },

    refresh() {
        this.loadData().then(() => this.render());
    }
};
