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

const CONFIG = {
    // Current review period. Update these two lines each quarter —
    // everything that says "this quarter" reads from here.
    year: 2026,
    quarter: 3,
    quarterLabel: 'Jul–Sep 2026',
    yearLabel: 'Year 2 · CY2026',

    // KPI scoring runs 1–5. 4 is the target, and the target is what
    // the notch on every measure bar points at.
    scoreMin: 1,
    scoreMax: 5,
    scoreTarget: 4,

    // Team. `key` matches actions.owner_name and kpis.member.
    team: [
        { key: 'kavya', name: 'Kavya', role: 'Head of Growth & Ops', color: 'var(--p-kavya)' },
        { key: 'riya',  name: 'Riya',  role: 'Executor',             color: 'var(--p-riya)'  }
    ],

    // Interns share one login; `intern1` is the owner_name they write under.
    internKey: 'intern1',

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
