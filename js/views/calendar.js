/**
 * Calendar: the month, the way a calendar looks.
 *
 * One cell per day, Monday to Sunday, with what is due that day and what
 * was finished. Finished work is the record, so it stays on the day it
 * was actually finished, not the day it was logged.
 *
 * The earlier build stacked weeks as columns per person. It answered a
 * different question ("what did each person ship"), which the Work log
 * now answers properly.
 */

const calendarView = {
    month: null,           // 'YYYY-MM'
    person: 'all',

    render() {
        const body = document.getElementById('calendar-body');
        if (!this.month) this.month = dates.today().slice(0, 7);

        const [y, m] = this.month.split('-').map(Number);
        const days = dates.monthDays(y, m);
        const items = this.itemsFor(days[0], days[days.length - 1]);

        body.innerHTML = `
            ${this.controls()}
            ${this.grid(days, items)}`;

        this.wire();
    },

    /* ---------- What goes on the calendar -------------------- */

    /**
     * Every work item that touches this month, as one entry per date:
     * the day it was finished, or the day it is due.
     */
    itemsFor(from, to) {
        const out = [];
        for (const w of store.visibleWork()) {
            if (this.person !== 'all' && w.owner_name !== this.person) continue;
            if (['carried', 'dropped'].includes(w.status)) continue;

            if (w.status === 'done' && w.completed_at) {
                const on = dates.iso(w.completed_at);
                if (on >= from && on <= to) out.push({ on, kind: 'done', w });
            } else if (w.due_date && w.due_date >= from && w.due_date <= to) {
                out.push({ on: w.due_date, kind: w.due_date < dates.today() ? 'late' : 'due', w });
            }
        }
        return out;
    },

    controls() {
        const [y, m] = this.month.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        const people = [{ value: 'all', label: 'Everyone' }].concat(
            CONFIG.team.map(t => ({ value: t.key, label: t.name })));

        return `<div class="bar">
            <div class="stepper">
                <button class="btn btn-sm btn-quiet" data-month="-1" aria-label="Previous month">&#8249;</button>
                <span class="stepper-now num">${esc(label)}</span>
                <button class="btn btn-sm btn-quiet" data-month="1" aria-label="Next month">&#8250;</button>
            </div>
            ${this.month === dates.today().slice(0, 7) ? '' : `<button class="btn btn-sm" data-month="0">Today</button>`}
            ${auth.isAdmin || auth.isLeader ? `<select id="cal-person" aria-label="Whose work">
                ${people.map(p => `<option value="${escAttr(p.value)}" ${this.person === p.value ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}
            </select>` : ''}
            <span class="meta">Green is finished, amber is due, red is past its date.</span>
        </div>`;
    },

    /* ---------- The grid ------------------------------------- */

    grid(days, items) {
        const first = days[0];
        const lead = (dates.weekday(first) + 6) % 7;         // Monday-first offset
        const cells = [];

        for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell is-outside"></div>');
        for (const iso of days) cells.push(this.cell(iso, items.filter(i => i.on === iso)));
        while (cells.length % 7 !== 0) cells.push('<div class="cal-cell is-outside"></div>');

        const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        return `<div class="block">
            <div class="cal-head">${names.map(n => `<div>${n}</div>`).join('')}</div>
            <div class="cal-grid">${cells.join('')}</div>
        </div>`;
    },

    cell(iso, entries) {
        const today = iso === dates.today();
        const sunday = dates.weekday(iso) === 0;
        const shown = entries.slice(0, 3);

        return `<div class="cal-cell ${today ? 'is-today' : ''} ${sunday ? 'is-off' : ''}" data-day="${iso}">
            <div class="cal-date num">${+iso.slice(8)}</div>
            ${shown.map(e => `
                <div class="cal-chip t-${e.kind}" title="${escAttr(e.w.title)}">
                    <span class="cal-dot" style="--who-color:${personColor(e.w.owner_name)}"></span>
                    ${esc(e.w.title)}
                </div>`).join('')}
            ${entries.length > shown.length
                ? `<button class="cal-more" data-open="${iso}">${entries.length - shown.length} more</button>` : ''}
        </div>`;
    },

    /* ---------- Interaction ---------------------------------- */

    wire() {
        const view = document.getElementById('view-calendar');

        view.querySelectorAll('[data-month]').forEach(btn =>
            btn.addEventListener('click', () => {
                const step = parseInt(btn.dataset.month, 10);
                if (step === 0) { this.month = dates.today().slice(0, 7); }
                else {
                    const [y, m] = this.month.split('-').map(Number);
                    this.month = new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 7);
                }
                this.render();
            }));

        document.getElementById('cal-person')?.addEventListener('change', (e) => {
            this.person = e.target.value;
            this.render();
        });

        view.querySelectorAll('[data-day]').forEach(cell =>
            cell.addEventListener('click', () => this.openDay(cell.dataset.day)));
    },

    openDay(iso) {
        const entries = this.itemsFor(iso, iso);
        if (!entries.length) return;

        ui.modal({
            title: dates.long(iso),
            wide: true,
            body: `<div class="list">${entries.map(e => ui.taskRow(e.w, { when: e.kind === 'done' ? 'done' : 'due' })).join('')}</div>`
        });
    }
};
