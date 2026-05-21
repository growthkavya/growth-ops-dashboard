// Supabase project (same as Kavya's main Growth Ops dashboard).
// Anon key is safe in client; RLS enforces row-level access.
const SUPABASE_URL = 'https://glheaimbqdjgpufsclrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsaGVhaW1icWRqZ3B1ZnNjbHJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTU5MjIsImV4cCI6MjA4OTY3MTkyMn0.DJoKsXfYQtoWbro7RBJbenD0ozptBUkfwkuGIUJok4k';

const APP_CONFIG = {
  name: 'Growth Lab Dashboard',
  cohort: 'Cohort 1 — May 2026',
  workingHoursPerDay: 6,
  workingDaysPerWeek: 6,
  teams: {
    'Growth Ops':        { rm: 'kavya',      rmName: 'Kavya' },
    'Performance':       { rm: 'saloni',     rmName: 'Saloni' },
    'Organic':           { rm: 'shubhankar', rmName: 'Shubhankar' },
    'Product & Content': { rm: 'chirag',     rmName: 'Chirag' },
  },
};

// Map tag (in interns.tags) → display vertical name
const TAG_TO_VERTICAL = {
  growth_ops: 'Growth Ops',
  performance: 'Performance',
  organic: 'Organic',
  product_content: 'Product & Content',
};
