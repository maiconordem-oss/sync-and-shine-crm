-- ══════════════════════════════════════════════════════
-- Links das tarefas
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.task_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  title      TEXT,
  added_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_links_task ON public.task_links(task_id);
ALTER TABLE public.task_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "links_select" ON public.task_links FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid())
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())));
CREATE POLICY "links_insert" ON public.task_links FOR INSERT TO authenticated WITH CHECK (auth.uid() = added_by);
CREATE POLICY "links_delete" ON public.task_links FOR DELETE TO authenticated
  USING (auth.uid() = added_by OR public.is_admin_or_manager(auth.uid()));

-- ══════════════════════════════════════════════════════
-- Fluxo de aprovação: adicionar status 'awaiting_approval'
-- e coluna approved_by / approved_at em tasks
-- ══════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'awaiting_approval'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_status')) THEN
    ALTER TYPE public.task_status ADD VALUE 'awaiting_approval';
  END IF;
END $$;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS approved_by  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_note  TEXT;

-- ══════════════════════════════════════════════════════
-- Avatar: garantir bucket público para fotos de perfil
-- ══════════════════════════════════════════════════════
-- (bucket 'avatars' deve ser criado manualmente no Supabase Dashboard
--  Storage → New bucket → name: avatars → Public: true)
