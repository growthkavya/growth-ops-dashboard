-- Growth & Ops Team Workspace - Seed Data
-- Run this AFTER schema.sql to populate initial data

-- ============================================
-- KPIs (6 KPIs from your tracker)
-- ============================================
INSERT INTO public.kpis (id, name, description, weight, target) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Systems & Automation', 'Building automated workflows, reducing manual work', 20, 4.0),
    ('22222222-2222-2222-2222-222222222222', 'Funnel Integrity', 'Zero broken campaigns, clean lead flow', 20, 4.0),
    ('33333333-3333-3333-3333-333333333333', 'Data Hygiene', 'Clean CRM data, accurate attribution', 15, 4.0),
    ('44444444-4444-4444-4444-444444444444', 'Cross-Team Enablement', 'SOPs, training, team alignment', 20, 4.0),
    ('55555555-5555-5555-5555-555555555555', 'Stakeholder Mgmt', 'Leadership communication, vendor management', 15, 4.0),
    ('66666666-6666-6666-6666-666666666666', 'Growth Initiatives', 'New programs, scaling what works', 20, 4.0);

-- ============================================
-- ACTIONS (24 Priority Actions)
-- ============================================

-- Layer 1: Infrastructure (10 actions)
INSERT INTO public.actions (action_id, title, layer, status, kpi_id, notes) VALUES
    ('1.1', 'Export LeadSquared data for audit', 1, 'not_started', '33333333-3333-3333-3333-333333333333', ''),
    ('1.2', 'Run data quality analysis (duplicates, missing sources)', 1, 'not_started', '33333333-3333-3333-3333-333333333333', ''),
    ('1.3', 'Document current state metrics', 1, 'not_started', '33333333-3333-3333-3333-333333333333', ''),
    ('1.4', 'Create source mapping table', 1, 'not_started', '33333333-3333-3333-3333-333333333333', ''),
    ('1.5', 'Bulk update source values in LSQ', 1, 'not_started', '33333333-3333-3333-3333-333333333333', ''),
    ('1.6', 'Enable LSQ deduplication rules', 1, 'not_started', '33333333-3333-3333-3333-333333333333', ''),
    ('1.7', 'Configure mandatory field validation on forms', 1, 'not_started', '22222222-2222-2222-2222-222222222222', ''),
    ('1.8', 'Implement first-touch UTM preservation', 1, 'not_started', '11111111-1111-1111-1111-111111111111', ''),
    ('1.9', 'Clean duplicate records', 1, 'not_started', '33333333-3333-3333-3333-333333333333', ''),
    ('1.10', 'Create counsellor capacity visibility', 1, 'not_started', '44444444-4444-4444-4444-444444444444', '');

-- Layer 2: Operating System (8 actions)
INSERT INTO public.actions (action_id, title, layer, status, kpi_id, notes) VALUES
    ('2.1', 'Implement Campaign Launch QA Checklist', 2, 'not_started', '22222222-2222-2222-2222-222222222222', ''),
    ('2.2', 'Establish Monday Marketing-Sales sync', 2, 'not_started', '44444444-4444-4444-4444-444444444444', ''),
    ('2.3', 'Create GTM template for campaigns', 2, 'not_started', '22222222-2222-2222-2222-222222222222', ''),
    ('2.4', 'Build basic nurturing automation (3 email + 2 WA)', 2, 'not_started', '11111111-1111-1111-1111-111111111111', ''),
    ('2.5', 'Create weekly metrics dashboard', 2, 'not_started', '44444444-4444-4444-4444-444444444444', ''),
    ('2.6', 'Document top 5 SOPs', 2, 'not_started', '44444444-4444-4444-4444-444444444444', ''),
    ('2.7', 'Establish weekly operating rhythm', 2, 'not_started', '44444444-4444-4444-4444-444444444444', ''),
    ('2.8', 'Train team on new processes', 2, 'not_started', '44444444-4444-4444-4444-444444444444', '');

-- Layer 3: Growth (6 actions)
INSERT INTO public.actions (action_id, title, layer, status, kpi_id, notes) VALUES
    ('3.1', 'Analyst Stack Cohort 2 GTM', 3, 'not_started', '66666666-6666-6666-6666-666666666666', ''),
    ('3.2', 'Scholarship Exam operations (25k target)', 3, 'not_started', '66666666-6666-6666-6666-666666666666', ''),
    ('3.3', 'Alumni engagement pilot (50 active)', 3, 'not_started', '66666666-6666-6666-6666-666666666666', ''),
    ('3.4', 'Content distribution system design', 3, 'not_started', '66666666-6666-6666-6666-666666666666', ''),
    ('3.5', 'Student/Alumni page activation', 3, 'not_started', '66666666-6666-6666-6666-666666666666', ''),
    ('3.6', 'Referral program pilot', 3, 'not_started', '66666666-6666-6666-6666-666666666666', '');

