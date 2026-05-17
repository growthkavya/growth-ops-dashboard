/**
 * Intern Module
 *
 * Handles the "shared inbox" intern flow:
 *  - One Supabase auth user (intern1@ssei.co.in) is shared by multiple humans.
 *  - After login, an "intern picker" overlay asks who is using the app now.
 *  - The selected intern_id persists in localStorage as 'selected_intern_id'.
 *  - All intern UI (My Tasks, Onboarding, Progress) is scoped to that intern_id.
 *
 * Notifications: any state change made while an intern is signed in writes a
 * notification row for Kavya + Riya so they see what the intern did and when.
 */

const internModule = {
    interns: [],        // all interns tied to the current shared auth user
    currentIntern: null,
    onboardingItems: [],
    myActions: [],

    // ---------- INIT ----------
    async init() {
        // Load interns linked to this auth user
        try {
            const all = await db.getInterns(true);   // active or onboarding
            this.interns = all.filter(i => i.auth_user_id === auth.currentUser?.id);
        } catch (e) {
            console.error('Failed to load interns:', e);
            this.interns = [];
        }

        // Restore previously-picked intern if still valid
        const savedId = localStorage.getItem('selected_intern_id');
        const saved = this.interns.find(i => i.id === savedId);
        if (saved) {
            this.currentIntern = saved;
            await this.loadInternData();
            this.renderDashboard();
            return;
        }

        // Otherwise show picker
        this.showPicker();
    },

    // ---------- PICKER ----------
    showPicker() {
        const overlay = document.createElement('div');
        overlay.className = 'intern-picker-overlay';
        overlay.id = 'intern-picker-overlay';
        overlay.innerHTML = `
            <div class="intern-picker-card">
                <h2>Who's on right now?</h2>
                <p class="sub">Multiple interns share this account. Pick yourself so we know what to show.</p>
                ${this.interns.length === 0
                    ? `<p style="text-align:center;color:var(--text-muted);padding:1rem 0;">
                         No interns set up yet. Ask Kavya or Riya to add you in the Manage Interns section.
                       </p>`
                    : `<ul class="intern-list">${this.interns.map(i => `
                        <li>
                            <button data-intern-id="${i.id}">
                                <span class="intern-name">${this.escape(i.name)}</span>
                                <span class="intern-meta">${i.status} · started ${i.start_date || '—'}</span>
                            </button>
                        </li>
                       `).join('')}</ul>`
                }
                <div class="intern-picker-footer">
                    Not you? <a id="intern-picker-signout">Sign out</a>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelectorAll('button[data-intern-id]').forEach(btn => {
            btn.addEventListener('click', () => this.pickIntern(btn.dataset.internId));
        });
        document.getElementById('intern-picker-signout')?.addEventListener('click', () => {
            auth.signOut();
        });
    },

    closePicker() {
        document.getElementById('intern-picker-overlay')?.remove();
    },

    async pickIntern(internId) {
        const picked = this.interns.find(i => i.id === internId);
        if (!picked) return;
        this.currentIntern = picked;
        localStorage.setItem('selected_intern_id', internId);
        this.closePicker();
        await this.loadInternData();
        this.renderDashboard();
    },

    // ---------- DATA ----------
    async loadInternData() {
        if (!this.currentIntern) return;
        try {
            const [onb, actions] = await Promise.all([
                db.getOnboardingItems(this.currentIntern.id),
                db.getActions()
            ]);
            this.onboardingItems = onb || [];
            // Only my actions (intern_id = current intern)
            this.myActions = (actions || []).filter(a => a.intern_id === this.currentIntern.id);
        } catch (e) {
            console.error('Failed to load intern data:', e);
        }
    },

    // ---------- RENDER ----------
    renderDashboard() {
        // Replace the standard dashboard sections with intern-specific ones
        const dashSection = document.getElementById('dashboard');
        if (!dashSection) return;
        const intern = this.currentIntern;
        const onbDone = this.onboardingItems.filter(i => i.status === 'done').length;
        const onbTotal = this.onboardingItems.length;

        dashSection.innerHTML = `
            <div class="intern-header" style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:0.5rem;">
                <div>
                    <h2 style="margin:0;">Hi, ${this.escape(intern.name)}</h2>
                    <p style="color:var(--text-muted);margin:0.25rem 0 0;font-size:0.92rem;">
                        ${intern.status === 'onboarding' ? 'Onboarding in progress' : 'Active intern'}
                        · supervised by Kavya & Riya
                    </p>
                </div>
                <button class="btn btn-secondary btn-small" id="intern-switch">Switch user</button>
            </div>

            <div class="card" style="margin-bottom:1.5rem;">
                <h3>Onboarding progress</h3>
                <p style="color:var(--text-muted);margin:0.25rem 0 1rem;">
                    ${onbDone} of ${onbTotal} done
                </p>
                <div style="background:var(--bg-secondary);height:8px;border-radius:4px;overflow:hidden;">
                    <div style="background:var(--success);height:100%;width:${onbTotal? Math.round(100*onbDone/onbTotal):0}%;transition:width 0.3s;"></div>
                </div>
                <ul class="onboarding-list" style="margin-top:1rem;">
                    ${this.onboardingItems.map(item => this.renderOnboardingItem(item)).join('')}
                </ul>
            </div>

            <div class="card">
                <h3>My tasks</h3>
                ${this.myActions.length === 0
                    ? `<p style="color:var(--text-muted);">
                         Nothing assigned yet. Kavya or Riya will add tasks here as they come up.
                       </p>`
                    : `<ul class="onboarding-list">${this.myActions.map(a => `
                        <li class="onboarding-item ${a.status === 'done' ? 'done' : ''}" data-action-id="${a.id}">
                            <div class="check intern-task-check" data-id="${a.id}" data-status="${a.status}">
                                ${a.status === 'done' ? '✓' : ''}
                            </div>
                            <div class="content">
                                <h4>${this.escape(a.title)}</h4>
                                <div class="desc">${this.escape(a.notes || '')}</div>
                                <span class="cat">${a.status.replace('_',' ')}</span>
                            </div>
                        </li>
                       `).join('')}</ul>`
                }
            </div>
        `;

        // Wire up onboarding checkbox clicks
        dashSection.querySelectorAll('.intern-onb-check').forEach(el => {
            el.addEventListener('click', () => this.toggleOnboarding(el.dataset.id));
        });
        // Wire up task checkbox clicks (intern can mark in_progress/done)
        dashSection.querySelectorAll('.intern-task-check').forEach(el => {
            el.addEventListener('click', () => this.cycleTaskStatus(el.dataset.id, el.dataset.status));
        });
        // Switch-user button
        document.getElementById('intern-switch')?.addEventListener('click', () => {
            localStorage.removeItem('selected_intern_id');
            this.currentIntern = null;
            window.location.reload();
        });
    },

    renderOnboardingItem(item) {
        const done = item.status === 'done';
        return `
            <li class="onboarding-item ${done ? 'done' : ''}">
                <div class="check intern-onb-check" data-id="${item.id}">${done ? '✓' : ''}</div>
                <div class="content">
                    <h4>${this.escape(item.title)}</h4>
                    ${item.description ? `<div class="desc">${this.escape(item.description)}</div>` : ''}
                    ${item.category ? `<span class="cat">${item.category}</span>` : ''}
                </div>
            </li>
        `;
    },

    // ---------- ACTIONS ----------
    async toggleOnboarding(itemId) {
        const item = this.onboardingItems.find(i => i.id === itemId);
        if (!item) return;
        const newStatus = item.status === 'done' ? 'not_started' : 'done';
        await db.updateOnboardingItem(itemId, {
            status: newStatus,
            completed_at: newStatus === 'done' ? new Date().toISOString() : null,
            completed_by_intern_id: newStatus === 'done' ? this.currentIntern.id : null
        });
        item.status = newStatus;

        // Notify Kavya + Riya
        if (newStatus === 'done') {
            await db.notifySupervisors({
                event_type: 'onboarding_completed',
                entity_type: 'onboarding_item',
                entity_id: itemId,
                entity_title: item.title,
                intern_id: this.currentIntern.id,
                message: `${this.currentIntern.name} completed onboarding item: ${item.title}`,
                link: '#dashboard'
            });
        }
        this.renderDashboard();
    },

    async cycleTaskStatus(actionId, currentStatus) {
        const flow = { not_started: 'in_progress', in_progress: 'done', done: 'not_started' };
        const next = flow[currentStatus] || 'in_progress';
        await db.updateAction(actionId, { status: next });
        const a = this.myActions.find(x => x.id === actionId);
        if (a) a.status = next;

        // Notify Kavya + Riya for in_progress / done transitions
        if (next === 'in_progress' || next === 'done') {
            await db.notifySupervisors({
                event_type: next === 'done' ? 'action_completed' : 'action_started',
                entity_type: 'action',
                entity_id: actionId,
                entity_title: a?.title || '',
                intern_id: this.currentIntern.id,
                message: `${this.currentIntern.name} marked task as ${next.replace('_',' ')}: ${a?.title || ''}`,
                link: '#dashboard'
            });
        }
        this.renderDashboard();
    },

    escape(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }
};
