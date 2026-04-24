-- Chat interno geral
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_select" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "chat_insert" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "chat_delete" ON public.chat_messages FOR DELETE TO authenticated USING (auth.uid() = author_id OR public.is_admin_or_manager(auth.uid()));

-- Perfil: sound_enabled
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='sound_enabled') THEN
    ALTER TABLE public.profiles ADD COLUMN sound_enabled BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- Tasks RLS corrigida
DROP POLICY IF EXISTS "Tasks viewable by authenticated" ON public.tasks;
DROP POLICY IF EXISTS "Tasks visible by role" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated USING (
  public.is_admin_or_manager(auth.uid())
  OR auth.uid() = assignee_id
  OR auth.uid() = created_by
);

-- Attachments RLS
DROP POLICY IF EXISTS "Attachments insert" ON public.attachments;
DROP POLICY IF EXISTS "Attachments select" ON public.attachments;
DROP POLICY IF EXISTS "Attachments delete" ON public.attachments;
CREATE POLICY "attach_select" ON public.attachments FOR SELECT TO authenticated USING (
  public.is_admin_or_manager(auth.uid())
  OR uploaded_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid()))
);
CREATE POLICY "attach_insert" ON public.attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "attach_delete" ON public.attachments FOR DELETE TO authenticated USING (auth.uid() = uploaded_by OR public.is_admin_or_manager(auth.uid()));

-- Comments RLS
DROP POLICY IF EXISTS "Comments viewable" ON public.comments;
DROP POLICY IF EXISTS "Authenticated insert comments" ON public.comments;
CREATE POLICY "comments_select" ON public.comments FOR SELECT TO authenticated USING (
  public.is_admin_or_manager(auth.uid())
  OR auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid()))
);
CREATE POLICY "comments_insert" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "comments_delete" ON public.comments FOR DELETE TO authenticated USING (auth.uid() = author_id OR public.is_admin_or_manager(auth.uid()));
