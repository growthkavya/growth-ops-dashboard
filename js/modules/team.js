/**
 * Team Management Module
 */

const teamModule = {
    teamMembers: [],
    teamWorkLogs: [],
    myWorkLog: null,

    async init() {
        await this.loadTeamMembers();
        await this.loadTeamWorkLogs();
        await this.loadMyWorkLog();
        this.render();
        this.attachEventListeners();
    },

    async loadTeamMembers() {
        try {
            const userId = auth.getUser()?.id;
            if (userId) {
                this.teamMembers = await db.getTeamMembers(userId);
            }
        } catch (error) {
            console.error('Failed to load team members:', error);
        }
    },

    async loadTeamWorkLogs() {
        try {
            const userId = auth.getUser()?.id;
            if (userId) {
                this.teamWorkLogs = await db.getTeamWorkLogs(userId, 7);
            }
        } catch (error) {
            console.error('Failed to load team work logs:', error);
        }
    },

    async loadMyWorkLog() {
        try {
            const userId = auth.getUser()?.id;
            if (userId) {
                this.myWorkLog = await db.getTodayWorkLog(userId);
            }
        } catch (error) {
            console.error('Failed to load my work log:', error);
        }
    },

    render() {
        this.renderMyWorkLog();
        this.renderTeamOverview();
        this.renderTeamWorkLogs();
    },

    renderMyWorkLog() {
        const container = document.getElementById('my-work-log-form');
        if (!container) return;

        const log = this.myWorkLog || {};
        const tasksCompleted = (log.tasks_completed || []).join('\n');
        const tasksInProgress = (log.tasks_in_progress || []).join('\n');
        const blockers = (log.blockers || []).join('\n');

        container.innerHTML = `
            <div class="form-group">
                <label>Tasks Completed Today</label>
                <textarea id="tasks-completed" rows="3" placeholder="One task per line...">${tasksCompleted}</textarea>
            </div>
            <div class="form-group">
                <label>Tasks In Progress</label>
                <textarea id="tasks-in-progress" rows="3" placeholder="One task per line...">${tasksInProgress}</textarea>
            </div>
            <div class="form-group">
                <label>Blockers / Issues</label>
                <textarea id="blockers" rows="2" placeholder="Any blockers...">${blockers || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Notes</label>
                <textarea id="work-notes" rows="2" placeholder="Additional notes...">${log.notes || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Hours Worked</label>
                <input type="number" id="hours-worked" step="0.5" min="0" max="24" value="${log.hours_worked || ''}">
            </div>
            <button class="btn btn-primary" id="save-work-log-btn">Save Today's Log</button>
        `;
    },

    renderTeamOverview() {
        const container = document.getElementById('team-overview');
        if (!container) return;

        if (this.teamMembers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No team members yet.</p>
                    <p class="text-muted">To add team members:</p>
                    <ol class="text-muted">
                        <li>Create their account in Supabase Auth</li>
                        <li>Have them log in once</li>
                        <li>Run SQL to set you as their manager</li>
                    </ol>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="team-grid">
                ${this.teamMembers.map(member => this.renderTeamMemberCard(member)).join('')}
            </div>
        `;
    },

    renderTeamMemberCard(member) {
        // Get their latest work log
        const latestLog = this.teamWorkLogs.find(log => log.user_id === member.id);
        const tasksCount = latestLog ? (latestLog.tasks_completed?.length || 0) : 0;
        const hasBlockers = latestLog && latestLog.blockers && latestLog.blockers.length > 0;

        return `
            <div class="card team-member-card">
                <div class="team-member-header">
                    <span class="team-member-name">${member.full_name || member.email}</span>
                    <span class="team-member-role">${member.role || 'Member'}</span>
                </div>
                <div class="team-member-stats">
                    <div class="stat">
                        <span class="stat-value">${tasksCount}</span>
                        <span class="stat-label">Tasks Today</span>
                    </div>
                    ${hasBlockers ? '<span class="blocker-badge">Has Blockers</span>' : ''}
                </div>
                <div class="team-member-actions">
                    <button class="btn btn-sm" onclick="teamModule.viewMemberDetails('${member.id}')">View Details</button>
                </div>
            </div>
        `;
    },

    renderTeamWorkLogs() {
        const container = document.getElementById('team-work-logs');
        if (!container) return;

        if (this.teamWorkLogs.length === 0) {
            container.innerHTML = '<p class="text-muted">No work logs from team members yet.</p>';
            return;
        }

        // Group by date
        const byDate = {};
        this.teamWorkLogs.forEach(log => {
            const date = log.log_date;
            if (!byDate[date]) byDate[date] = [];
            byDate[date].push(log);
        });

        container.innerHTML = Object.entries(byDate).map(([date, logs]) => `
            <div class="work-log-date-group">
                <h4>${this.formatDate(date)}</h4>
                ${logs.map(log => this.renderWorkLogEntry(log)).join('')}
            </div>
        `).join('');
    },

    renderWorkLogEntry(log) {
        const memberName = log.profiles?.full_name || 'Unknown';
        const tasksCompleted = log.tasks_completed || [];
        const blockers = log.blockers || [];

        return `
            <div class="work-log-entry">
                <div class="work-log-header">
                    <span class="work-log-member">${memberName}</span>
                    ${log.hours_worked ? `<span class="work-log-hours">${log.hours_worked}h</span>` : ''}
                </div>
                ${tasksCompleted.length > 0 ? `
                    <div class="work-log-tasks">
                        <strong>Completed:</strong>
                        <ul>${tasksCompleted.map(t => `<li>${t}</li>`).join('')}</ul>
                    </div>
                ` : ''}
                ${blockers.length > 0 ? `
                    <div class="work-log-blockers">
                        <strong>Blockers:</strong>
                        <ul class="blockers-list">${blockers.map(b => `<li>${b}</li>`).join('')}</ul>
                    </div>
                ` : ''}
                ${log.notes ? `<div class="work-log-notes"><em>${log.notes}</em></div>` : ''}
            </div>
        `;
    },

    formatDate(dateStr) {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (dateStr === today.toISOString().split('T')[0]) return 'Today';
        if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';

        return date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
    },

    attachEventListeners() {
        // Save work log button
        document.addEventListener('click', async (e) => {
            if (e.target.id === 'save-work-log-btn') {
                await this.saveWorkLog();
            }
        });
    },

    async saveWorkLog() {
        const tasksCompleted = document.getElementById('tasks-completed')?.value
            .split('\n').map(t => t.trim()).filter(t => t);
        const tasksInProgress = document.getElementById('tasks-in-progress')?.value
            .split('\n').map(t => t.trim()).filter(t => t);
        const blockers = document.getElementById('blockers')?.value
            .split('\n').map(t => t.trim()).filter(t => t);
        const notes = document.getElementById('work-notes')?.value?.trim();
        const hoursWorked = parseFloat(document.getElementById('hours-worked')?.value) || null;

        const userId = auth.getUser()?.id;
        if (!userId) return;

        try {
            const log = {
                user_id: userId,
                log_date: new Date().toISOString().split('T')[0],
                tasks_completed: tasksCompleted,
                tasks_in_progress: tasksInProgress,
                blockers: blockers,
                notes: notes,
                hours_worked: hoursWorked
            };

            await db.upsertWorkLog(log);
            this.myWorkLog = log;

            // Log activity
            const profile = auth.getProfile();
            await db.logActivity(
                userId,
                profile?.full_name || 'Unknown',
                'updated',
                'work_log',
                null,
                'Daily Work Log'
            );

            alert('Work log saved!');
        } catch (error) {
            console.error('Failed to save work log:', error);
            alert('Failed to save work log: ' + error.message);
        }
    },

    viewMemberDetails(memberId) {
        const member = this.teamMembers.find(m => m.id === memberId);
        if (!member) return;

        const logs = this.teamWorkLogs.filter(l => l.user_id === memberId);

        // Show modal with member details
        const modalContent = `
            <h3>${member.full_name || member.email}</h3>
            <p><strong>Email:</strong> ${member.email}</p>
            <h4>Recent Work Logs</h4>
            ${logs.length > 0 ? logs.map(log => `
                <div class="work-log-entry">
                    <strong>${this.formatDate(log.log_date)}</strong>
                    ${log.tasks_completed?.length > 0 ? `
                        <ul>${log.tasks_completed.map(t => `<li>${t}</li>`).join('')}</ul>
                    ` : '<p class="text-muted">No tasks logged</p>'}
                </div>
            `).join('') : '<p class="text-muted">No work logs yet</p>'}
        `;

        // Use the modal system if available, or alert
        if (typeof Modal !== 'undefined') {
            Modal.show('Team Member Details', modalContent);
        } else {
            alert(`${member.full_name}\n${member.email}`);
        }
    }
};
