/**
 * People — the team and the interns.
 *
 * Merges what used to be two tabs (Team, Interns) plus a read-only
 * mirror of the Growth Lab. The mirror is gone: the Lab is a complete
 * app of its own, so this links to it rather than half-reproducing it.
 *
 * Each person's row answers one question — what are they carrying right
 * now — using the same work items everything else reads from.
 */

const peopleView = {

    render() {
        const body = document.getElementById('people-body');

        body.innerHTML = `
            ${this.teamBlock()}
            ${this.internsBlock()}
            ${this.labBlock()}`;

        this.wire();
    },

    /* ---------- Team ---------------------------------------- */

    teamBlock() {
        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Team</h3>
                <span class="eyebrow">Open work right now</span>
            </div>
            <div class="block-body block-body--flush">
                ${CONFIG.team.map(m => this.personRow(m)).join('')}
            </div>
        </div>`;
    },

    personRow(member) {
        const theirs  = store.workItems.filter(w => w.owner_name === member.key);
        const open    = theirs.filter(w => w.status !== 'done');
        const late    = open.filter(w => w.due_date && w.due_date < dates.today()).length;
        const blocked = open.filter(w => w.status === 'blocked').length;

        const kpis = store.kpis.filter(k => k.member === member.key);
        const summary = kpis.length ? scorecardView.summarise(kpis) : null;

        return `<div class="person">
            ${ui.avatar(member.name, member.key)}

            <div class="person-main">
                <div class="person-name">${esc(member.name)}</div>
                <div class="person-role">${esc(member.role)}</div>
                <div class="row-sub" style="margin-top:5px">
                    ${late ? ui.chip(`${late} past due`, 'bad') : ''}
                    ${blocked ? ui.chip(`${blocked} blocked`, 'warn') : ''}
                    ${!late && !blocked && open.length ? ui.chip('On track', 'good') : ''}
                    ${!open.length ? ui.chip('Nothing open') : ''}
                </div>
            </div>

            <div class="person-stats">
                <div class="person-stat">
                    <div class="person-stat-val">${open.length}</div>
                    <span class="eyebrow">Open</span>
                </div>
                <div class="person-stat">
                    <div class="person-stat-val">${theirs.length - open.length}</div>
                    <span class="eyebrow">Done</span>
                </div>
                <div class="person-stat">
                    <div class="person-stat-val">
                        ${summary && summary.scored ? summary.weighted.toFixed(1) : '—'}
                    </div>
                    <span class="eyebrow">Score</span>
                </div>
            </div>
        </div>`;
    },

    /* ---------- Interns ------------------------------------- */

    internsBlock() {
        const active = store.interns.filter(i => ['onboarding', 'active'].includes(i.status));
        const past   = store.interns.filter(i => ['completed', 'archived'].includes(i.status));

        return `<div class="block">
            <div class="block-head">
                <div>
                    <h3 class="h-block">Interns</h3>
                    <p class="meta">Day-to-day tracking lives in the Growth Lab. This is the roster and onboarding.</p>
                </div>
                ${auth.role !== 'intern' ? `<button class="btn btn-sm" id="intern-new">Add intern</button>` : ''}
            </div>

            ${active.length === 0
                ? ui.empty('No interns on the roster',
                    'Add someone to start their onboarding checklist and give them work in Delegations.')
                : `<div class="block-body block-body--flush">
                    ${active.map(i => this.internRow(i)).join('')}
                   </div>`}

            ${past.length ? `
                <div class="block-body" style="border-top:1px solid var(--line)">
                    <span class="eyebrow">Finished · ${past.length}</span>
                    <p class="meta" style="margin-top:var(--s2)">
                        ${past.map(i => esc(i.name)).join(' · ')}
                    </p>
                </div>` : ''}
        </div>`;
    },

    internRow(intern) {
        const theirs = store.workItems.filter(w => w.intern_id === intern.id);
        const open   = theirs.filter(w => w.status !== 'done').length;

        return `<div class="person">
            ${ui.avatar(intern.name, CONFIG.internKey)}

            <div class="person-main">
                <div class="person-name">${esc(intern.name)}</div>
                <div class="person-role">
                    ${esc((intern.tags || []).join(' · ') || 'No team set')}
                    ${intern.start_date ? ` · started ${dates.short(intern.start_date)}` : ''}
                </div>
                <div class="row-sub" style="margin-top:5px">
                    ${ui.chip(intern.status === 'onboarding' ? 'Onboarding' : 'Active',
                              intern.status === 'onboarding' ? 'warn' : 'good')}
                    ${intern.intern_code ? `<span class="num meta">${esc(intern.intern_code)}</span>` : ''}
                </div>
            </div>

            <div class="person-stats">
                <div class="person-stat">
                    <div class="person-stat-val">${open}</div>
                    <span class="eyebrow">Open</span>
                </div>
                <div class="person-stat" style="align-self:center">
                    <button class="btn btn-quiet btn-sm" data-onboarding="${intern.id}">Onboarding</button>
                    ${auth.role !== 'intern' ? `<button class="btn btn-quiet btn-sm" data-intern="${intern.id}">Edit</button>` : ''}
                </div>
            </div>
        </div>`;
    },

    labBlock() {
        return `<div class="block">
            <div class="block-head">
                <div>
                    <h3 class="h-block">Growth Lab</h3>
                    <p class="meta">Attendance, daily check-ins, intern KPIs, ideas and learnings — the interns' own workspace.</p>
                </div>
                <a href="${escAttr(CONFIG.growthLabUrl)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">
                    Open Growth Lab &#8599;
                </a>
            </div>
        </div>`;
    },

    /* ---------- Interactions -------------------------------- */

    wire() {
        const view = document.getElementById('view-people');

        document.getElementById('intern-new')?.addEventListener('click', () => this.editIntern());

        view.querySelectorAll('[data-intern]').forEach(btn =>
            btn.addEventListener('click', () => this.editIntern(btn.dataset.intern)));

        view.querySelectorAll('[data-onboarding]').forEach(btn =>
            btn.addEventListener('click', () => this.openOnboarding(btn.dataset.onboarding)));
    },

    async openOnboarding(internId) {
        const intern = store.interns.find(i => i.id === internId);
        if (!intern) return;

        const items = await data.onboardingItems(internId);
        const done = items.filter(i => i.status === 'done').length;

        ui.modal({
            title: `${intern.name} — onboarding`,
            wide: true,
            body: items.length === 0
                ? `<p class="meta">No checklist for this person. Checklists are copied from the active template when an intern is added.</p>`
                : `<div style="margin-bottom:var(--s4)">
                       ${ui.measureRow({ value: done, max: items.length, target: items.length,
                                         label: `${done}/${items.length}` })}
                   </div>
                   <div class="block-body--flush">
                       ${items.map(i => `
                           <div class="row-item" style="padding-left:0;padding-right:0">
                               <button class="dot s-${i.status}" data-onboarding-step="${i.id}"
                                       title="${esc(VOCAB.status[i.status])} — click to advance"></button>
                               <div class="row-main">
                                   <div class="row-title ${i.status === 'done' ? 'strike' : ''}">${esc(i.title)}</div>
                                   ${i.description ? `<div class="row-sub">${esc(i.description)}</div>` : ''}
                               </div>
                               ${i.category ? ui.chip(i.category) : ''}
                           </div>`).join('')}
                   </div>`,
            onSubmit: null
        });

        // Scoped to the modal: Home's progress chips also carry a step
        // attribute, and an unscoped query would rewire them.
        document.getElementById('modal-host').querySelectorAll('[data-onboarding-step]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const item = items.find(i => i.id === btn.dataset.onboardingStep);
                if (!item) return;
                const cycle = VOCAB.statusCycle;
                const next = cycle[(cycle.indexOf(item.status) + 1) % cycle.length];
                await data.updateOnboardingItem(item.id, {
                    status: next,
                    completed_at: next === 'done' ? new Date().toISOString() : null
                });
                item.status = next;
                btn.className = `dot s-${next}`;
                btn.closest('.row-item').querySelector('.row-title')
                   .classList.toggle('strike', next === 'done');
            });
        });
    },

    editIntern(id = null) {
        const i = id ? store.interns.find(x => x.id === id) : null;

        const supervisors = store.profiles
            .filter(p => p.role !== 'intern')
            .map(p => ({ value: p.id, label: p.full_name || p.email }));

        ui.modal({
            title: i ? 'Intern' : 'Add an intern',
            body: `
                ${ui.field('name', 'Name', { value: i?.name || '', required: true })}
                <div class="field-pair">
                    ${ui.field('intern_code', 'Short code', {
                        value: i?.intern_code || '', required: true,
                        placeholder: 'akash-01', hint: 'Unique. Used to tell shared-login interns apart.' })}
                    ${ui.field('email_alias', 'Email', { value: i?.email_alias || '' })}
                </div>
                <div class="field-pair">
                    ${ui.select('supervisor_id', 'Reports to', supervisors, { value: i?.supervisor_id || auth.userId })}
                    ${ui.select('status', 'Status', [
                        { value: 'onboarding', label: 'Onboarding' },
                        { value: 'active', label: 'Active' },
                        { value: 'completed', label: 'Finished' },
                        { value: 'archived', label: 'Archived' }
                    ], { value: i?.status || 'onboarding' })}
                </div>
                <div class="field-pair">
                    ${ui.field('start_date', 'Started', { type: 'date', value: i?.start_date || '' })}
                    ${ui.field('end_date', 'Ends', { type: 'date', value: i?.end_date || '' })}
                </div>
                ${ui.field('tags', 'Team', {
                    value: (i?.tags || []).join(', '),
                    placeholder: 'growth_ops, performance',
                    hint: 'Comma separated. Matches the verticals used in the Growth Lab.' })}
                ${ui.textarea('notes', 'Notes', { value: i?.notes || '' })}`,
            submitLabel: i ? 'Save' : 'Add intern',
            onSubmit: async (form) => {
                const fields = {
                    name: (form.get('name') || '').trim(),
                    intern_code: (form.get('intern_code') || '').trim(),
                    email_alias: form.get('email_alias') || null,
                    supervisor_id: form.get('supervisor_id') || null,
                    status: form.get('status'),
                    start_date: form.get('start_date') || null,
                    end_date: form.get('end_date') || null,
                    tags: (form.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean),
                    notes: form.get('notes') || null
                };
                if (i) await data.updateIntern(i.id, fields);
                else   await data.createIntern(fields);
                toast(i ? 'Saved' : 'Intern added');
                await store.reload();
            }
        });
    }
};
