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

// App configuration
const APP_CONFIG = {
    quarter: 'Q2 2026',
    layers: {
        1: { name: 'Infrastructure', weeks: '1-6', focus: 'Fix the Leaky Bucket' },
        2: { name: 'Operating System', weeks: '7-12', focus: 'Build Team Enablement' },
        3: { name: 'Growth', weeks: '13-20', focus: 'Scale What Works' }
    }
};