-- ============================================
-- DOCUMENTS (SOPs and References)
-- ============================================
INSERT INTO public.documents (name, type, url, description) VALUES
    ('Campaign Launch QA Checklist', 'sop', '/output/sops/Campaign_Launch_QA_Checklist.pdf', 'Pre-launch verification checklist for campaigns'),
    ('UTM Tracking Framework', 'sop', '/output/sops/UTM_Tracking_Framework.pdf', 'UTM parameter standards and implementation'),
    ('Data Cleaning Plan', 'sop', '/output/sops/Data_Cleaning_Plan.pdf', 'CRM data hygiene procedures'),
    ('Weekly Operating Rhythm', 'sop', '/output/sops/Weekly_Operating_Rhythm.pdf', 'Weekly team sync and reporting cadence'),
    ('SSEI Growth Ops Context', 'reference', '/output/SSEI_Growth_Ops_Context.pdf', 'Complete context document for Growth & Ops role'),
    ('Priority Action Tracker', 'reference', '/output/trackers/Priority_Action_Tracker.pdf', 'Q2 2026 priority actions with KPI mapping');

-- ============================================
-- GOALS (Q2 2026 Goals)
-- ============================================

-- Yearly Goal
INSERT INTO public.goals (id, type, title, description, status) VALUES
    ('aaaa0000-0000-0000-0000-000000000001', 'year', 'FY 2026-27 Growth & Ops Excellence', 'Build robust growth operations infrastructure at SSEI', 'in_progress');

-- Q2 Goal
INSERT INTO public.goals (id, type, title, description, parent_id, status) VALUES
    ('aaaa0000-0000-0000-0000-000000000002', 'quarter', 'Q2 2026: Fix Foundation, Build OS, Scale', 'Fix foundation, build operating system, then scale', 'aaaa0000-0000-0000-0000-000000000001', 'in_progress');

-- Layer Goals (as monthly goals)
INSERT INTO public.goals (id, type, title, description, parent_id, status) VALUES
    ('aaaa0000-0000-0000-0000-000000000003', 'month', 'Layer 1: Fix the Leaky Bucket', 'Weeks 1-6: Infrastructure - Data hygiene, UTM tracking, deduplication', 'aaaa0000-0000-0000-0000-000000000002', 'in_progress'),
    ('aaaa0000-0000-0000-0000-000000000004', 'month', 'Layer 2: Build Team Enablement', 'Weeks 7-12: Operating System - SOPs, automation, team processes', 'aaaa0000-0000-0000-0000-000000000002', 'not_started'),
    ('aaaa0000-0000-0000-0000-000000000005', 'month', 'Layer 3: Scale What Works', 'Weeks 13-20: Growth - Analyst Stack, Scholarship Exam, Alumni', 'aaaa0000-0000-0000-0000-000000000002', 'not_started');

-- ============================================
-- INITIAL WEEKLY LOG
-- ============================================
INSERT INTO public.weekly_logs (week_number, year, focus, summary) VALUES
    (1, 2026, 'Layer 1 Kickoff - Data Audit', 'Starting Q2 with LeadSquared data export and initial quality analysis');

INSERT INTO public.daily_entries (weekly_log_id, day, completed, blockers, notes)
SELECT id, 'mon', ARRAY[]::text[], ARRAY[]::text[], '' FROM public.weekly_logs WHERE week_number = 1 AND year = 2026;

INSERT INTO public.daily_entries (weekly_log_id, day, completed, blockers, notes)
SELECT id, 'tue', ARRAY[]::text[], ARRAY[]::text[], '' FROM public.weekly_logs WHERE week_number = 1 AND year = 2026;

INSERT INTO public.daily_entries (weekly_log_id, day, completed, blockers, notes)
SELECT id, 'wed', ARRAY[]::text[], ARRAY[]::text[], '' FROM public.weekly_logs WHERE week_number = 1 AND year = 2026;

INSERT INTO public.daily_entries (weekly_log_id, day, completed, blockers, notes)
SELECT id, 'thu', ARRAY[]::text[], ARRAY[]::text[], '' FROM public.weekly_logs WHERE week_number = 1 AND year = 2026;

INSERT INTO public.daily_entries (weekly_log_id, day, completed, blockers, notes)
SELECT id, 'fri', ARRAY[]::text[], ARRAY[]::text[], '' FROM public.weekly_logs WHERE week_number = 1 AND year = 2026;
