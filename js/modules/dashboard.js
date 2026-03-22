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
        this.renderTodaysFocus();
        this.renderStats();
        this.renderLayerProgress();
        this.renderKPIGauges();
        this.renderRecentActivity();
        this.renderLastUpdated();
    },

    renderTodaysFocus() {
        // Set today's date
        const dateEl = document.getElementById('focus-date');
        if (dateEl) {
            dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }

        // Find priority action: first in_progress, or first not_started from lowest layer
        let focusAction = this.actions.find(a => a.status === 'in_progress');
        if (!focusAction) {
            // Get first not_started from Layer 1, then 2, then 3
            for (let layer = 1; layer <= 3; layer++) {
                focusAction = this.actions.find(a => a.status === 'not_started' && a.layer === layer);
                if (focusAction) break;
            }
        }

        const titleEl = document.getElementById('focus-title');
        const layerEl = document.getElementById('focus-layer');
        const kpiEl = document.getElementById('focus-kpi');
        const btnEl = document.getElementById('mark-focus-done');
        const cardEl = document.getElementById('focus-card');

        if (focusAction) {
            if (titleEl) titleEl.textContent = focusAction.title;
            if (layerEl) {
                layerEl.textContent = `L${focusAction.layer}`;
                layerEl.className = `focus-layer layer-${focusAction.layer}`;
            }
            // Find KPI name
            const kpi = this.kpis.find(k => k.id === focusAction.kpi_id);
            if (kpiEl && kpi) kpiEl.textContent = `KPI: ${kpi.name}`;
            if (btnEl) {
                btnEl.style.display = 'inline-block';
                btnEl.onclick = () => this.markFocusDone(focusAction);
            }
            if (cardEl) cardEl.classList.add('has-focus');
        } else {
            if (titleEl) titleEl.textContent = 'All caught up!';
            if (layerEl) layerEl.textContent = '';
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

        document.getElementById('stat-done').textContent = stats.done;
        document.getElementById('stat-progress').textContent = stats.progress;
        document.getElementById('stat-pending').textContent = stats.pending;
        document.getElementById('stat-goals').textContent = stats.goals;
    },

    renderLayerProgress() {
        const layerPercents = [];

        for (let layer = 1; layer <= 3; layer++) {
            const layerActions = this.actions.filter(a => a.layer === layer);
            const done = layerActions.filter(a => a.status === 'done').length;
            const total = layerActions.length;
            const percent = total > 0 ? Math.round((done / total) * 100) : 0;
            layerPercents.push(percent);

            const progressBar = document.getElementById(`layer${layer}-progress`);
            const percentText = document.getElementById(`layer${layer}-percent`);

            if (progressBar) progressBar.style.width = `${percent}%`;
            if (percentText) percentText.textContent = `${percent}%`;
        }

        // Show warning if Layer 2 > Layer 1 (building on shaky foundation)
        const warningEl = document.getElementById('layer-warning');
        if (warningEl) {
            if (layerPercents[1] > layerPercents[0] && layerPercents[0] < 50) {
                warningEl.style.display = 'flex';
            } else {
                warningEl.style.display = 'none';
            }
        }
    },

    renderKPIGauges() {
        const container = document.getElementById('kpi-gauges');
        if (!container) return;

        const { current: latestScores, previous: prevScores } = this.getScoresWithTrend();

        container.innerHTML = this.kpis.map(kpi => {
            const score = latestScores[kpi.id];
            const prevScore = prevScores[kpi.id];
            let trend = '';
            let trendClass = '';

            if (score !== null && prevScore !== null) {
                if (score > prevScore) {
                    trend = '<span class="trend-up">&#9650;</span>';
                    trendClass = 'trending-up';
                } else if (score < prevScore) {
                    trend = '<span class="trend-down">&#9660;</span>';
                    trendClass = 'trending-down';
                } else {
                    trend = '<span class="trend-flat">&#8212;</span>';
                }
            }

            // Calculate fill percentage for visual gauge
            const fillPercent = score !== null ? (score / 4) * 100 : 0;

            return `
                <div class="kpi-gauge ${trendClass}">
                    <div class="kpi-gauge-ring">
                        <svg viewBox="0 0 36 36">
                            <path class="gauge-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                            <path class="gauge-fill" stroke-dasharray="${fillPercent}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                        </svg>
                        <div class="kpi-gauge-value">${score !== null ? score : '-'}${trend}</div>
                    </div>
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

    getScoresWithTrend() {
        const current = {};
        const previous = {};
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        this.kpis.forEach(kpi => {
            current[kpi.id] = null;
            previous[kpi.id] = null;
        });

        // Get scores sorted by month descending
        const sortedScores = this.kpiScores
            .filter(s => s.year === currentYear)
            .sort((a, b) => b.month - a.month);

        // Get current and previous month scores
        this.kpis.forEach(kpi => {
            const kpiScores = sortedScores.filter(s => s.kpi_id === kpi.id);
            if (kpiScores.length > 0) {
                current[kpi.id] = kpiScores[0].score;
                if (kpiScores.length > 1) {
                    previous[kpi.id] = kpiScores[1].score;
                }
            }
        });

        return { current, previous };
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
