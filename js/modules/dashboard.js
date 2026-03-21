/**
 * Dashboard Module
 */

const dashboardModule = {
    actions: [],
    kpis: [],
    kpiScores: [],
    goals: [],
    recentActivity: [],

    async init() {
        await this.loadData();
        this.render();
        this.setupRealtimeUpdates();
    },

    async loadData() {
        try {
            const [actions, kpis, kpiScores, goals, activity] = await Promise.all([
                db.getActions(),
                db.getKPIs(),
                db.getKPIScores(),
                db.getGoals(),
                db.getActivityLog(10)
            ]);

            this.actions = actions || [];
            this.kpis = kpis || [];
            this.kpiScores = kpiScores || [];
            this.goals = goals || [];
            this.recentActivity = activity || [];
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            toast.error('Failed to load dashboard data');
        }
    },

    render() {
        this.renderStats();
        this.renderLayerProgress();
        this.renderKPIGauges();
        this.renderRecentActivity();
        this.renderLastUpdated();
    },

    renderStats() {
        const stats = {
            done: this.actions.filter(a => a.status === 'done').length,
            progress: this.actions.filter(a => a.status === 'in_progress').length,
            pending: this.actions.filter(a => a.status === 'not_started').length,
            goals: this.goals.length
        };

        document.getElementById('stat-done').textContent = stats.done;
        document.getElementById('stat-progress').textContent = stats.progress;
        document.getElementById('stat-pending').textContent = stats.pending;
        document.getElementById('stat-goals').textContent = stats.goals;
    },

    renderLayerProgress() {
        for (let layer = 1; layer <= 3; layer++) {
            const layerActions = this.actions.filter(a => a.layer === layer);
            const done = layerActions.filter(a => a.status === 'done').length;
            const total = layerActions.length;
            const percent = total > 0 ? Math.round((done / total) * 100) : 0;

            const progressBar = document.getElementById(`layer${layer}-progress`);
            const percentText = document.getElementById(`layer${layer}-percent`);

            if (progressBar) progressBar.style.width = `${percent}%`;
            if (percentText) percentText.textContent = `${percent}%`;
        }
    },

    renderKPIGauges() {
        const container = document.getElementById('kpi-gauges');
        if (!container) return;

        const latestScores = this.getLatestScores();

        container.innerHTML = this.kpis.map(kpi => {
            const score = latestScores[kpi.id];
            return `
                <div class="kpi-gauge">
                    <div class="kpi-gauge-value">${score !== null ? score : '-'}</div>
                    <div class="kpi-gauge-label">${kpi.name.split(' ')[0]}</div>
                </div>
            `;
        }).join('');

        // Calculate weighted score
        const weightedScore = this.calculateWeightedScore(latestScores);
        const weightedScoreEl = document.getElementById('weighted-score');
        if (weightedScoreEl) {
            weightedScoreEl.textContent = weightedScore !== null ? weightedScore.toFixed(2) : '-';
        }
    },

    getLatestScores() {
        const scores = {};
        const currentYear = new Date().getFullYear();

        this.kpis.forEach(kpi => {
            scores[kpi.id] = null;
        });

        // Get most recent score for each KPI
        this.kpiScores
            .filter(s => s.year === currentYear)
            .sort((a, b) => b.month - a.month)
            .forEach(score => {
                if (scores[score.kpi_id] === null) {
                    scores[score.kpi_id] = score.score;
                }
            });

        return scores;
    },

    calculateWeightedScore(scores) {
        let totalWeight = 0;
        let weightedSum = 0;

        this.kpis.forEach(kpi => {
            const score = scores[kpi.id];
            if (score !== null) {
                weightedSum += score * (kpi.weight / 100);
                totalWeight += kpi.weight;
            }
        });

        if (totalWeight === 0) return null;
        return (weightedSum / totalWeight) * 100;
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
            const actionText = this.formatActivityText(activity);

            return `
                <li>
                    ${actionText}
                    <span class="activity-time">${time}</span>
                </li>
            `;
        }).join('');
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
        const actionMap = {
            created: 'created',
            updated: 'updated',
            deleted: 'deleted'
        };

        return `<strong>${activity.user_name || 'Someone'}</strong> ${actionMap[activity.action]} ${activity.entity_type} "${activity.entity_title || ''}"`;
    },

    renderLastUpdated() {
        const el = document.getElementById('last-updated');
        if (el) {
            el.textContent = new Date().toLocaleDateString();
        }
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
