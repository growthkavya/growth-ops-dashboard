/**
 * Activity Log Module
 */

const activityModule = {
    activities: [],
    profiles: [],
    currentFilter: { user: 'all', type: 'all' },

    async init() {
        await this.loadData();
        this.render();
        this.setupEventListeners();
        this.setupRealtimeUpdates();
    },

    async loadData() {
        try {
            const [activities, profiles] = await Promise.all([
                db.getActivityLog(100),
                db.getProfiles()
            ]);

            this.activities = activities || [];
            this.profiles = profiles || [];
        } catch (error) {
            console.error('Failed to load activity log:', error);
            toast.error('Failed to load activity log');
        }
    },

    render() {
        this.renderFilters();
        this.renderTimeline();
    },

    renderFilters() {
        const userFilter = document.getElementById('activity-user-filter');
        if (userFilter) {
            const currentValue = userFilter.value;
            userFilter.innerHTML = `
                <option value="all">All Users</option>
                ${this.profiles.map(p => `
                    <option value="${p.id}" ${currentValue === p.id ? 'selected' : ''}>
                        ${p.full_name}
                    </option>
                `).join('')}
            `;
        }
    },

    renderTimeline() {
        const container = document.getElementById('activity-timeline');
        if (!container) return;

        const filtered = this.getFilteredActivities();

        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty">No activity to show</div>';
            return;
        }

        // Group by date
        const grouped = this.groupByDate(filtered);

        container.innerHTML = Object.entries(grouped).map(([date, activities]) => `
            <div class="activity-date-group">
                <div class="activity-date-header">${date}</div>
                ${activities.map(a => this.renderActivityItem(a)).join('')}
            </div>
        `).join('');
    },

    renderActivityItem(activity) {
        const icon = this.getActionIcon(activity.action);
        const time = new Date(activity.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        const actionText = this.formatAction(activity);
        const changes = this.formatChanges(activity.changes);

        return `
            <div class="activity-item">
                <div class="activity-icon ${activity.action}">${icon}</div>
                <div class="activity-content">
                    <div class="activity-text">${actionText}</div>
                    ${changes ? `<div class="activity-changes">${changes}</div>` : ''}
                    <div class="activity-timestamp">${time}</div>
                </div>
            </div>
        `;
    },

    getActionIcon(action) {
        const icons = {
            created: '+',
            updated: '~',
            deleted: '-'
        };
        return icons[action] || '?';
    },

    formatAction(activity) {
        const userName = activity.user_name || 'Someone';
        const entityType = activity.entity_type || 'item';
        const entityTitle = activity.entity_title || '';

        const actionMap = {
            created: 'created',
            updated: 'updated',
            deleted: 'deleted'
        };

        const action = actionMap[activity.action] || activity.action;

        return `<strong>${userName}</strong> ${action} ${entityType} ${entityTitle ? `"${entityTitle}"` : ''}`;
    },

    formatChanges(changes) {
        if (!changes) return null;

        const parts = [];
        for (const [key, value] of Object.entries(changes)) {
            if (typeof value === 'object' && value.from !== undefined) {
                parts.push(`${key}: ${value.from} → ${value.to}`);
            } else {
                parts.push(`${key}: ${value}`);
            }
        }

        return parts.length > 0 ? parts.join(', ') : null;
    },

    groupByDate(activities) {
        const groups = {};
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        activities.forEach(a => {
            const date = new Date(a.timestamp);
            const dateStr = date.toDateString();

            let label;
            if (dateStr === today) {
                label = 'Today';
            } else if (dateStr === yesterday) {
                label = 'Yesterday';
            } else {
                label = date.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric'
                });
            }

            if (!groups[label]) {
                groups[label] = [];
            }
            groups[label].push(a);
        });

        return groups;
    },

    getFilteredActivities() {
        return this.activities.filter(a => {
            const userMatch = this.currentFilter.user === 'all' ||
                a.user_id === this.currentFilter.user;
            const typeMatch = this.currentFilter.type === 'all' ||
                a.entity_type === this.currentFilter.type;
            return userMatch && typeMatch;
        });
    },

    setupEventListeners() {
        const userFilter = document.getElementById('activity-user-filter');
        const typeFilter = document.getElementById('activity-type-filter');

        if (userFilter) {
            userFilter.addEventListener('change', (e) => {
                this.currentFilter.user = e.target.value;
                this.renderTimeline();
            });
        }

        if (typeFilter) {
            typeFilter.addEventListener('change', (e) => {
                this.currentFilter.type = e.target.value;
                this.renderTimeline();
            });
        }
    },

    setupRealtimeUpdates() {
        realtime.subscribeToActivity((payload) => {
            if (payload.new) {
                this.activities.unshift(payload.new);
                this.renderTimeline();
            }
        });
    },

    refresh() {
        this.loadData().then(() => this.render());
    }
};
