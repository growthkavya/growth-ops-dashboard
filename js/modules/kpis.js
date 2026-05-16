/**
 * KPIs Module — Year 2 KRA framework
 *
 * 30 KPIs (10 per member × 3 members) organized under 5 KRAs.
 * UI has a team tab (Kavya / Riya), cards grouped by KRA,
 * and a monthly scoring table (Apr / May / Jun) with click-to-edit cells.
 */

const kpisModule = {
    kpis: [],
    scores: [],
    kras: [],
    currentMember: 'kavya',

    async init() {
        await this.loadData();
        this.renderTabs();
        this.render();
        this.setupEventListeners();
    },

    async loadData() {
        try {
            const [kpis, scores, kras] = await Promise.all([
                db.getKPIs(),
                db.getKPIScores(),
                db.getKRAs()
            ]);

            this.kpis = kpis || [];
            this.scores = scores || [];
            this.kras = (kras || []).slice().sort((a, b) => a.sort_order - b.sort_order);
        } catch (error) {
            console.error('Failed to load KPIs:', error);
            toast.error('Failed to load KPIs');
        }
    },

    render() {
        this.renderKPICards();
        this.renderKPITable();
        this.renderMemberWeightedScore();
    },

    renderTabs() {
        const container = document.getElementById('kpi-tabs');
        if (!container) return;

        container.innerHTML = APP_CONFIG.team.map(m => `
            <button class="tab-btn ${m.id === this.currentMember ? 'active' : ''}"
                    data-member="${m.id}"
                    style="--member-color: ${m.color}">
                ${m.name}
                <span class="tab-role">${m.role}</span>
            </button>
        `).join('');

        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentMember = btn.dataset.member;
                container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.render();
            });
        });
    },

    memberKPIs() {
        return this.kpis.filter(k => k.member === this.currentMember);
    },

    renderKPICards() {
        const container = document.getElementById('kpi-grid');
        if (!container) return;

        const memberKpis = this.memberKPIs();
        if (memberKpis.length === 0) {
            container.innerHTML = '<div class="empty">No KPIs set up yet for this member</div>';
            return;
        }

        // Group by KRA
        let html = '';
        for (const kra of this.kras) {
            const kraKpis = memberKpis.filter(k => k.kra_id === kra.id);
            if (kraKpis.length === 0) continue;

            const totalWeight = kraKpis.reduce((sum, k) => sum + (k.weight || 0), 0);

            html += `
                <div class="kra-kpi-section" data-kra="${kra.kra_code}">
                    <h4 class="kra-kpi-title">
                        <span class="kra-num">${kra.kra_code.replace('kra','')}</span>
                        ${kra.short_name}
                        <span class="kra-weight-pill">${totalWeight}%</span>
                    </h4>
                    <div class="kpi-card-row">
                        ${kraKpis.map(kpi => this.renderKPICard(kpi)).join('')}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    },

    renderKPICard(kpi) {
        const latestScore = this.getLatestScore(kpi.id);
        const scoreClass = latestScore === null ? 'no-score' :
            latestScore >= kpi.target ? 'at-target' :
            latestScore >= kpi.target - 1 ? 'near-target' : 'below-target';

        return `
            <div class="kpi-card ${scoreClass}" data-id="${kpi.id}">
                <div class="kpi-card-header">
                    <span class="kpi-card-name">${this.escape(kpi.name)}</span>
                    <span class="kpi-card-weight">${kpi.weight}%</span>
                </div>
                <div class="kpi-card-measure">${this.escape(kpi.measure || kpi.description || '')}</div>
                <div class="kpi-card-score">
                    <span class="kpi-card-value">${latestScore !== null ? latestScore : '-'}</span>
                    <span class="kpi-card-target">/ ${kpi.target}</span>
                </div>
            </div>
        `;
    },

    renderKPITable() {
        const tbody = document.getElementById('kpi-table-body');
        if (!tbody) return;

        const memberKpis = this.memberKPIs();
        const currentYear = 2026;
        const months = APP_CONFIG.quarterMonths;

        if (memberKpis.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty">No KPIs yet for ${memberName(this.currentMember)}</td></tr>`;
            return;
        }

        tbody.innerHTML = memberKpis.map(kpi => {
            const kraShortName = kpi.kras?.short_name || kraShort(this.kras.find(k => k.id === kpi.kra_id)?.kra_code || '');
            const scores = months.map(m => {
                const score = this.scores.find(s =>
                    s.kpi_id === kpi.id && s.month === m.num && s.year === currentYear
                );
                return score ? score.score : null;
            });

            return `
                <tr>
                    <td class="cell-kra">${this.escape(kraShortName)}</td>
                    <td class="cell-kpi" title="${this.escape(kpi.definition || '')}">${this.escape(kpi.name)}</td>
                    <td>${kpi.weight}%</td>
                    ${scores.map((s, i) => `
                        <td class="score-cell" data-kpi="${kpi.id}" data-month="${months[i].num}" data-year="${currentYear}">
                            ${s !== null ? s : '<span class="score-empty">—</span>'}
                        </td>
                    `).join('')}
                    <td>${kpi.target}</td>
                </tr>
            `;
        }).join('');

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

    renderMemberWeightedScore() {
        const el = document.getElementById('weighted-score-pill');
        if (!el) return;

        const score = this.calculateMemberWeightedScore(this.currentMember);
        el.textContent = score !== null ? score.toFixed(2) : '-';
    },

    calculateMemberWeightedScore(memberId) {
        const memberKpis = this.kpis.filter(k => k.member === memberId);
        let totalWeight = 0, weightedSum = 0;
        memberKpis.forEach(kpi => {
            const score = this.getLatestScore(kpi.id);
            if (score !== null) {
                weightedSum += score * kpi.weight;
                totalWeight += kpi.weight;
            }
        });
        return totalWeight === 0 ? null : weightedSum / totalWeight;
    },

    getLatestScore(kpiId) {
        const currentYear = 2026;
        const kpiScores = this.scores
            .filter(s => s.kpi_id === kpiId && s.year === currentYear)
            .sort((a, b) => b.month - a.month);

        return kpiScores.length > 0 ? kpiScores[0].score : null;
    },

    escape(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    },

    showAddScoreModal() {
        const currentYear = 2026;
        const currentMonth = new Date().getMonth() + 1;
        const memberKpis = this.memberKPIs();

        const content = `
            <form id="score-form">
                <div class="form-group">
                    <label for="score-kpi">KPI (${memberName(this.currentMember)})</label>
                    <select id="score-kpi" name="kpi_id" required>
                        ${memberKpis.map(k => `<option value="${k.id}">${this.escape(k.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="score-month">Month</label>
                    <select id="score-month" name="month" required>
                        ${APP_CONFIG.quarterMonths.map(m => `
                            <option value="${m.num}" ${currentMonth === m.num ? 'selected' : ''}>${m.full}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="score-year">Year</label>
                    <input type="number" id="score-year" name="year" value="${currentYear}" required>
                </div>
                <div class="form-group">
                    <label for="score-value">Score (1-5)</label>
                    <input type="number" id="score-value" name="score" min="1" max="5" step="0.1" required>
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
            s.kpi_id === kpiId && s.month === month && s.year === year
        );

        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        // Show the rubric so the scorer can pick based on behaviour
        const rubric = Array.isArray(kpi?.rubric) ? kpi.rubric : [];
        const rubricHtml = rubric.length ? `
            <div class="rubric-block">
                <div class="rubric-title">Rubric</div>
                <ul class="rubric-list">
                    ${rubric.map(r => {
                        const [level, desc] = String(r).split('|');
                        return `<li><strong>${level}</strong> — ${this.escape(desc || '')}</li>`;
                    }).join('')}
                </ul>
            </div>
        ` : '';

        const content = `
            <form id="score-form">
                <p><strong>KPI:</strong> ${this.escape(kpi?.name || '')}</p>
                <p><strong>Member:</strong> ${memberName(kpi?.member)} • <strong>Weight:</strong> ${kpi?.weight || 0}%</p>
                <p><strong>Period:</strong> ${monthNames[month]} ${year}</p>
                ${kpi?.measure ? `<p class="text-muted"><strong>Measure:</strong> ${this.escape(kpi.measure)}</p>` : ''}
                ${rubricHtml}
                <div class="form-group">
                    <label for="score-value">Score (1-5)</label>
                    <input type="number" id="score-value" name="score" min="1" max="5" step="0.1"
                        value="${existingScore?.score ?? ''}" required>
                </div>
                <div class="form-group">
                    <label for="score-notes">Notes</label>
                    <textarea id="score-notes" name="notes">${this.escape(existingScore?.notes || '')}</textarea>
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
        this.loadData().then(() => {
            this.renderTabs();
            this.render();
        });
    }
};
