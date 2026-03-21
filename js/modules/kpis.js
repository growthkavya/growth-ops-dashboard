/**
 * KPIs Module
 */

const kpisModule = {
    kpis: [],
    scores: [],

    async init() {
        await this.loadData();
        this.render();
        this.setupEventListeners();
    },

    async loadData() {
        try {
            const [kpis, scores] = await Promise.all([
                db.getKPIs(),
                db.getKPIScores()
            ]);

            this.kpis = kpis || [];
            this.scores = scores || [];
        } catch (error) {
            console.error('Failed to load KPIs:', error);
            toast.error('Failed to load KPIs');
        }
    },

    render() {
        this.renderKPICards();
        this.renderKPITable();
    },

    renderKPICards() {
        const container = document.getElementById('kpi-grid');
        if (!container) return;

        container.innerHTML = this.kpis.map(kpi => {
            const latestScore = this.getLatestScore(kpi.id);

            return `
                <div class="kpi-card" data-id="${kpi.id}">
                    <div class="kpi-card-header">
                        <span class="kpi-card-name">${kpi.name}</span>
                        <span class="kpi-card-weight">${kpi.weight}%</span>
                    </div>
                    <div class="kpi-card-desc">${kpi.description || ''}</div>
                    <div class="kpi-card-score">
                        <span class="kpi-card-value">${latestScore !== null ? latestScore : '-'}</span>
                        <span class="kpi-card-target">/ ${kpi.target}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderKPITable() {
        const tbody = document.getElementById('kpi-table-body');
        if (!tbody) return;

        const currentYear = new Date().getFullYear();
        const months = ['march', 'april', 'may', 'june'];
        const monthNumbers = [3, 4, 5, 6];

        tbody.innerHTML = this.kpis.map(kpi => {
            const scores = monthNumbers.map(month => {
                const score = this.scores.find(s =>
                    s.kpi_id === kpi.id &&
                    s.month === month &&
                    s.year === currentYear
                );
                return score ? score.score : '-';
            });

            return `
                <tr>
                    <td>${kpi.name}</td>
                    <td>${kpi.weight}%</td>
                    ${scores.map((s, i) => `
                        <td class="score-cell" data-kpi="${kpi.id}" data-month="${monthNumbers[i]}" data-year="${currentYear}">
                            ${s}
                        </td>
                    `).join('')}
                    <td>${kpi.target}</td>
                </tr>
            `;
        }).join('');

        // Make cells clickable
        tbody.querySelectorAll('.score-cell').forEach(cell => {
            cell.style.cursor = 'pointer';
            cell.addEventListener('click', () => {
                this.showScoreModal(
                    cell.dataset.kpi,
                    parseInt(cell.dataset.month),
                    parseInt(cell.dataset.year)
                );
            });
        });
    },

    getLatestScore(kpiId) {
        const currentYear = new Date().getFullYear();
        const kpiScores = this.scores
            .filter(s => s.kpi_id === kpiId && s.year === currentYear)
            .sort((a, b) => b.month - a.month);

        return kpiScores.length > 0 ? kpiScores[0].score : null;
    },

    showAddScoreModal() {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;

        const content = `
            <form id="score-form">
                <div class="form-group">
                    <label for="score-kpi">KPI</label>
                    <select id="score-kpi" name="kpi_id" required>
                        ${this.kpis.map(k => `<option value="${k.id}">${k.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="score-month">Month</label>
                    <select id="score-month" name="month" required>
                        <option value="1">January</option>
                        <option value="2">February</option>
                        <option value="3">March</option>
                        <option value="4" ${currentMonth === 4 ? 'selected' : ''}>April</option>
                        <option value="5" ${currentMonth === 5 ? 'selected' : ''}>May</option>
                        <option value="6" ${currentMonth === 6 ? 'selected' : ''}>June</option>
                        <option value="7">July</option>
                        <option value="8">August</option>
                        <option value="9">September</option>
                        <option value="10">October</option>
                        <option value="11">November</option>
                        <option value="12">December</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="score-year">Year</label>
                    <input type="number" id="score-year" name="year" value="${currentYear}" required>
                </div>
                <div class="form-group">
                    <label for="score-value">Score (0-5)</label>
                    <input type="number" id="score-value" name="score" min="0" max="5" step="0.1" required>
                </div>
                <div class="form-group">
                    <label for="score-notes">Notes</label>
                    <textarea id="score-notes" name="notes"></textarea>
                </div>
            </form>
        `;

        modal.show({
            title: 'Add KPI Score',
            content,
            onSave: async () => {
                const form = document.getElementById('score-form');
                const formData = new FormData(form);

                const score = {
                    kpi_id: formData.get('kpi_id'),
                    month: parseInt(formData.get('month')),
                    year: parseInt(formData.get('year')),
                    score: parseFloat(formData.get('score')),
                    notes: formData.get('notes'),
                    created_by: auth.currentUser.id
                };

                await db.upsertKPIScore(score);

                const kpi = this.kpis.find(k => k.id === score.kpi_id);
                await db.logActivity(
                    auth.currentUser.id,
                    auth.currentProfile?.full_name || 'Unknown',
                    'updated',
                    'kpi',
                    score.kpi_id,
                    `${kpi?.name || 'KPI'} score`,
                    { month: score.month, score: score.score }
                );

                await this.loadData();
                this.render();
                toast.success('Score saved');

                if (typeof dashboardModule !== 'undefined') {
                    dashboardModule.refresh();
                }
            }
        });
    },

    showScoreModal(kpiId, month, year) {
        const kpi = this.kpis.find(k => k.id === kpiId);
        const existingScore = this.scores.find(s =>
            s.kpi_id === kpiId &&
            s.month === month &&
            s.year === year
        );

        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        const content = `
            <form id="score-form">
                <p><strong>KPI:</strong> ${kpi?.name}</p>
                <p><strong>Period:</strong> ${monthNames[month]} ${year}</p>
                <div class="form-group">
                    <label for="score-value">Score (0-5)</label>
                    <input type="number" id="score-value" name="score" min="0" max="5" step="0.1"
                        value="${existingScore?.score || ''}" required>
                </div>
                <div class="form-group">
                    <label for="score-notes">Notes</label>
                    <textarea id="score-notes" name="notes">${existingScore?.notes || ''}</textarea>
                </div>
            </form>
        `;

        modal.show({
            title: 'Update KPI Score',
            content,
            onSave: async () => {
                const form = document.getElementById('score-form');
                const formData = new FormData(form);

                const score = {
                    kpi_id: kpiId,
                    month: month,
                    year: year,
                    score: parseFloat(formData.get('score')),
                    notes: formData.get('notes'),
                    created_by: auth.currentUser.id
                };

                await db.upsertKPIScore(score);

                await db.logActivity(
                    auth.currentUser.id,
                    auth.currentProfile?.full_name || 'Unknown',
                    'updated',
                    'kpi',
                    kpiId,
                    `${kpi?.name || 'KPI'} score`,
                    { month: month, score: score.score }
                );

                await this.loadData();
                this.render();
                toast.success('Score updated');

                if (typeof dashboardModule !== 'undefined') {
                    dashboardModule.refresh();
                }
            }
        });
    },

    setupEventListeners() {
        const addBtn = document.getElementById('add-score-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddScoreModal());
        }
    },

    refresh() {
        this.loadData().then(() => this.render());
    }
};
