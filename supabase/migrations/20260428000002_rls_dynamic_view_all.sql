-- ══════════════════════════════════════════════════════════════
-- RLS dinâmico: tasks SELECT consulta role_permissions
-- Gestor vê todas as tarefas SOMENTE se tasks.view_all = true
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "tasks_rls_v3" ON public.tasks;

CREATE POLICY "tasks_rls_v4" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    -- Admin sempre vê tudo
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )

    -- Gestor: vê tudo SE tasks.view_all estiver ativado para manager
    OR (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'manager'
      )
      AND (
        -- tasks.view_all ativo → vê tudo
        EXISTS (
          SELECT 1 FROM public.role_permissions
          WHERE role = 'manager' AND permission = 'tasks.view_all' AND enabled = true
        )
        -- tasks.view_all inativo → só as próprias + externas (para relatórios PJ)
        OR assignee_id = auth.uid()
        OR created_by = auth.uid()
        OR task_type = 'external'
      )
    )

    -- CLT: só as próprias (assignee ou criador)
    OR (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'member'
      )
      AND (assignee_id = auth.uid() OR created_by = auth.uid())
    )

    -- PJ: só as atribuídas a ele
    OR (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'pj'
      )
      AND assignee_id = auth.uid()
    )
  );
