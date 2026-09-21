/**
 * Configuration and vocabulary.
 *
 * VOCABULARY lives here on purpose. Every user-facing word in the app
 * is resolved through it, so the interface says one thing for one
 * concept everywhere — the button that says "Mark done" produces a
 * toast that says "Marked done", and a status never appears as
 * "in_progress" in one place and "In flight" in another.
 */

const SUPABASE_URL = 'https://glheaimbqdjgpufsclrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsaGVhaW1icWRqZ3B1ZnNjbHJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTU5MjIsImV4cCI6MjA4OTY3MTkyMn0.DJoKsXfYQtoWbro7RBJbenD0ozptBUkfwkuGIUJok4k';

/**
 * The review period follows the calendar, so nobody has to remember to
 * change it on the first of a quarter.
 */
const PERIOD = (() => {
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const first = new Date(year, (quarter - 1) * 3, 1);
    const last  = new Date(year, quarter * 3 - 1, 1);
    const mon = (d) => d.toLocaleDateString('en-IN', { month: 'short' });
    return { year, quarter, label: `${mon(first)} to ${mon(last)} ${year}` };
})();

const CONFIG = {
    year: PERIOD.year,
    quarter: PERIOD.quarter,
    quarterLabel: PERIOD.label,
    yearLabel: `CY${PERIOD.year}`,

    // KPI scoring runs 1–5. 4 is the target, and the target is what
    // the notch on every measure bar points at.
    scoreMin: 1,
    scoreMax: 5,
    scoreTarget: 4,

    // Team. `key` matches actions.owner_name, kpis.member and
    // profiles.member_key. `level` decides what a person can see:
    // interns see their own tasks and attendance, nothing else.
    team: [
        { key: 'kavya',  name: 'Kavya',  role: 'AI & Growth Ops Manager', level: 'manager',   color: 'var(--p-kavya)'  },
        { key: 'riya',   name: 'Riya',   role: 'Growth & Ops Associate',  level: 'associate', color: 'var(--p-riya)'   },
        { key: 'palak',  name: 'Palak',  role: 'Intern',                  level: 'intern',    color: 'var(--p-palak)'  },
        { key: 'rupam',  name: 'Rupam',  role: 'Intern',                  level: 'intern',    color: 'var(--p-rupam)'  }
    ],

    // Palak and Rupam share one login (intern1@ssei.co.in). Which of them
    // is using it is asked at sign-in and kept for the browser session;
    // the keys themselves come from profiles.seat_keys.
    seatPrompt: 'Who is signing in?',

    // The old shared intern login still owns some history under this key.
    internKey: 'intern1',

    // Office hours from the employment letters: Monday to Saturday,
    // 10:30 to 19:30, in office. Late and short days are flagged, not
    // blocked: the record is for a conversation, not a penalty.
    office: {
        start: '10:30',
        end: '19:30',
        fullDayHours: 9,
        workDays: [1, 2, 3, 4, 5, 6],   // Mon..Sat (0 = Sunday)
        timeZone: 'Asia/Kolkata',
        // First day attendance was kept here. Days before it are blank,
        // not "nothing recorded".
        trackingFrom: '2026-09-21'
    },

    growthLabUrl: 'lab/'
};

/**
 * Every user-facing label. Nothing outside this object should contain
 * a raw database value shown to a person.
 */
const VOCAB = {
    status: {
        not_started: 'Not started',
        in_progress: 'In progress',
        blocked:     'Blocked',
        done:        'Done'
    },

    // Clicking a status advances it along this path.
    statusCycle: ['not_started', 'in_progress', 'done'],

    statusTone: {
        not_started: 'idle',
        in_progress: 'accent',
        blocked:     'bad',
        done:        'good'
    },

    docStatus: {
        current:      'Current',
        needs_review: 'Needs review',
        draft:        'Draft',
        retired:      'Retired'
    },

    docType: {
        sop:       'Process',
        reference: 'Reference',
        report:    'Report',
        data:      'Data'
    },

    // Google Sheets are grouped by the part of the business they serve.
    vertical: {
        growth:    'Growth',
        sales:     'Sales',
        academics: 'Academics',
        tech:      'Tech',
        hiring:    'Hiring',
        finance:   'Finance',
        other:     'Other'
    },

    goalScope: {
        company: 'Company goal',
        team:    'Team goal'
    },

    role: {
        admin:  'Admin',
        member: 'Team',
        intern: 'Intern'
    },

    attendance: {
        present:      'Present',
        wfh:          'Working from home',
        half_day:     'Half day',
        casual_leave: 'Casual leave',
        sick_leave:   'Sick leave',
        absent:       'Absent',
        holiday:      'Holiday'
    },

    // Short forms for the month register, one or two letters per day.
    attendanceMark: {
        present: 'P', wfh: 'WH', half_day: 'HD', casual_leave: 'CL',
        sick_leave: 'SL', absent: 'A', holiday: 'H'
    },

    health: {
        on_track:  'On track',
        at_risk:   'At risk',
        off_track: 'Off track'
    },

    healthTone: {
        on_track: 'good',
        at_risk: 'warn',
        off_track: 'bad'
    },

    period: {
        week:  'Weekly update',
        month: 'Monthly summary'
    }
};

/** Display name for a person key. */
function personName(key) {
    if (!key) return 'Unassigned';
    if (key === CONFIG.internKey) return 'Intern';
    const m = CONFIG.team.find(t => t.key === key);
    return m ? m.name : key;
}

/** Identity colour for a person key. Identity, never status. */
function personColor(key) {
    if (key === CONFIG.internKey) return 'var(--p-intern)';
    const m = CONFIG.team.find(t => t.key === key);
    return m ? m.color : 'var(--idle)';
}

/** Initials for the avatar mark. */
function personInitials(name) {
    return String(name || '?')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(w => w[0])
        .join('')
        .toUpperCase();
}
