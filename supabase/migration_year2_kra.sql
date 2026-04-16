-- ================================================================
-- Year 2 (CY2026) Migration: Restructure from flat 6 KPIs + Layer 1/2/3
-- to 5 KRAs + per-member KPIs (Kavya, Ishita, Riya)
--
-- Run this ONCE in Supabase SQL Editor after the original schema.sql
-- and migration_teams.sql are already in place.
--
-- WARNING: This wipes existing kpis, kpi_scores, and actions data
-- and reseeds with the Year 2 framework. Back up first if needed.
-- ================================================================


-- ================================================================
-- 1. KRAS TABLE (5 Key Result Areas)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.kras (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    kra_code text UNIQUE NOT NULL,          -- 'kra1'..'kra5'
    name text NOT NULL,
    short_name text NOT NULL,
    sort_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.kras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "KRAs viewable by authenticated users" ON public.kras;
CREATE POLICY "KRAs viewable by authenticated users"
    ON public.kras FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "KRAs modifiable by authenticated users" ON public.kras;
CREATE POLICY "KRAs modifiable by authenticated users"
    ON public.kras FOR ALL
    USING (auth.role() = 'authenticated');


-- ================================================================
-- 2. EXTEND KPIS TABLE: add KRA link, member, definition, measure, rubric
-- ================================================================
ALTER TABLE public.kpis
    ADD COLUMN IF NOT EXISTS kra_id uuid REFERENCES public.kras(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS kpi_code text,                              -- 'k_1_1', 'i_2_1', 'r_3_2'
    ADD COLUMN IF NOT EXISTS member text CHECK (member IN ('kavya','ishita','riya')),
    ADD COLUMN IF NOT EXISTS definition text,
    ADD COLUMN IF NOT EXISTS measure text,
    ADD COLUMN IF NOT EXISTS rubric jsonb,                               -- array of 5 strings
    ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Allow target to be 0-5 (was 0-4)
ALTER TABLE public.kpis
    ALTER COLUMN target TYPE numeric(3,1);

CREATE INDEX IF NOT EXISTS kpis_kra_member_idx ON public.kpis (kra_id, member);


-- ================================================================
-- 3. EXTEND ACTIONS TABLE: add KRA link, owner name, KPI code, make layer nullable
-- ================================================================
-- Drop old layer check constraint if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'actions_layer_check') THEN
        ALTER TABLE public.actions DROP CONSTRAINT actions_layer_check;
    END IF;
END $$;

ALTER TABLE public.actions
    ALTER COLUMN layer DROP NOT NULL;

ALTER TABLE public.actions
    ADD COLUMN IF NOT EXISTS kra_id uuid REFERENCES public.kras(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS owner_name text CHECK (owner_name IN ('kavya','ishita','riya')),
    ADD COLUMN IF NOT EXISTS kpi_code text;

CREATE INDEX IF NOT EXISTS actions_kra_owner_idx ON public.actions (kra_id, owner_name);


-- ================================================================
-- 4. CLEAR EXISTING YEAR 1 DATA (kpi_scores must go first due to FK)
-- ================================================================
TRUNCATE public.kpi_scores CASCADE;
TRUNCATE public.kpis CASCADE;
DELETE FROM public.actions;


-- ================================================================
-- 5. SEED: 5 KRAS
-- ================================================================
INSERT INTO public.kras (kra_code, name, short_name, sort_order) VALUES
    ('kra1', 'Data Hygiene, Database Management & Reporting', 'Data Hygiene', 1),
    ('kra2', 'Lead Flow Automation & Funnel Optimization',    'Lead Flow',    2),
    ('kra3', 'Event Operationalisation & Execution',          'Events',       3),
    ('kra4', 'Growth Initiatives, New Projects & Distribution','Growth',       4),
    ('kra5', 'Cross-Team Coordination, Stakeholder Mgmt & Vertical Backup', 'Coordination', 5);


-- ================================================================
-- 6. SEED: 30 KPIs (10 per member × 3 members)
-- Uses kra_code lookup so we don't have to hard-code UUIDs.
-- Rubric is a JSONB array of 5 strings "level|description"
-- ================================================================

-- KRA 1: Data Hygiene ---------------------------------------------
INSERT INTO public.kpis (kpi_code, kra_id, member, name, weight, target, definition, measure, rubric, sort_order, description) VALUES
('k_1_1', (SELECT id FROM public.kras WHERE kra_code='kra1'), 'kavya',
 'LSQ Data Quality Score', 8, 4.0,
 'Accuracy and completeness of lead data in LeadSquared, measured as 1 minus (errors / total records) from monthly LSQ audits.',
 '1 - (error records / total records), audited monthly',
 '["1|No audit conducted or error rate unknown","2|Audit done but error rate >10%","3|Error rate 5-10%, issues identified but not all fixed","4|Error rate 2-5%, systematic fixes in place","5|Error rate <2%, automated checks preventing new errors"]'::jsonb, 1,
 'Accuracy and completeness of lead data in LeadSquared'),

('k_1_2', (SELECT id FROM public.kras WHERE kra_code='kra1'), 'kavya',
 'Database Infrastructure Completeness', 7, 4.0,
 'Progress toward having all 7 core databases operational: Master Data Sheet, Cohortisation, Testimonial Hub, Exam Records, Alumni Data, Student Success, Marketing Spend Tracker.',
 'Count of databases built and actively maintained out of 7',
 '["1|0-1 databases exist","2|2-3 databases exist but incomplete or not maintained","3|4-5 databases exist and partially maintained","4|6 databases exist and actively maintained","5|All 7 databases live, maintained, and being used for decisions"]'::jsonb, 2,
 'Progress toward 7 core databases operational'),

('i_1_1', (SELECT id FROM public.kras WHERE kra_code='kra1'), 'ishita',
 'Testimonial Hub Maintenance', 5, 4.0,
 'Keeping the Testimonial Hub updated with new testimonials, tagged by course/format/student type, and accessible for marketing use.',
 'Hub update frequency + tag completeness + usage by marketing',
 '["1|Hub does not exist or has not been updated this month","2|Hub exists but missing >50% of known testimonials","3|Hub updated monthly, most testimonials tagged, occasionally used","4|Hub updated weekly, all testimonials tagged, regularly pulled for campaigns","5|Hub updated in real-time, fully tagged, integrated into campaign workflow as default source"]'::jsonb, 1,
 'Keep Testimonial Hub fresh and usable by marketing'),

('i_1_2', (SELECT id FROM public.kras WHERE kra_code='kra1'), 'ishita',
 'Campaign Tracker Updates', 5, 4.0,
 'Keeping the campaign tracker accurate with all active and completed campaigns, including spend, status, and outcomes.',
 'Tracker accuracy checked weekly — missing campaigns, stale entries',
 '["1|Tracker not maintained or >2 weeks out of date","2|Tracker updated but missing >30% of campaigns or key fields blank","3|Tracker mostly current, updated weekly, some fields incomplete","4|Tracker fully current, all fields populated, updated within 2 business days of any change","5|Tracker real-time, zero gaps, used as single source of truth by entire team"]'::jsonb, 2,
 'Keep campaign tracker accurate and current'),

('r_1_1', (SELECT id FROM public.kras WHERE kra_code='kra1'), 'riya',
 'Master Data Sheet Stewardship', 15, 4.0,
 'Building, maintaining, and ensuring accuracy of the Master Data Sheet — the single source of truth for student/lead data across all programs.',
 'Sheet completeness + accuracy audit results + update cadence',
 '["1|Master Data Sheet does not exist","2|Sheet exists but has major gaps (>20% incomplete) or stale data","3|Sheet covers most programs, updated weekly, some accuracy issues","4|Sheet covers all programs, updated within 48 hours, <5% error rate","5|Sheet is fully automated where possible, <2% error rate, team relies on it daily"]'::jsonb, 1,
 'Own Master Data Sheet as single source of truth'),

('r_1_2', (SELECT id FROM public.kras WHERE kra_code='kra1'), 'riya',
 'Campaign & Database Tracker Hygiene', 10, 4.0,
 'Ensuring all campaign trackers and supporting databases are clean, current, and structurally consistent.',
 'Weekly hygiene check: stale entries, broken links, missing fields',
 '["1|Trackers not checked or severely outdated","2|Checked monthly but >15% entries have issues","3|Checked weekly, issues flagged but not always resolved same week","4|Checked weekly, issues resolved within 48 hours, <5% error rate","5|Automated hygiene checks in place, issues resolved same day, zero stale entries"]'::jsonb, 2,
 'Keep all trackers clean and consistent');

-- KRA 2: Lead Flow Automation ------------------------------------
INSERT INTO public.kpis (kpi_code, kra_id, member, name, weight, target, definition, measure, rubric, sort_order, description) VALUES
('k_2_1', (SELECT id FROM public.kras WHERE kra_code='kra2'), 'kavya',
 'Automation Coverage', 13, 4.0,
 'Percentage of lead lifecycle stages (capture, welcome, nurture, DNP, scoring, post-enrollment) that have active automation running in LSQ.',
 'Stages with live automation / total defined stages',
 '["1|No automation beyond basic form capture","2|1-2 stages automated (e.g., welcome email only)","3|3-4 stages automated, some gaps in flow","4|5-6 stages automated, end-to-end coverage with minor gaps","5|All stages automated, tested, monitored, and iterating based on data"]'::jsonb, 1,
 'LSQ automation coverage across lead lifecycle'),

('k_2_2', (SELECT id FROM public.kras WHERE kra_code='kra2'), 'kavya',
 'Campaign Launch Quality', 12, 4.0,
 'Percentage of campaigns launched without requiring post-launch ops fixes (broken links, wrong audience, missing UTMs, incorrect flows).',
 'Clean launches / total launches, tracked per campaign',
 '["1|>50% of campaigns need post-launch fixes","2|30-50% need fixes, no QA process in place","3|15-30% need fixes, QA checklist exists but not always followed","4|<15% need fixes, QA checklist followed consistently","5|<5% need fixes, QA is automated/systematic, issues caught pre-launch"]'::jsonb, 2,
 'Clean campaign launches without post-fixes'),

('i_2_1', (SELECT id FROM public.kras WHERE kra_code='kra2'), 'ishita',
 'LSQ Journey Copy Quality', 15, 4.0,
 'Quality and timeliness of copy written for LSQ automated journeys — emails, WhatsApp messages, SMS. Measured by on-time delivery and revision rate.',
 '% delivered on time + revision rounds needed (target: <2 rounds avg)',
 '["1|Copy regularly late (>3 days past deadline) or requires 4+ revision rounds","2|Copy sometimes late, avg 3 revision rounds","3|Copy on time 70%+, avg 2 revision rounds, tone mostly consistent","4|Copy on time 90%+, avg <2 revision rounds, brand-consistent tone","5|Copy always on time, rarely needs revision, proactively adapted to journey performance data"]'::jsonb, 1,
 'LSQ automation copy: quality + timeliness'),

('i_2_2', (SELECT id FROM public.kras WHERE kra_code='kra2'), 'ishita',
 'Webinar & Campaign Copy Delivery', 10, 4.0,
 'Timely delivery of all copy assets needed for webinars and campaigns — registration pages, reminder sequences, follow-up emails, social posts.',
 '% of copy assets delivered before campaign launch deadline',
 '["1|Copy regularly holds up campaign launches","2|Copy delivered but often last-minute, missing some assets","3|Most assets delivered on time, occasional gaps filled ad-hoc","4|All assets delivered 2+ days before launch, minimal gaps","5|Full copy package delivered early with variants for A/B testing, never a bottleneck"]'::jsonb, 2,
 'Webinar + campaign copy on time'),

('r_2_1', (SELECT id FROM public.kras WHERE kra_code='kra2'), 'riya',
 'LSQ Journey Configuration', 15, 4.0,
 'Correctly configuring and testing LSQ automation journeys — triggers, conditions, delays, audience segments, exit criteria.',
 '% of journeys configured correctly on first attempt (no post-launch fixes)',
 '["1|Journeys frequently misconfigured, leads going to wrong flows","2|Journeys work but need 2-3 fixes post-launch each time","3|Most journeys work first try, occasional trigger/segment issues","4|>90% journeys correct on first attempt, tested before launch","5|All journeys correct, documented, tested with sample leads, monitored post-launch"]'::jsonb, 1,
 'Correctly configure and test LSQ journeys'),

('r_2_2', (SELECT id FROM public.kras WHERE kra_code='kra2'), 'riya',
 'Campaign Plumbing Quality', 10, 4.0,
 'End-to-end technical setup of campaigns — forms, UTMs, landing page connections, CRM field mapping, payment links.',
 '% of campaigns with zero plumbing issues post-launch',
 '["1|Frequent broken forms, missing UTMs, wrong field mappings","2|Issues in >30% of campaigns, fixed reactively","3|Issues in 10-30%, checklist exists but gaps remain","4|Issues in <10%, systematic QA before every launch","5|<5% issues, automated validation where possible, plumbing never blocks launch"]'::jsonb, 2,
 'Campaign plumbing quality end-to-end');

-- KRA 3: Event Execution -----------------------------------------
INSERT INTO public.kpis (kpi_code, kra_id, member, name, weight, target, definition, measure, rubric, sort_order, description) VALUES
('k_3_1', (SELECT id FROM public.kras WHERE kra_code='kra3'), 'kavya',
 'Event Execution Rate & Quality', 12, 4.0,
 'Ratio of events planned vs actually executed, with quality measured by checklist completion (logistics, comms, follow-up all done).',
 'Events executed with full checklist / events planned',
 '["1|<50% of planned events executed, no checklists used","2|50-70% executed, checklists exist but not followed","3|70-85% executed, checklists mostly followed, some items missed","4|85-95% executed, checklists fully followed, minor gaps only","5|>95% executed, checklists completed, post-mortems done, learnings applied to next event"]'::jsonb, 1,
 'Plan vs execute rate + checklist quality'),

('k_3_2', (SELECT id FROM public.kras WHERE kra_code='kra3'), 'kavya',
 'Post-Event Outcomes', 8, 4.0,
 'Tangible outputs captured after each event — testimonials collected, leads generated, content repurposed, counsellor handoffs made.',
 'Count of outcomes captured per event vs target outcomes list',
 '["1|No post-event capture process exists","2|Some outcomes captured ad-hoc, no systematic tracking","3|Outcomes tracked for most events, 50-70% of target items captured","4|Outcomes tracked for all events, 70-90% of target items captured","5|All target outcomes captured, fed back into marketing pipeline, ROI calculated per event"]'::jsonb, 2,
 'Tangible outputs captured per event'),

('i_3_1', (SELECT id FROM public.kras WHERE kra_code='kra3'), 'ishita',
 'Event Messaging Package', 10, 4.0,
 'Complete copy package for each event — invite copy, reminder sequences, social posts, thank-you messages, follow-up sequences.',
 '% of events with full messaging package delivered before event date',
 '["1|No standardized messaging package, copy done ad-hoc","2|Partial packages for some events, often last-minute","3|Packages created for most events, some assets missing or late","4|Full packages for all events, delivered 3+ days early","5|Templatized packages with event-type variants, delivered early, A/B tested where possible"]'::jsonb, 1,
 'Full messaging package per event'),

('i_3_2', (SELECT id FROM public.kras WHERE kra_code='kra3'), 'ishita',
 'Guest & Alumni Coordination', 5, 4.0,
 'Managing communication with guest speakers, alumni panelists, and external participants for events.',
 'Coordination completion rate — all guests briefed, confirmed, and followed up',
 '["1|Guest coordination frequently falls through, miscommunications common","2|Guests confirmed but often missing key details (time, format, prep)","3|Guests confirmed and briefed, occasional follow-up gaps","4|All guests confirmed, briefed, prepped, and followed up post-event","5|Systematic guest coordination workflow, relationship maintained post-event, feedback collected"]'::jsonb, 2,
 'Brief + confirm + follow up with guests'),

('r_3_1', (SELECT id FROM public.kras WHERE kra_code='kra3'), 'riya',
 'Event Logistics & Execution', 12, 4.0,
 'Handling all operational logistics for events — venue/platform setup, registrations, tech checks, day-of coordination, attendee management.',
 '% of logistics items completed on checklist per event',
 '["1|Logistics frequently missed, events have operational failures","2|Core logistics done but supporting items (tech check, backup plan) skipped","3|Most logistics handled, occasional day-of scrambles","4|All logistics completed per checklist, smooth execution, contingency plans ready","5|Logistics automated where possible, zero day-of scrambles, post-event teardown process clean"]'::jsonb, 1,
 'Full event logistics checklist complete'),

('r_3_2', (SELECT id FROM public.kras WHERE kra_code='kra3'), 'riya',
 'Post-Event Follow-up Execution', 8, 4.0,
 'Executing all post-event operational tasks — sending recordings, updating trackers, triggering follow-up journeys, handoff to counsellors.',
 '% of post-event tasks completed within 48 hours of event end',
 '["1|Post-event tasks rarely completed or take >1 week","2|Some tasks done but >48 hours late, no standard checklist","3|Most tasks done within 48 hours, checklist exists but not always used","4|All tasks done within 48 hours, checklist followed, handoffs confirmed","5|All tasks done within 24 hours, automated where possible, follow-up journeys triggered automatically"]'::jsonb, 2,
 'Post-event tasks within 48 hours');

-- KRA 4: Growth Initiatives --------------------------------------
INSERT INTO public.kpis (kpi_code, kra_id, member, name, weight, target, definition, measure, rubric, sort_order, description) VALUES
('k_4_1', (SELECT id FROM public.kras WHERE kra_code='kra4'), 'kavya',
 'Innovation Velocity', 13, 4.0,
 'Rate of new ideas moving from proposal to execution to measurable impact. Tracks the pipeline: ideas proposed, ideas executed, and impact delivered per quarter.',
 'Ideas proposed vs executed vs impact measured, per quarter',
 '["1|No new ideas proposed or executed this quarter","2|Ideas proposed but <20% move to execution","3|30-50% of ideas executed, impact measured for some","4|50-70% of ideas executed, impact measured for most, learnings documented","5|>70% executed, clear impact data on each, pipeline is self-sustaining with team contributing ideas"]'::jsonb, 1,
 'Ideas proposed → executed → measured'),

('k_4_2', (SELECT id FROM public.kras WHERE kra_code='kra4'), 'kavya',
 'Sir''s Personal Brand & PR Output', 12, 4.0,
 'Volume and quality of content produced for Sir''s personal brand (reels, posts, articles) plus PR placements in external publications.',
 'Content pieces published per month + PR placements per quarter',
 '["1|No content produced or PR attempted","2|1-2 content pieces/month, no PR placements","3|3-4 content pieces/month, PR pitches sent but no placements yet","4|4+ content pieces/month, 1-2 PR placements/quarter","5|6+ content pieces/month with engagement tracking, 3+ PR placements/quarter, brand narrative consistent"]'::jsonb, 2,
 'Sir''s brand + PR placement output'),

('i_4_1', (SELECT id FROM public.kras WHERE kra_code='kra4'), 'ishita',
 'Sir''s Content Series Production', 20, 4.0,
 'Writing and producing Sir''s content series — scripts for reels, LinkedIn posts, thought leadership pieces. Focus on the Legacy to Startup series and similar.',
 'Pieces produced per month + engagement metrics where trackable',
 '["1|No content pieces produced","2|1-2 pieces/month, inconsistent quality or off-brand","3|3-4 pieces/month, consistent quality, brand-aligned","4|4-6 pieces/month, high quality, audience engagement growing","5|6+ pieces/month, strong engagement, series has recognizable identity, repurposed across formats"]'::jsonb, 1,
 'Sir''s content series writing + production'),

('i_4_2', (SELECT id FROM public.kras WHERE kra_code='kra4'), 'ishita',
 'PR, Initiative & Launch Copy', 15, 4.0,
 'Copy for PR pitches, new initiative announcements, product launches, partnership communications. High-stakes external-facing writing.',
 'Pieces delivered on time + acceptance/placement rate for PR',
 '["1|PR/launch copy not delivered or significantly delayed","2|Copy delivered but needs heavy revision, often off-tone for audience","3|Copy delivered on time, 1-2 revision rounds, adequate quality","4|Copy delivered early, minimal revisions, strong for external audiences","5|Copy publication-ready on first draft, PR pitches accepted, launch copy drives measurable engagement"]'::jsonb, 2,
 'PR + initiative + launch copy'),

('r_4_1', (SELECT id FROM public.kras WHERE kra_code='kra4'), 'riya',
 'New Project Execution Support', 10, 4.0,
 'Operational execution support for new projects and initiatives — setting up trackers, configuring tools, managing timelines, coordinating across teams.',
 '% of assigned project tasks completed on time with quality',
 '["1|Tasks frequently missed or significantly delayed","2|Tasks completed but often late or requiring redo","3|Most tasks on time, occasional quality issues","4|All tasks on time, quality consistent, proactively flags risks","5|Tasks completed ahead of schedule, independently manages execution, suggests improvements"]'::jsonb, 1,
 'Execution support for new projects'),

('r_4_2', (SELECT id FROM public.kras WHERE kra_code='kra4'), 'riya',
 'Podcast & Content Logistics', 5, 4.0,
 'Handling logistics for podcast episodes and content capture — scheduling, equipment, guest coordination, upload, metadata.',
 'Episodes published on schedule + logistics checklist completion',
 '["1|Logistics not managed, episodes delayed or missing","2|Basic scheduling done, but equipment/upload/metadata frequently missed","3|Most logistics handled, occasional scheduling or upload delays","4|All logistics handled on time, checklist followed, no delays","5|Logistics fully systematized, contingency plans exist, guest experience smooth end-to-end"]'::jsonb, 2,
 'Podcast + content logistics');

-- KRA 5: Cross-Team Coordination ---------------------------------
INSERT INTO public.kpis (kpi_code, kra_id, member, name, weight, target, definition, measure, rubric, sort_order, description) VALUES
('k_5_1', (SELECT id FROM public.kras WHERE kra_code='kra5'), 'kavya',
 'Stakeholder & Vendor Satisfaction', 8, 4.0,
 'Quality of relationships with CEO, partners, and vendors. Measured by qualitative review + ability to handle escalations independently without CEO intervention.',
 'Qualitative CEO + partner review quarterly + escalation independence rate',
 '["1|Frequent escalations to CEO, vendor relationships strained","2|Some escalations avoided but CEO still involved in most vendor/partner issues","3|Handles routine matters independently, escalates complex issues appropriately","4|Handles most matters independently, escalations rare, positive stakeholder feedback","5|Full stakeholder trust, zero unnecessary escalations, vendors/partners prefer to work through GrowthOps"]'::jsonb, 1,
 'Stakeholder + vendor relationship quality'),

('k_5_2', (SELECT id FROM public.kras WHERE kra_code='kra5'), 'kavya',
 'Team Leverage & Delegation', 7, 4.0,
 'How effectively Kavya delegates to Ishita and Riya. Measured by project:ops time ratio (target 60% project / 40% ops) and number of areas where team operates independently.',
 'Project:ops ratio (target 60/40) + team independence areas count',
 '["1|Kavya doing most execution, team underutilized, ratio <30/70","2|Some delegation but Kavya still bottleneck on most tasks, ratio ~40/60","3|Delegation happening, team handles routine work, ratio ~50/50","4|Strong delegation, team handles most execution independently, ratio ~60/40","5|Team fully independent on execution, Kavya focused on strategy/new territory, ratio >70/30"]'::jsonb, 2,
 'Delegation effectiveness + project:ops ratio'),

('i_5_1', (SELECT id FROM public.kras WHERE kra_code='kra5'), 'ishita',
 'Organic Marketing Hand-off', 10, 4.0,
 'Successfully transitioning email/WhatsApp drafting responsibilities to the organic marketing team, including templates, tone guides, and review process.',
 '% of recurring drafting tasks handed off and running without Ishita''s involvement',
 '["1|No hand-off attempted, Ishita still doing all email/WA drafting","2|Hand-off started but organic team still depends on Ishita for most drafts","3|50% of recurring drafts handed off, organic team handling with some review","4|80%+ handed off, organic team independent, Ishita only reviews edge cases","5|Full hand-off complete, tone guide documented, organic team producing quality independently"]'::jsonb, 1,
 'Email/WA drafting hand-off to organic'),

('i_5_2', (SELECT id FROM public.kras WHERE kra_code='kra5'), 'ishita',
 'Collaboration with Riya', 5, 4.0,
 'Effective working relationship with Riya on shared workflows — copy handoff to automation, campaign coordination, content logistics.',
 'Handoff smoothness + rework rate on shared tasks',
 '["1|Frequent miscommunication, rework on shared tasks >30%","2|Communication happens but handoffs unclear, rework 15-30%","3|Handoffs defined, rework <15%, occasional gaps","4|Smooth handoffs, <10% rework, proactive coordination","5|Seamless collaboration, near-zero rework, independently co-manage shared workflows"]'::jsonb, 2,
 'Collaboration with Riya on shared workflows'),

('r_5_1', (SELECT id FROM public.kras WHERE kra_code='kra5'), 'riya',
 'Vendor Execution Ticket Resolution', 10, 4.0,
 'Managing vendor-related operational tickets — LSQ support, payment gateway issues, tool access, third-party integrations.',
 'Avg resolution time + % resolved without escalation to Kavya',
 '["1|Tickets pile up, most escalated to Kavya, avg resolution >5 business days","2|Tickets tracked but slow resolution (3-5 days), 50%+ escalated","3|Most tickets resolved in 2-3 days, <30% escalated","4|Tickets resolved in 1-2 days, <15% escalated, vendor relationships maintained","5|Tickets resolved same-day where possible, <5% escalated, proactive vendor relationship management"]'::jsonb, 1,
 'Vendor ticket resolution'),

('r_5_2', (SELECT id FROM public.kras WHERE kra_code='kra5'), 'riya',
 'Tech Team LP Coordination', 5, 4.0,
 'Coordinating landing page updates, fixes, and new builds with the tech team. Ensuring requests are clear, tracked, and delivered on time.',
 'LP request turnaround time + % delivered without back-and-forth',
 '["1|LP requests unclear, frequent back-and-forth, tech team frustrated","2|Requests submitted but often incomplete, avg 2+ rounds of clarification","3|Requests mostly clear, 1 round of clarification typical, delivered within 5 days","4|Requests clear on first submission, delivered within 3 days, tracked in shared system","5|Standardized request format, <2 day turnaround, zero unnecessary back-and-forth, tech team gives positive feedback"]'::jsonb, 2,
 'Tech team LP request coordination');


-- ================================================================
-- 7. SEED: 29 ACTIONS (Q1 Year 2, Apr-Jun 2026)
-- Linked to KRAs + KPIs by code so UUIDs don't need to be hard-coded.
-- ================================================================

-- KRA 1 ACTIONS
INSERT INTO public.actions (action_id, title, kra_id, kpi_id, kpi_code, owner_name, status, due_date, notes) VALUES
('1.1', 'Build Master Data Sheet',
    (SELECT id FROM public.kras WHERE kra_code='kra1'),
    (SELECT id FROM public.kpis WHERE kpi_code='r_1_1'), 'r_1_1', 'riya',
    'not_started', '2026-04-30',
    'Single source of truth for all student/lead data across programs'),
('1.2', 'Set up Testimonial Hub',
    (SELECT id FROM public.kras WHERE kra_code='kra1'),
    (SELECT id FROM public.kpis WHERE kpi_code='i_1_1'), 'i_1_1', 'ishita',
    'not_started', '2026-05-15',
    'Tagged by course, format, student type. Must be usable by marketing.'),
('1.3', 'Set up Exam Records database',
    (SELECT id FROM public.kras WHERE kra_code='kra1'),
    (SELECT id FROM public.kpis WHERE kpi_code='r_1_1'), 'r_1_1', 'riya',
    'not_started', '2026-05-15',
    'Part of 7 core databases. Start with Scholarship Exam data as first input.'),
('1.4', 'Build Alumni Data sheet',
    (SELECT id FROM public.kras WHERE kra_code='kra1'),
    (SELECT id FROM public.kpis WHERE kpi_code='r_1_1'), 'r_1_1', 'riya',
    'not_started', '2026-05-31',
    'Needed before City Alumni Meetup planning in Q2'),
('1.5', 'Set up Cohortisation in LSQ',
    (SELECT id FROM public.kras WHERE kra_code='kra1'),
    (SELECT id FROM public.kpis WHERE kpi_code='r_1_2'), 'r_1_2', 'riya',
    'not_started', '2026-05-31',
    'Tag leads by cohort in LSQ for segmented communication');

-- KRA 2 ACTIONS
INSERT INTO public.actions (action_id, title, kra_id, kpi_id, kpi_code, owner_name, status, due_date, notes) VALUES
('2.1', 'Build generic welcome automation',
    (SELECT id FROM public.kras WHERE kra_code='kra2'),
    (SELECT id FROM public.kpis WHERE kpi_code='r_2_1'), 'r_2_1', 'riya',
    'not_started', '2026-04-30',
    'First LSQ journey build. Ishita writes copy, Riya configures.'),
('2.2', 'Build DNP/not-interested flows',
    (SELECT id FROM public.kras WHERE kra_code='kra2'),
    (SELECT id FROM public.kpis WHERE kpi_code='r_2_1'), 'r_2_1', 'riya',
    'not_started', '2026-05-15',
    'Automated handling for leads marked DNP or not interested'),
('2.3', 'Implement lead scoring in LSQ',
    (SELECT id FROM public.kras WHERE kra_code='kra2'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_2_1'), 'k_2_1', 'kavya',
    'not_started', '2026-05-31',
    'Blocked on LSQ scoring module access. Kavya designs rules, Riya implements.'),
('2.4', 'Build payment drop-off rescue flow',
    (SELECT id FROM public.kras WHERE kra_code='kra2'),
    (SELECT id FROM public.kpis WHERE kpi_code='r_2_1'), 'r_2_1', 'riya',
    'not_started', '2026-05-31',
    'Automated sequence for leads who started payment but didn''t complete'),
('2.5', 'Set up post-enrollment onboarding automation',
    (SELECT id FROM public.kras WHERE kra_code='kra2'),
    (SELECT id FROM public.kpis WHERE kpi_code='r_2_1'), 'r_2_1', 'riya',
    'not_started', '2026-06-15',
    'Welcome kit, access instructions, community invite, first-week nudges'),
('2.6', 'Configure retargeting by lead stage',
    (SELECT id FROM public.kras WHERE kra_code='kra2'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_2_1'), 'k_2_1', 'kavya',
    'not_started', '2026-06-30',
    'Different messaging for different funnel stages. Needs lead scoring first.');

-- KRA 3 ACTIONS (Scholarship Exam is LIVE — in_progress)
INSERT INTO public.actions (action_id, title, kra_id, kpi_id, kpi_code, owner_name, status, due_date, notes) VALUES
('3.1', 'Create event ops checklists per event type',
    (SELECT id FROM public.kras WHERE kra_code='kra3'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_3_1'), 'k_3_1', 'kavya',
    'not_started', '2026-04-30',
    'Separate checklists for webinars, ground activations, meetups, conferences'),
('3.2', 'Scholarship Exam — LP coordination + trackers',
    (SELECT id FROM public.kras WHERE kra_code='kra3'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_3_1'), 'k_3_1', 'kavya',
    'in_progress', '2026-04-25',
    'LIVE. Closes 25 Apr. Exam 26 Apr. Kavya owns LP coordination, number tracking, and registration trackers.'),
('3.3', 'Scholarship Exam — registration push copy',
    (SELECT id FROM public.kras WHERE kra_code='kra3'),
    (SELECT id FROM public.kpis WHERE kpi_code='i_3_1'), 'i_3_1', 'ishita',
    'in_progress', '2026-04-25',
    'Final push messaging for registration close. Email + WA + social.'),
('3.4', 'Scholarship Exam — registration form + plumbing',
    (SELECT id FROM public.kras WHERE kra_code='kra3'),
    (SELECT id FROM public.kpis WHERE kpi_code='r_3_1'), 'r_3_1', 'riya',
    'in_progress', '2026-04-25',
    'Form working, UTMs tracked, data flowing to LSQ correctly.'),
('3.5', 'Scholarship Exam — post-exam follow-up execution',
    (SELECT id FROM public.kras WHERE kra_code='kra3'),
    (SELECT id FROM public.kpis WHERE kpi_code='r_3_2'), 'r_3_2', 'riya',
    'not_started', '2026-04-30',
    'Results communication, counsellor handoff, testimonial capture, lead nurture trigger'),
('3.6', 'Plan first Result Day Ground Activation',
    (SELECT id FROM public.kras WHERE kra_code='kra3'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_3_1'), 'k_3_1', 'kavya',
    'not_started', '2026-05-31',
    'First ground event. Needs venue, logistics, content, follow-up plan.'),
('3.7', 'Plan first City Alumni Meetup (Q2)',
    (SELECT id FROM public.kras WHERE kra_code='kra3'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_3_2'), 'k_3_2', 'kavya',
    'not_started', '2026-06-15',
    'Planning starts Q1, execution in Q2. Needs alumni data sheet first.'),
('3.8', 'Submit for first industry conference',
    (SELECT id FROM public.kras WHERE kra_code='kra3'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_3_1'), 'k_3_1', 'kavya',
    'not_started', '2026-06-30',
    'Identify target conference, submit speaker application for Sir');

-- KRA 4 ACTIONS
INSERT INTO public.actions (action_id, title, kra_id, kpi_id, kpi_code, owner_name, status, due_date, notes) VALUES
('4.1', 'Launch Sir Legacy to Startup reel series',
    (SELECT id FROM public.kras WHERE kra_code='kra4'),
    (SELECT id FROM public.kpis WHERE kpi_code='i_4_1'), 'i_4_1', 'ishita',
    'not_started', '2026-05-15',
    'Ishita writes scripts, Kavya reviews positioning. First 4 reels.'),
('4.2', 'First PR pitch to publications',
    (SELECT id FROM public.kras WHERE kra_code='kra4'),
    (SELECT id FROM public.kpis WHERE kpi_code='i_4_2'), 'i_4_2', 'ishita',
    'not_started', '2026-05-31',
    'Identify 3-5 target publications, draft pitches, send first round'),
('4.3', 'Draft Content Capture Trip concepts for Vidyut',
    (SELECT id FROM public.kras WHERE kra_code='kra4'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_4_2'), 'k_4_2', 'kavya',
    'not_started', '2026-05-31',
    'Concept doc for on-location content capture. Locations, formats, logistics.'),
('4.4', 'Identify first partnership marketing target',
    (SELECT id FROM public.kras WHERE kra_code='kra4'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_4_1'), 'k_4_1', 'kavya',
    'not_started', '2026-05-31',
    'Find one org for co-marketing. Define what the partnership looks like.'),
('4.5', 'Plan Analyst Stack Cohort 2 GTM',
    (SELECT id FROM public.kras WHERE kra_code='kra4'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_4_1'), 'k_4_1', 'kavya',
    'not_started', '2026-06-15',
    'Starts after Cohort 1 results. Full GTM plan: positioning, channels, timeline, targets.'),
('4.6', 'Analyst Stack Cohort 1 — ongoing ops',
    (SELECT id FROM public.kras WHERE kra_code='kra4'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_4_1'), 'k_4_1', 'kavya',
    'in_progress', '2026-06-30',
    'Cohort 1 running. Tracking progress, managing ops, collecting data for Cohort 2 GTM.');

-- KRA 5 ACTIONS
INSERT INTO public.actions (action_id, title, kra_id, kpi_id, kpi_code, owner_name, status, due_date, notes) VALUES
('5.1', 'Complete email/WA drafting hand-off to organic marketing',
    (SELECT id FROM public.kras WHERE kra_code='kra5'),
    (SELECT id FROM public.kpis WHERE kpi_code='i_5_1'), 'i_5_1', 'ishita',
    'not_started', '2026-05-31',
    'Blocked: organic marketing team bandwidth unclear. Need to confirm capacity first.'),
('5.2', 'Confirm LP handover to tech team',
    (SELECT id FROM public.kras WHERE kra_code='kra5'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_5_1'), 'k_5_1', 'kavya',
    'not_started', '2026-04-30',
    'Blocked: handover process not yet defined. Need to align with tech team lead.'),
('5.3', 'Co-build first 2 LSQ journeys with Riya',
    (SELECT id FROM public.kras WHERE kra_code='kra5'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_5_2'), 'k_5_2', 'kavya',
    'not_started', '2026-05-15',
    'Kavya builds alongside Riya for first 2, then Riya takes over independently.'),
('5.4', 'Set up monthly KPI review cadence',
    (SELECT id FROM public.kras WHERE kra_code='kra5'),
    (SELECT id FROM public.kpis WHERE kpi_code='k_5_2'), 'k_5_2', 'kavya',
    'not_started', '2026-04-30',
    'Monthly sit-down with Ishita and Riya to score KPIs and review progress');


-- ================================================================
-- 8. REALTIME: add kras to the realtime publication
-- ================================================================
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.kras;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;


-- ================================================================
-- DONE. Validate with:
--   SELECT kra_code, name FROM public.kras ORDER BY sort_order;
--   SELECT member, COUNT(*) AS kpi_count, SUM(weight) AS total_weight
--     FROM public.kpis GROUP BY member;
--     (each member should have 10 KPIs summing to 100)
--   SELECT owner_name, status, COUNT(*) FROM public.actions
--     GROUP BY owner_name, status ORDER BY owner_name;
-- ================================================================
