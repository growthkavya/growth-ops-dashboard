-- ============================================================
-- GROWTH LAB DASHBOARD — Migration v4 (22 May 2026)
-- Patch: gl_doc supports vertical='all' (cohort-wide share)
-- Safe on top of v1+v2+v3. Idempotent.
-- ============================================================

-- Update gl_doc SELECT policy to support 'all' vertical
DROP POLICY IF EXISTS gl_doc_select ON public.gl_doc;
CREATE POLICY gl_doc_select ON public.gl_doc FOR SELECT USING (
    public.is_admin()
    OR shared_by_id = auth.uid()
    -- direct intern share
    OR EXISTS (SELECT 1 FROM public.interns i WHERE i.id = gl_doc.intern_id
        AND (i.supervisor_id = auth.uid() OR i.auth_user_id = auth.uid()))
    -- cohort-wide share ('all') — any growth_lab intern or their RM can see
    OR (gl_doc.vertical = 'all' AND EXISTS (
        SELECT 1 FROM public.interns i WHERE i.tags @> ARRAY['growth_lab']::text[]
            AND (i.auth_user_id = auth.uid() OR i.supervisor_id = auth.uid())
    ))
    -- specific-vertical share — interns in that vertical + their RM
    OR (gl_doc.vertical IS NOT NULL AND gl_doc.vertical != 'all' AND EXISTS (
        SELECT 1 FROM public.interns i WHERE i.tags @> ARRAY[gl_doc.vertical]::text[]
            AND i.tags @> ARRAY['growth_lab']::text[]
            AND (i.auth_user_id = auth.uid() OR i.supervisor_id = auth.uid())
    ))
);

-- Update doc-shared notification trigger to handle vertical='all'
CREATE OR REPLACE FUNCTION public.gl_notify_intern_on_doc()
RETURNS trigger AS $$
DECLARE r record; actor text;
BEGIN
    SELECT full_name INTO actor FROM public.profiles WHERE id = auth.uid();
    IF NEW.intern_id IS NOT NULL THEN
        -- Direct share to one intern
        FOR r IN SELECT auth_user_id, name FROM public.interns WHERE id = NEW.intern_id LOOP
            IF r.auth_user_id IS NOT NULL THEN
                INSERT INTO public.gl_notification (recipient_id, actor_id, actor_name, intern_id, intern_name, event_type, message, link)
                    VALUES (r.auth_user_id, auth.uid(), actor, NEW.intern_id, r.name, 'doc_shared',
                        COALESCE(actor,'RM') || ' shared: ' || NEW.title, '#docs');
            END IF;
        END LOOP;
    ELSIF NEW.vertical = 'all' THEN
        -- Cohort-wide
        FOR r IN SELECT auth_user_id, name, id FROM public.interns
                 WHERE tags @> ARRAY['growth_lab']::text[] AND status = 'active' LOOP
            IF r.auth_user_id IS NOT NULL THEN
                INSERT INTO public.gl_notification (recipient_id, actor_id, actor_name, intern_id, intern_name, event_type, message, link)
                    VALUES (r.auth_user_id, auth.uid(), actor, r.id, r.name, 'doc_shared',
                        COALESCE(actor,'RM') || ' shared with the cohort: ' || NEW.title, '#docs');
            END IF;
        END LOOP;
    ELSIF NEW.vertical IS NOT NULL THEN
        -- Specific vertical/team
        FOR r IN SELECT auth_user_id, name, id FROM public.interns
                 WHERE tags @> ARRAY[NEW.vertical]::text[] AND status = 'active' AND tags @> ARRAY['growth_lab']::text[] LOOP
            IF r.auth_user_id IS NOT NULL THEN
                INSERT INTO public.gl_notification (recipient_id, actor_id, actor_name, intern_id, intern_name, event_type, message, link)
                    VALUES (r.auth_user_id, auth.uid(), actor, r.id, r.name, 'doc_shared',
                        COALESCE(actor,'RM') || ' shared with team: ' || NEW.title, '#docs');
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN RAISE NOTICE 'Growth Lab v4 complete: gl_doc supports vertical=all (cohort-wide share).'; END $$;
