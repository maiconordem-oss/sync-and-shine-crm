DROP FUNCTION IF EXISTS public.get_pj_tasks_for_report(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_pj_tasks_for_report(start_iso timestamptz, end_iso timestamptz)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  assignee_id uuid,
  service_value numeric,
  task_type text,
  status text,
  completed_at timestamptz,
  approved_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz,
  due_date timestamptz,
  project_id uuid,
  project_name text,
  project_color text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id, t.title, t.description, t.assignee_id, t.service_value, t.task_type::text, t.status::text,
         t.completed_at, t.approved_at, t.canceled_at, t.cancel_reason, t.created_at, t.due_date,
         t.project_id, p.name AS project_name, p.color AS project_color
  FROM public.tasks t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.task_type = 'external'
    AND (t.status = 'done' OR (t.status = 'canceled' AND t.completed_at IS NOT NULL))
    AND (
      public.is_admin_or_manager(auth.uid())
      OR t.assignee_id = auth.uid()
    )
    AND (
      (t.completed_at >= start_iso AND t.completed_at < end_iso)
      OR (t.approved_at >= start_iso AND t.approved_at < end_iso)
    );
$$;