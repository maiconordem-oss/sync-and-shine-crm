-- 1. Índices de performance (aditivos)
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_due_open
  ON public.tasks (assignee_id, due_date)
  WHERE status <> 'done' AND due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_task_image
  ON public.attachments (task_id, created_at)
  WHERE mime_type LIKE 'image/%';

-- 2. Relatório PJ: data de referência em cascata para nenhuma tarefa sumir
DROP FUNCTION IF EXISTS public.get_pj_tasks_for_report(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_pj_tasks_for_report(
  start_iso timestamp with time zone,
  end_iso timestamp with time zone
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  assignee_id uuid,
  service_value numeric,
  task_type text,
  status text,
  completed_at timestamp with time zone,
  approved_at timestamp with time zone,
  canceled_at timestamp with time zone,
  cancel_reason text,
  created_at timestamp with time zone,
  due_date timestamp with time zone,
  project_id uuid,
  project_name text,
  project_color text,
  reference_at timestamp with time zone,
  reference_source text,
  incomplete_record boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    t.id,
    t.title,
    t.description,
    t.assignee_id,
    t.service_value,
    t.task_type::text,
    t.status::text,
    t.completed_at,
    t.approved_at,
    t.canceled_at,
    t.cancel_reason,
    t.created_at,
    t.due_date,
    t.project_id,
    p.name  AS project_name,
    p.color AS project_color,
    COALESCE(t.completed_at, t.approved_at, t.canceled_at, t.created_at) AS reference_at,
    CASE
      WHEN t.completed_at IS NOT NULL THEN 'completed'
      WHEN t.approved_at  IS NOT NULL THEN 'approved'
      WHEN t.canceled_at  IS NOT NULL THEN 'canceled'
      ELSE 'created'
    END AS reference_source,
    (t.completed_at IS NULL AND t.approved_at IS NULL) AS incomplete_record
  FROM public.tasks t
  LEFT JOIN public.projects p ON p.id = t.project_id
  WHERE t.task_type = 'external'
    AND t.status IN ('done', 'canceled')
    AND (
      public.is_admin_or_manager(auth.uid())
      OR t.assignee_id = auth.uid()
    )
    AND COALESCE(t.completed_at, t.approved_at, t.canceled_at, t.created_at) >= start_iso
    AND COALESCE(t.completed_at, t.approved_at, t.canceled_at, t.created_at) <  end_iso;
$function$;