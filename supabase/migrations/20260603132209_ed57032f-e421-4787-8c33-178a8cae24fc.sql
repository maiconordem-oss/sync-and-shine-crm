DROP FUNCTION IF EXISTS public.get_pj_tasks_for_report(timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_pj_tasks_for_report(start_iso timestamp with time zone, end_iso timestamp with time zone)
 RETURNS TABLE(id uuid, title text, assignee_id uuid, service_value numeric, task_type text, status text, completed_at timestamp with time zone, approved_at timestamp with time zone, canceled_at timestamp with time zone, cancel_reason text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, title, assignee_id, service_value, task_type::text, status::text, completed_at, approved_at, canceled_at, cancel_reason, created_at
  FROM public.tasks
  WHERE task_type = 'external'
    AND (status = 'done' OR (status = 'canceled' AND completed_at IS NOT NULL))
    AND is_admin_or_manager(auth.uid())
    AND (
      (completed_at >= start_iso AND completed_at < end_iso)
      OR (approved_at >= start_iso AND approved_at < end_iso)
    );
$function$;