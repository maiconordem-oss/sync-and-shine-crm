
CREATE TABLE public.task_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_links_task_id ON public.task_links(task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_links TO authenticated;
GRANT ALL ON public.task_links TO service_role;

ALTER TABLE public.task_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view task links"
  ON public.task_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can add task links"
  ON public.task_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = added_by);

CREATE POLICY "Owner or manager can delete task links"
  ON public.task_links FOR DELETE
  TO authenticated
  USING (added_by = auth.uid() OR public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Owner or manager can update task links"
  ON public.task_links FOR UPDATE
  TO authenticated
  USING (added_by = auth.uid() OR public.is_admin_or_manager(auth.uid()));
