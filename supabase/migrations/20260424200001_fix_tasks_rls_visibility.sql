-- ============================================================
-- Corrige visibilidade de tarefas por papel
-- ============================================================
-- Regra de negócio:
--   Admin / Gestor  → vê TODAS as tarefas
--   Membro CLT      → vê tarefas internas + tarefas em que é assignee
--   Membro PJ       → vê APENAS tarefas em que é assignee_id
-- ============================================================

-- Remove política permissiva anterior
DROP POLICY IF EXISTS "Tasks viewable by authenticated" ON public.tasks;

-- Nova política granular
CREATE POLICY "Tasks visible by role" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    -- Admin e Gestor veem tudo
    public.is_admin_or_manager(auth.uid())
    -- Qualquer usuário vê tarefas onde é o responsável
    OR assignee_id = auth.uid()
    -- Qualquer usuário vê tarefas que ele mesmo criou
    OR created_by = auth.uid()
    -- Tarefas internas são visíveis a todos os membros CLT
    -- (PJs são filtrados pela ausência de is_admin_or_manager e assignee_id)
    OR (
      task_type = 'internal'
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND contract_type = 'pj'
      )
    )
  );

-- Garante que subtarefas herdam a mesma visibilidade via parent
-- (já coberto pela política acima via created_by / assignee_id)
