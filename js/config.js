/**
 * Supabase Configuration
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://supabase.com and create an account
 * 2. Create a new project
 * 3. Go to Project Settings > API
 * 4. Copy your "Project URL" and paste it below as SUPABASE_URL
 * 5. Copy your "anon/public" key and paste it below as SUPABASE_ANON_KEY
 */

// Supabase project credentials
const SUPABASE_URL = 'https://glheaimbqdjgpufsclrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsaGVhaW1icWRqZ3B1ZnNjbHJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTU5MjIsImV4cCI6MjA4OTY3MTkyMn0.DJoKsXfYQtoWbro7RBJbenD0ozptBUkfwkuGIUJok4k';

// ============================================================
// App configuration — Year 2 (CY2026) KRA framework
// ============================================================
const APP_CONFIG = {
    quarter: 'Q1 Year 2 (Apr-Jun 2026)',
    framework: 'Year 2 — 5 KRAs × 10 KPIs per member',

    // Team members (matches `member` enum in kpis + owner_name in actions)
    team: [
        { id: 'kavya',  name: 'Kavya',  role: 'Head of Growth & Ops', color: '#2563eb' },
        { id: 'ishita', name: 'Ishita', role: 'Writer, CFA L1',       color: '#7c3aed' },
        { id: 'riya',   name: 'Riya',   role: 'Executor',             color: '#16a34a' }
    ],

    // 5 Key Result Areas (matches kra_code in DB)
    kras: {
        kra1: { name: 'Data Hygiene, Database Mgmt & Reporting',        short: 'Data Hygiene',  order: 1 },
        kra2: { name: 'Lead Flow Automation & Funnel Optimization',     short: 'Lead Flow',     order: 2 },
        kra3: { name: 'Event Operationalisation & Execution',           short: 'Events',        order: 3 },
        kra4: { name: 'Growth Initiatives, New Projects & Distribution',short: 'Growth',        order: 4 },
        kra5: { name: 'Cross-Team Coordination, Stakeholder Mgmt',      short: 'Coordination',  order: 5 }
    },

    // KPI rubric scale (1-5)
    rubricScale: { min: 1, max: 5, target: 4 },

    // Months tracked in Q1
    quarterMonths: [
        { num: 4, short: 'Apr', full: 'April'  },
        { num: 5, short: 'May', full: 'May'    },
        { num: 6, short: 'Jun', full: 'June'   }
    ]
};

// Color lookup by member id
const MEMBER_COLORS = {
    kavya:  '#2563eb',
    ishita: '#7c3aed',
    riya:   '#16a34a'
};

// Helper: KRA short name from code
function kraShort(kraCode) {
    return APP_CONFIG.kras[kraCode]?.short || kraCode;
}

// Helper: member display name from id
function memberName(memberId) {
    const m = APP_CONFIG.team.find(t => t.id === memberId);
    return m ? m.name : memberId;
}
