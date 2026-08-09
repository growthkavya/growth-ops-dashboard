/**
 * Calendar — what actually got done, week by week.
 *
 * Delegations answers "what is open now". This answers "what did we
 * ship, and when" — the retrospective question you need for a 1:1, a
 * monthly review, or a conversation with Sir about where the team's
 * time went. Different question, so its own tab.
 *
 * Weeks run Monday to Sunday. An item lands in the week it was
 * finished (completed_at), not the week it was created — otherwise a
 * task that sat open for a month would credit the wrong week.
 *
 * Riya sees her own weeks; RLS on `actions` does that filtering
 * server-side, so this view doesn't need to know about roles.
 */

const calendarView = {
    weeksBack: 8,

    render() {
        const body = document.getElementById('calendar-body');
        const weeks = this.buildWeeks();

        const finishedTotal = weeks.reduce((n, w) => n + w.total, 0);
        document.getElementById('calendar-figure').textContent = finishedTotal;
        document.getElementById('calendar-figure-label').textContent =
            `Finished · ${this.weeksBack} weeks`;

        body.innerHTML = `
            ${this.throughputStrip(weeks)}
            ${weeks.map((w, i) => this.weekBlock(w, i === 0)).join('')}
            ${this.moreButton()}`;

        this.wire();
    },

    /* ---------- Week maths ---------------------------------- */

    /** Monday of the week containing `date`. */
    mondayOf(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const shift = (d.getDay() + 6) % 7;   // Sunday = 6, Monday = 0
        d.setDate(d.getDate() - shift);
        return d;
    },

    /** The date an item counts against. */
    finishedOn(item) {
        return (item.completed_at || item.updated_at || '').slice(0, 10);
    },

    /**
     * People to show as columns. Computed once across the whole visible
     * range, not per week — so a person keeps the same column position in
     * every week block and you can read straight down. A column that
     * varies by week makes the weeks impossible to compare.
     *
     * The team is always shown. Anyone else (interns) appears only if they
     * finished something in the range at all, so a quiet intern doesn't
     * add an empty column to every week forever.
     */
    columns(from) {
        const ordered = CONFIG.team.map(m => m.key);
        const extras = new Set();

        store.workItems.forEach(w => {
            if (!w.owner_name || ordered.includes(w.owner_name)) return;
            const on = this.finishedOn(w);
            if (w.status === 'done' && on >= from) extras.add(w.owner_name);
            else if (w.status !== 'done' && w.due_date && w.due_date >= from) extras.add(w.owner_name);
        });

        return ordered.concat([...extras]);
    },

    buildWeeks() {
        const thisMonday = this.mondayOf(new Date());

        // Earliest Monday in view, so the column set covers the whole range.
        const first = new Date(thisMonday);
        first.setDate(first.getDate() - (this.weeksBack - 1) * 7);
        const people = this.columns(first.toISOString().slice(0, 10));

        const weeks = [];

        for (let i = 0; i < this.weeksBack; i++) {
            const start = new Date(thisMonday);
            start.setDate(start.getDate() - i * 7);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);

            const from = start.toISOString().slice(0, 10);
            const to   = end.toISOString().slice(0, 10);

            const done = store.workItems.filter(w => {
                if (w.status !== 'done') return false;
                const on = this.finishedOn(w);
                return on >= from && on <= to;
            });

            // For the current week, also surface what is still outstanding.
            const open = i === 0
                ? store.workItems.filter(w =>
                    w.status !== 'done' && w.due_date && w.due_date >= from && w.due_date <= to)
                : [];

            weeks.push({
                start, end, from, to,
                isCurrent: i === 0,
                total: done.length,
                hours: done.reduce((h, w) => h + (parseFloat(w.hours_spent) || 0), 0),
                byPerson: people.map(key => ({
                    key,
                    name: personName(key),
                    done: done.filter(w => w.owner_name === key),
                    open: open.filter(w => w.owner_name === key)
                }))
            });
        }

        return weeks;
    },

    /* ---------- Throughput ---------------------------------- */

    /**
     * Twelve weeks of output at a glance. Bars are relative to the best
     * week in view, so this reads as a trend, not an absolute target —
     * there is no "correct" number of tasks per week.
     */
    throughputStrip(weeks) {
        const peak = Math.max(1, ...weeks.map(w => w.total));
        const bars = [...weeks].reverse();

        return `<div class="block">
            <div class="block-head">
                <h3 class="h-block">Output by week</h3>
                <span class="eyebrow">Relative to the busiest week shown</span>
            </div>
            <div class="block-body">
                <div class="spark">
                    ${bars.map(w => `
                        <div class="spark-col" title="${esc(this.rangeLabel(w))} · ${w.total} finished">
                            <div class="spark-bar ${w.isCurrent ? 'now' : ''}"
                                 style="height:${Math.max(3, (w.total / peak) * 100)}%"></div>
                            <span class="spark-n num">${w.total}</span>
                            <span class="spark-lbl num">${w.start.getDate()}/${w.start.getMonth() + 1}</span>
                        </div>`).join('')}
                </div>
            </div>
        </div>`;
    },

    rangeLabel(w) {
        const sameMonth = w.start.getMonth() === w.end.getMonth();
        const s = w.start.toLocaleDateString('en-IN', { day: 'numeric', month: sameMonth ? undefined : 'short' });
        const e = w.end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        return `${s}–${e}`;
    },

    /* ---------- A week -------------------------------------- */

    weekBlock(w, isFirst) {
        const heading = w.isCurrent
            ? 'This week'
            : `Week of ${w.start.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`;

        return `<section class="block week ${w.isCurrent ? 'week-now' : ''}">
            <div class="block-head">
                <div>
                    <h3 class="h-block">${esc(heading)}</h3>
                    <span class="eyebrow">${esc(this.rangeLabel(w))}</span>
                </div>
                <div style="display:flex;align-items:center;gap:var(--s4)">
                    <span class="meta">
                        <strong class="num">${w.total}</strong> finished${w.hours > 0 ? ` · <strong class="num">${w.hours.toFixed(1)}h</strong> logged` : ''}
                    </span>
                    ${isFirst ? `<button class="btn btn-sm" id="cal-print">Print</button>` : ''}
                </div>
            </div>

            ${w.total === 0 && !w.byPerson.some(c => c.open.length)
                ? `<div class="block-body"><p class="meta">Nothing finished this week.</p></div>`
                : `<div class="week-grid" style="grid-template-columns:repeat(${w.byPerson.length}, minmax(0,1fr))">
                    ${w.byPerson.map(c => this.personColumn(c, w.isCurrent)).join('')}
                   </div>`}
        </section>`;
    },

    personColumn(col, isCurrent) {
        return `<div class="week-col">
            <div class="week-col-head">
                <span class="who" style="--who-color:${personColor(col.key)}">${esc(col.name)}</span>
                <span class="num meta">${col.done.length}</span>
            </div>

            ${col.done.length === 0
                ? `<p class="meta week-none">—</p>`
                : `<ul class="week-list">
                    ${col.done.map(w => `
                        <li>
                            <span class="week-tick">&#10003;</span>
                            <span>
                                ${w.output_link
                                    ? `<a href="${escAttr(w.output_link)}" target="_blank" rel="noopener">${esc(w.title)}</a>`
                                    : esc(w.title)}
                                ${w.hours_spent ? `<span class="num meta"> ${parseFloat(w.hours_spent).toFixed(1)}h</span>` : ''}
                                ${w.kras?.short_name ? `<span class="meta"> · ${esc(w.kras.short_name)}</span>` : ''}
                            </span>
                        </li>`).join('')}
                   </ul>`}

            ${isCurrent && col.open.length ? `
                <div class="week-open">
                    <span class="eyebrow">Still due this week</span>
                    <ul class="week-list">
                        ${col.open.map(w => `
                            <li>
                                <span class="week-tick week-tick-open ${w.status === 'blocked' ? 'is-blocked' : ''}">&#9675;</span>
                                <span class="muted">${esc(w.title)}${w.status === 'blocked' ? ' — blocked' : ''}</span>
                            </li>`).join('')}
                    </ul>
                </div>` : ''}
        </div>`;
    },

    moreButton() {
        if (this.weeksBack >= 26) {
            return `<p class="meta" style="text-align:center;padding:var(--s4)">
                        Showing six months. Older work is still in Delegations under “Everything”.
                    </p>`;
        }
        return `<div style="text-align:center;padding:var(--s4)">
                    <button class="btn" id="cal-more">Show ${this.weeksBack >= 16 ? '10' : '8'} more weeks</button>
                </div>`;
    },

    wire() {
        document.getElementById('cal-more')?.addEventListener('click', () => {
            this.weeksBack = Math.min(26, this.weeksBack + (this.weeksBack >= 16 ? 10 : 8));
            this.render();
        });
        document.getElementById('cal-print')?.addEventListener('click', () => window.print());
    }
};
