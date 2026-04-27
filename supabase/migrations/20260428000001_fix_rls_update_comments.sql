-- ══════════════════════════════════════════════════════════════
-- CORREÇÃO RLS — 2 brechas
-- 1. tasks UPDATE: remover assignee_id (PJ não pode editar via API)
-- 2. comments SELECT: PJ só vê comentários de suas tarefas
-- ══════════════════════════════════════════════════════════════

-- ── 1. tasks UPDATE ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Update own/assigned or manager" ON public.tasks;

CREATE POLICY "tasks_update_v2" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    -- Criador pode editar
    auth.uid() = created_by
    -- Admin e gestor podem editar qualquer uma
    OR public.is_admin_or_manager(auth.uid())
  );

-- ── 2. comments SELECT ───────────────────────────────────────────
DROP POLICY IF EXISTS "Comments viewable" ON public.comments;

CREATE POLICY "comments_select_v2" ON public.comments
  FOR SELECT TO authenticated
  USING (
    -- Admin e gestor veem tudo
    public.is_admin_or_manager(auth.uid())
    -- Outros veem comentários de tarefas onde são assignee ou created_by
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (
          t.assignee_id = auth.uid()
          OR t.created_by = auth.uid()
        )
    )
  );
