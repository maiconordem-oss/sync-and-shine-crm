-- Função segura para relatório PJ — bypassa RLS mas só para gestores/admins
-- Retorna tarefas externas concluídas para o relatório financeiro
CREATE OR REPLACE FUNCTION public.get_pj_tasks_for_report(
  start_iso TIMESTAMPTZ,
  end_iso   TIMESTAMPTZ
)
RETURNS TABLE (
  id           UUID,
  title        TEXT,
  assignee_id  UUID,
  service_value NUMERIC,
  task_type    TEXT,
  status       TEXT,
  completed_at TIMESTAMPTZ,
  approved_at  TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, title, assignee_id, service_value, task_type::text, status::text, completed_at, approved_at
  FROM public.tasks
  WHERE task_type = 'external'
    AND status = 'done'
    AND is_admin_or_manager(auth.uid())  -- só gestor/admin pode chamar
    AND (
      (completed_at >= start_iso AND completed_at < end_iso)
      OR (approved_at >= start_iso AND approved_at < end_iso)
    );
$$;

-- Permissão de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.get_pj_tasks_for_report TO authenticated;
