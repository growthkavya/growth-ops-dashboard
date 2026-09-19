/**
 * Shared UI kit — the pieces every view is assembled from.
 *
 * The important one is ui.measure(). Goal progress, a KPI score against
 * its target, a task's completion, and a document's freshness are all
 * the same question, so they all render as the same object. Nothing in
 * the app draws its own progress bar.
 */

/* ---------- Escaping --------------------------------------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const escAttr = (s) => String(s ?? '').replace(/"/g, '&quot;');

/* ---------- Dates ------------------------------------------ */

const dates = {
    /**
     * The office's calendar date for a moment, as YYYY-MM-DD. Taken in
     * Kolkata time: converting local midnight to UTC (the old approach)
     * lands on the previous day in India, which made "due today" read
     * as "due tomorrow".
     */
    iso(d = new Date()) {
        return new Date(d).toLocaleDateString('en-CA', { timeZone: CONFIG.office.timeZone });
    },

    today() {
        return this.iso();
    },

    daysAgo(n) {
        return this.addDays(this.today(), -n);
    },

    /** Calendar arithmetic on YYYY-MM-DD strings, immune to time zones. */
    addDays(iso, n) {
        const d = new Date(iso + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
    },

    /** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD string. */
    weekday(iso) {
        return new Date(iso + 'T12:00:00Z').getUTCDay();
    },

    /** Monday of the week containing `iso`. Weeks run Monday to Saturday here. */
    weekStart(iso = this.today()) {
        const wd = this.weekday(iso);
        return this.addDays(iso, wd === 0 ? -6 : 1 - wd);
    },

    monthStart(iso = this.today()) {
        return iso.slice(0, 8) + '01';
    },

    /** Every YYYY-MM-DD in a month. `month` is 1–12. */
    monthDays(year, month) {
        const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return Array.from({ length: n }, (_, i) =>
            `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
    },

    /** "10:24 am", in office time. */
    time(ts) {
        if (!ts) return '';
        return new Date(ts).toLocaleTimeString('en-IN', {
            timeZone: CONFIG.office.timeZone, hour: 'numeric', minute: '2-digit', hour12: true });
    },

    /** Minutes past midnight, office time, for comparing against office hours. */
    minutesOfDay(ts) {
        const [h, m] = new Date(ts).toLocaleTimeString('en-GB', {
            timeZone: CONFIG.office.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).split(':');
        return (+h % 24) * 60 + (+m);
    },

    /** "8h 45m" from two timestamps. */
    duration(from, to) {
        if (!from || !to) return '';
        const mins = Math.max(0, Math.round((new Date(to) - new Date(from)) / 60000));
        return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
    },

    /** "12 Aug" — the form used in every table and row. */
    short(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    },

    long(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    },

    /**
     * How a due date reads to a person: "Overdue by 3 days" beats
     * "2026-08-04" every time.
     */
    relativeDue(iso) {
        if (!iso) return { text: 'No date', tone: 'idle' };
        const days = Math.round((new Date(iso + 'T00:00:00') - new Date(dates.today() + 'T00:00:00')) / 86400000);
        if (days < -1) return { text: `${Math.abs(days)} days late`, tone: 'bad' };
        if (days === -1) return { text: 'A day late', tone: 'bad' };
        if (days === 0) return { text: 'Due today', tone: 'warn' };
        if (days === 1) return { text: 'Due tomorrow', tone: 'warn' };
        if (days <= 7) return { text: `Due in ${days} days`, tone: 'idle' };
        return { text: dates.short(iso), tone: 'idle' };
    },

    ago(iso) {
        if (!iso) return '';
        const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 7) return `${days}d ago`;
        return dates.short(iso);
    },

    daysSince(iso) {
        if (!iso) return null;
        return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    }
};

/* ---------- The kit ---------------------------------------- */

const ui = {

    /**
     * The measure. `value` and `target` are on the same scale as `max`.
     * Pass a target to get the notch; omit it for a plain fill.
     */
    measure({ value, max = 100, target = null, size = '', tone = null }) {
        const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
        const cls = tone || this.toneFor(value, target ?? max, max);
        const notch = target != null && max > 0
            ? `<span class="measure-notch" style="left:${Math.min(100, (target / max) * 100)}%"></span>`
            : '';
        return `<div class="measure ${size ? 'measure--' + size : ''}">
                    <div class="measure-fill is-${cls}" style="width:${pct}%"></div>${notch}
                </div>`;
    },

    /** Green at or above target, amber within 20% of it, red below. */
    toneFor(value, target, max = 100) {
        if (!value) return 'idle';
        if (target == null) return 'accent';
        if (value >= target) return 'good';
        if (value >= target * 0.8) return 'warn';
        return 'bad';
    },

    /** Measure with its number beside it, right-aligned so columns compare. */
    measureRow({ value, max = 100, target = null, label, size = 'sm', tone = null }) {
        return `<div class="measure-row">
                    ${this.measure({ value, max, target, size, tone })}
                    <span class="measure-val">${esc(label ?? Math.round(value) + '%')}</span>
                </div>`;
    },

    chip(text, tone = '') {
        return `<span class="chip ${tone ? 't-' + tone : ''}">${esc(text)}</span>`;
    },

    statusChip(status) {
        return this.chip(VOCAB.status[status] || status, VOCAB.statusTone[status]);
    },

    /**
     * A person, always with their identity colour. Callers that only have
     * a display name (a joined profile row) still get the right colour —
     * the name is matched back to a team key.
     */
    who(key, name) {
        const resolved = key || CONFIG.team.find(m =>
            (name || '').toLowerCase().startsWith(m.name.toLowerCase()))?.key;
        return `<span class="who" style="--who-color:${personColor(resolved)}">${esc(name || personName(key))}</span>`;
    },

    avatar(name, key) {
        return `<div class="person-mark" style="--who-color:${personColor(key)}">${esc(personInitials(name))}</div>`;
    },

    empty(title, body, action = '') {
        return `<div class="empty">
                    <p class="empty-title">${esc(title)}</p>
                    <p class="empty-body">${esc(body)}</p>
                    ${action}
                </div>`;
    },

    loading() {
        return `<p class="loading-note">Loading…</p>`;
    },

    /* ---------- Modal --------------------------------------- */

    /**
     * Opens a modal. `body` is HTML; `onSubmit` receives the form's
     * FormData and should throw to keep the modal open on failure.
     */
    modal({ title, body, submitLabel = 'Save', onSubmit, wide = false, danger = null }) {
        const host = document.getElementById('modal-host');
        host.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal ${wide ? 'modal--wide' : ''}" role="dialog" aria-modal="true" aria-label="${escAttr(title)}">
                    <form id="modal-form">
                        <div class="modal-head">
                            <h3 class="h-block">${esc(title)}</h3>
                            <button type="button" class="icon-btn" id="modal-x" aria-label="Close">&times;</button>
                        </div>
                        <div class="modal-body">${body}</div>
                        <div class="modal-foot">
                            ${danger ? `<button type="button" class="btn btn-danger" id="modal-danger" style="margin-right:auto">${esc(danger.label)}</button>` : ''}
                            <button type="button" class="btn" id="modal-cancel">Cancel</button>
                            ${onSubmit ? `<button type="submit" class="btn btn-primary" id="modal-save">${esc(submitLabel)}</button>` : ''}
                        </div>
                    </form>
                </div>
            </div>`;

        const close = () => { host.innerHTML = ''; document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);

        document.getElementById('modal-x').onclick = close;
        document.getElementById('modal-cancel').onclick = close;
        document.getElementById('modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') close();
        };

        if (danger) {
            document.getElementById('modal-danger').onclick = async () => {
                if (!confirm(danger.confirm)) return;
                await danger.run();
                close();
            };
        }

        const form = document.getElementById('modal-form');
        form.onsubmit = async (e) => {
            e.preventDefault();
            if (!onSubmit) return;
            const save = document.getElementById('modal-save');
            save.disabled = true;
            save.textContent = 'Saving…';
            try {
                await onSubmit(new FormData(form));
                close();
            } catch (err) {
                toast(err.message || 'Could not save. Try again.', 'bad');
                save.disabled = false;
                save.textContent = submitLabel;
            }
        };

        // Focus the first field so the modal is immediately typeable.
        form.querySelector('input:not([type=hidden]), select, textarea')?.focus();
        return close;
    },

    /* ---------- Form field builders ------------------------- */

    field(name, label, { type = 'text', value = '', hint = '', required = false, placeholder = '' } = {}) {
        return `<div class="field">
                    <label for="f-${name}">${esc(label)}</label>
                    <input id="f-${name}" name="${name}" type="${type}" value="${escAttr(value)}"
                           placeholder="${escAttr(placeholder)}" ${required ? 'required' : ''}>
                    ${hint ? `<p class="field-hint">${esc(hint)}</p>` : ''}
                </div>`;
    },

    textarea(name, label, { value = '', hint = '', placeholder = '' } = {}) {
        return `<div class="field">
                    <label for="f-${name}">${esc(label)}</label>
                    <textarea id="f-${name}" name="${name}" placeholder="${escAttr(placeholder)}">${esc(value)}</textarea>
                    ${hint ? `<p class="field-hint">${esc(hint)}</p>` : ''}
                </div>`;
    },

    select(name, label, options, { value = '', hint = '', required = false } = {}) {
        return `<div class="field">
                    <label for="f-${name}">${esc(label)}</label>
                    <select id="f-${name}" name="${name}" ${required ? 'required' : ''}>
                        ${options.map(o => `<option value="${escAttr(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                    </select>
                    ${hint ? `<p class="field-hint">${esc(hint)}</p>` : ''}
                </div>`;
    },

    /** Options for the person picker, including interns where allowed. */
    peopleOptions({ includeIntern = true, includeUnassigned = false } = {}) {
        const opts = CONFIG.team.map(m => ({ value: m.key, label: m.name }));
        // The old shared intern login: offered only while it still owns work,
        // so an edit never silently reassigns that work to someone else.
        if (includeIntern && store.workItems.some(w => w.owner_name === CONFIG.internKey)) {
            opts.push({ value: CONFIG.internKey, label: 'Intern (old shared login)' });
        }
        if (includeUnassigned) opts.unshift({ value: '', label: 'Unassigned' });
        return opts;
    },

    statusOptions() {
        return Object.entries(VOCAB.status).map(([value, label]) => ({ value, label }));
    }
};

/* ---------- Toast ------------------------------------------ */

/**
 * Confirms an action in the same words the button used. Errors say what
 * happened and what to do; they don't apologise.
 */
function toast(message, tone = '') {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `toast ${tone ? 't-' + tone : ''}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), tone === 'bad' ? 5000 : 2600);
}
