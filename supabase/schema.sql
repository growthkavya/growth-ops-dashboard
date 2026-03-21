-- Growth & Ops Team Workspace - Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- PROFILES (extends Supabase auth.users)
-- ============================================
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    email text not null,
    full_name text,
    role text default 'member' check (role in ('admin', 'member')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Profiles policies
create policy "Profiles are viewable by all authenticated users"
    on public.profiles for select
    using (auth.role() = 'authenticated');

create policy "Users can update their own profile"
    on public.profiles for update
    using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data->>'full_name');
    return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- ============================================
-- KPIS
-- ============================================
create table public.kpis (
    id uuid default gen_random_uuid() primary key,
    name text not null,
    description text,
    weight integer not null default 0,
    target numeric(3,1) not null default 4.0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.kpis enable row level security;

create policy "KPIs are viewable by all authenticated users"
    on public.kpis for select
    using (auth.role() = 'authenticated');

create policy "KPIs can be modified by authenticated users"
    on public.kpis for all
    using (auth.role() = 'authenticated');

-- ============================================
-- KPI SCORES
-- ============================================
create table public.kpi_scores (
    id uuid default gen_random_uuid() primary key,
    kpi_id uuid references public.kpis on delete cascade not null,
    month integer not null check (month >= 1 and month <= 12),
    year integer not null,
    score numeric(3,1),
    notes text,
    created_by uuid references public.profiles,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(kpi_id, month, year)
);

alter table public.kpi_scores enable row level security;

create policy "KPI scores viewable by authenticated users"
    on public.kpi_scores for select
    using (auth.role() = 'authenticated');

create policy "KPI scores modifiable by authenticated users"
    on public.kpi_scores for all
    using (auth.role() = 'authenticated');

-- ============================================
-- ACTIONS (Priority Action Tracker)
-- ============================================
create table public.actions (
    id uuid default gen_random_uuid() primary key,
    action_id text not null unique,  -- e.g., "1.1", "2.3"
    title text not null,
    description text,
    layer integer not null check (layer >= 1 and layer <= 3),
    status text default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
    kpi_id uuid references public.kpis,
    assignee_id uuid references public.profiles,
    due_date date,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.actions enable row level security;

create policy "Actions viewable by authenticated users"
    on public.actions for select
    using (auth.role() = 'authenticated');

create policy "Actions modifiable by authenticated users"
    on public.actions for all
    using (auth.role() = 'authenticated');

-- ============================================
-- GOALS
-- ============================================
create table public.goals (
    id uuid default gen_random_uuid() primary key,
    type text not null check (type in ('year', 'quarter', 'month', 'week')),
    title text not null,
    description text,
    parent_id uuid references public.goals,
    status text default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
    owner_id uuid references public.profiles,
    due_date date,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.goals enable row level security;

create policy "Goals viewable by authenticated users"
    on public.goals for select
    using (auth.role() = 'authenticated');

create policy "Goals modifiable by authenticated users"
    on public.goals for all
    using (auth.role() = 'authenticated');

-- ============================================
-- IDEAS (Ideation)
-- ============================================
create table public.ideas (
    id uuid default gen_random_uuid() primary key,
    title text not null,
    content text,
    tags text[] default '{}',
    status text default 'active' check (status in ('draft', 'active', 'archived')),
    author_id uuid references public.profiles,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.ideas enable row level security;

create policy "Ideas viewable by authenticated users"
    on public.ideas for select
    using (auth.role() = 'authenticated');

create policy "Ideas modifiable by authenticated users"
    on public.ideas for all
    using (auth.role() = 'authenticated');

-- ============================================
-- DOCUMENTS
-- ============================================
create table public.documents (
    id uuid default gen_random_uuid() primary key,
    name text not null,
    type text default 'reference' check (type in ('sop', 'reference', 'report', 'data')),
    url text,
    description text,
    uploaded_by uuid references public.profiles,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.documents enable row level security;

create policy "Documents viewable by authenticated users"
    on public.documents for select
    using (auth.role() = 'authenticated');

create policy "Documents modifiable by authenticated users"
    on public.documents for all
    using (auth.role() = 'authenticated');

-- ============================================
-- WEEKLY LOGS
-- ============================================
create table public.weekly_logs (
    id uuid default gen_random_uuid() primary key,
    week_number integer not null,
    year integer not null,
    focus text,
    summary text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(week_number, year)
);

alter table public.weekly_logs enable row level security;

create policy "Weekly logs viewable by authenticated users"
    on public.weekly_logs for select
    using (auth.role() = 'authenticated');

create policy "Weekly logs modifiable by authenticated users"
    on public.weekly_logs for all
    using (auth.role() = 'authenticated');

-- ============================================
-- DAILY ENTRIES
-- ============================================
create table public.daily_entries (
    id uuid default gen_random_uuid() primary key,
    weekly_log_id uuid references public.weekly_logs on delete cascade not null,
    day text not null check (day in ('mon', 'tue', 'wed', 'thu', 'fri')),
    completed text[] default '{}',
    blockers text[] default '{}',
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(weekly_log_id, day)
);

alter table public.daily_entries enable row level security;

create policy "Daily entries viewable by authenticated users"
    on public.daily_entries for select
    using (auth.role() = 'authenticated');

create policy "Daily entries modifiable by authenticated users"
    on public.daily_entries for all
    using (auth.role() = 'authenticated');

-- ============================================
-- ACTIVITY LOG
-- ============================================
create table public.activity_log (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles,
    user_name text,
    action text not null check (action in ('created', 'updated', 'deleted')),
    entity_type text not null,
    entity_id uuid,
    entity_title text,
    changes jsonb,
    timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.activity_log enable row level security;

create policy "Activity log viewable by authenticated users"
    on public.activity_log for select
    using (auth.role() = 'authenticated');

create policy "Activity log insertable by authenticated users"
    on public.activity_log for insert
    with check (auth.role() = 'authenticated');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to log activity
create or replace function log_activity(
    p_user_id uuid,
    p_user_name text,
    p_action text,
    p_entity_type text,
    p_entity_id uuid,
    p_entity_title text,
    p_changes jsonb default null
)
returns void as $$
begin
    insert into public.activity_log (user_id, user_name, action, entity_type, entity_id, entity_title, changes)
    values (p_user_id, p_user_name, p_action, p_entity_type, p_entity_id, p_entity_title, p_changes);
end;
$$ language plpgsql security definer;

-- Updated_at trigger function
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

-- Apply updated_at triggers
create trigger update_actions_updated_at before update on public.actions
    for each row execute procedure update_updated_at_column();

create trigger update_goals_updated_at before update on public.goals
    for each row execute procedure update_updated_at_column();

create trigger update_ideas_updated_at before update on public.ideas
    for each row execute procedure update_updated_at_column();

create trigger update_weekly_logs_updated_at before update on public.weekly_logs
    for each row execute procedure update_updated_at_column();

create trigger update_profiles_updated_at before update on public.profiles
    for each row execute procedure update_updated_at_column();

-- ============================================
-- ENABLE REALTIME
-- ============================================
alter publication supabase_realtime add table public.actions;
alter publication supabase_realtime add table public.goals;
alter publication supabase_realtime add table public.kpis;
alter publication supabase_realtime add table public.kpi_scores;
alter publication supabase_realtime add table public.ideas;
alter publication supabase_realtime add table public.activity_log;
