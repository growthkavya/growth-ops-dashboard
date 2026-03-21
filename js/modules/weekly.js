/**
 * Weekly Log Module
 */

const weeklyModule = {
    currentWeek: 1,
    currentYear: 2026,
    weeklyLog: null,

    async init() {
        this.setCurrentWeek();
        await this.loadData();
        this.render();
        this.setupEventListeners();
    },

    setCurrentWeek() {
        const now = new Date();
        this.currentYear = now.getFullYear();

        // Calculate week number (ISO week)
        const onejan = new Date(now.getFullYear(), 0, 1);
        this.currentWeek = Math.ceil((((now - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    },

    async loadData() {
        try {
            this.weeklyLog = await db.getWeeklyLog(this.currentWeek, this.currentYear);
        } catch (error) {
            console.error('Failed to load weekly log:', error);
            this.weeklyLog = null;
        }
    },

    render() {
        this.renderWeekNav();
        this.renderFocus();
        this.renderDays();
        this.renderSummary();
    },

    renderWeekNav() {
        const display = document.getElementById('current-week');
        if (display) {
            display.textContent = `Week ${this.currentWeek}, ${this.currentYear}`;
        }
    },

    renderFocus() {
        const input = document.getElementById('week-focus-input');
        if (input) {
            input.value = this.weeklyLog?.focus || '';
        }
    },

    renderDays() {
        const container = document.getElementById('weekly-grid');
        if (!container) return;

        const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        const entries = {};
        if (this.weeklyLog?.daily_entries) {
            this.weeklyLog.daily_entries.forEach(e => {
                entries[e.day] = e;
            });
        }

        container.innerHTML = days.map((day, i) => {
            const entry = entries[day] || { completed: [], blockers: [], notes: '' };

            return `
                <div class="day-card" data-day="${day}">
                    <h4>${dayNames[i]}</h4>
                    <div class="day-section">
                        <div class="day-section-label">Completed</div>
                        <ul class="day-items">
                            ${entry.completed.length
                                ? entry.completed.map(c => `<li>${c}</li>`).join('')
                                : '<li class="empty">-</li>'
                            }
                        </ul>
                        <input type="text" class="day-input completed-input" data-day="${day}"
                            placeholder="Add completed item...">
                    </div>
                    <div class="day-section">
                        <div class="day-section-label">Blockers</div>
                        <ul class="day-items blockers">
                            ${entry.blockers.length
                                ? entry.blockers.map(b => `<li>${b}</li>`).join('')
                                : '<li class="empty">-</li>'
                            }
                        </ul>
                        <input type="text" class="day-input blocker-input" data-day="${day}"
                            placeholder="Add blocker...">
                    </div>
                </div>
            `;
        }).join('');

        // Attach input handlers
        container.querySelectorAll('.completed-input').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                    this.addCompletedItem(e.target.dataset.day, e.target.value.trim());
                    e.target.value = '';
                }
            });
        });

        container.querySelectorAll('.blocker-input').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                    this.addBlocker(e.target.dataset.day, e.target.value.trim());
                    e.target.value = '';
                }
            });
        });
    },

    renderSummary() {
        const input = document.getElementById('week-summary-input');
        if (input) {
            input.value = this.weeklyLog?.summary || '';
        }
    },

    async ensureWeeklyLog() {
        if (!this.weeklyLog) {
            this.weeklyLog = await db.upsertWeeklyLog({
                week_number: this.currentWeek,
                year: this.currentYear,
                focus: '',
                summary: ''
            });
        }
        return this.weeklyLog;
    },

    async addCompletedItem(day, item) {
        try {
            await this.ensureWeeklyLog();

            const entries = {};
            if (this.weeklyLog.daily_entries) {
                this.weeklyLog.daily_entries.forEach(e => {
                    entries[e.day] = e;
                });
            }

            const entry = entries[day] || { completed: [], blockers: [] };
            entry.completed = [...(entry.completed || []), item];

            await db.upsertDailyEntry({
                weekly_log_id: this.weeklyLog.id,
                day: day,
                completed: entry.completed,
                blockers: entry.blockers || []
            });

            await this.loadData();
            this.render();
            toast.success('Item added');
        } catch (error) {
            console.error('Failed to add item:', error);
            toast.error('Failed to add item');
        }
    },

    async addBlocker(day, item) {
        try {
            await this.ensureWeeklyLog();

            const entries = {};
            if (this.weeklyLog.daily_entries) {
                this.weeklyLog.daily_entries.forEach(e => {
                    entries[e.day] = e;
                });
            }

            const entry = entries[day] || { completed: [], blockers: [] };
            entry.blockers = [...(entry.blockers || []), item];

            await db.upsertDailyEntry({
                weekly_log_id: this.weeklyLog.id,
                day: day,
                completed: entry.completed || [],
                blockers: entry.blockers
            });

            await this.loadData();
            this.render();
            toast.success('Blocker added');
        } catch (error) {
            console.error('Failed to add blocker:', error);
            toast.error('Failed to add blocker');
        }
    },

    async saveFocus() {
        try {
            const input = document.getElementById('week-focus-input');
            const focus = input?.value || '';

            await this.ensureWeeklyLog();
            await db.upsertWeeklyLog({
                week_number: this.currentWeek,
                year: this.currentYear,
                focus: focus,
                summary: this.weeklyLog?.summary || ''
            });

            toast.success('Focus saved');
        } catch (error) {
            toast.error('Failed to save focus');
        }
    },

    async saveSummary() {
        try {
            const input = document.getElementById('week-summary-input');
            const summary = input?.value || '';

            await this.ensureWeeklyLog();
            await db.upsertWeeklyLog({
                week_number: this.currentWeek,
                year: this.currentYear,
                focus: this.weeklyLog?.focus || '',
                summary: summary
            });

            toast.success('Summary saved');
        } catch (error) {
            toast.error('Failed to save summary');
        }
    },

    goToPrevWeek() {
        this.currentWeek--;
        if (this.currentWeek < 1) {
            this.currentWeek = 52;
            this.currentYear--;
        }
        this.loadData().then(() => this.render());
    },

    goToNextWeek() {
        this.currentWeek++;
        if (this.currentWeek > 52) {
            this.currentWeek = 1;
            this.currentYear++;
        }
        this.loadData().then(() => this.render());
    },

    setupEventListeners() {
        const prevBtn = document.getElementById('prev-week');
        const nextBtn = document.getElementById('next-week');
        const saveFocusBtn = document.getElementById('save-focus-btn');
        const saveSummaryBtn = document.getElementById('save-summary-btn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.goToPrevWeek());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.goToNextWeek());
        }

        if (saveFocusBtn) {
            saveFocusBtn.addEventListener('click', () => this.saveFocus());
        }

        if (saveSummaryBtn) {
            saveSummaryBtn.addEventListener('click', () => this.saveSummary());
        }
    },

    refresh() {
        this.loadData().then(() => this.render());
    }
};
