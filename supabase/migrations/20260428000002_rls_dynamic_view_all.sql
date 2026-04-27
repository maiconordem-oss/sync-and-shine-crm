-- ══════════════════════════════════════════════════════════════
-- RLS dinâmico: tasks SELECT consulta role_permissions
-- PJ identificado por contract_type na tabela profiles
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "tasks_rls_v3" ON public.tasks;
DROP POLICY IF EXISTS "tasks_rls_v4" ON public.tasks;

CREATE POLICY "tasks_rls_v4" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    -- Admin sempre vê tudo
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )

    -- Gestor: vê tudo SE tasks.view_all ativado, senão só próprias + externas
    OR (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'manager'
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.role_permissions
          WHERE role = 'manager' AND permission = 'tasks.view_all' AND enabled = true
        )
        OR assignee_id = auth.uid()
        OR created_by = auth.uid()
        OR task_type = 'external'
      )
    )

    -- CLT (member): só as próprias
    OR (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'member'
      )
      AND (assignee_id = auth.uid() OR created_by = auth.uid())
    )

    -- PJ (contract_type = 'pj'): só as atribuídas a ele
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND contract_type = 'pj'
      )
      AND assignee_id = auth.uid()
    )
  );
