CREATE TABLE public.task_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_priority public.task_priority NOT NULL DEFAULT 'medium',
  default_task_type public.task_type NOT NULL DEFAULT 'internal',
  default_estimated_hours NUMERIC,
  default_service_value NUMERIC,
  default_tags TEXT[] DEFAULT '{}'::text[],
  checklist_items TEXT[] DEFAULT '{}'::text[],
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates viewable by authenticated"
ON public.task_templates FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Templates insert by manager"
ON public.task_templates FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Templates update by manager"
ON public.task_templates FOR UPDATE
TO authenticated
USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Templates delete by manager"
ON public.task_templates FOR DELETE
TO authenticated
USING (public.is_admin_or_manager(auth.uid()));

CREATE TRIGGER update_task_templates_updated_at
BEFORE UPDATE ON public.task_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();