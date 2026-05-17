-- Master Sheets: a curated hub of Google Sheets across verticals,
-- visible to admin + member, editable by admin only.

CREATE TABLE IF NOT EXISTS master_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    vertical TEXT NOT NULL CHECK (vertical IN ('growth','sales','academics','tech','hiring','finance','other')),
    owner TEXT,
    url TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE master_sheets ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT policyname FROM pg_policies WHERE tablename = 'master_sheets'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON master_sheets', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "master_sheets_admin_all" ON master_sheets
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "master_sheets_member_read" ON master_sheets
    FOR SELECT USING (current_user_role() IN ('admin','member'));

CREATE INDEX IF NOT EXISTS idx_master_sheets_vertical ON master_sheets(vertical, sort_order);
