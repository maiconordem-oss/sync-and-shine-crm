-- ══════════════════════════════════════════════════════
-- Histórico de alterações das tarefas
-- ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.task_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL, -- status_changed | assigned | due_changed | created | completed | title_changed | priority_changed
  field       TEXT,          -- campo alterado
  old_value   TEXT,
  new_value   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_history_task ON public.task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_created ON public.task_history(created_at DESC);

ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "history_select" ON public.task_history FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())
    )
  );

CREATE POLICY "history_insert" ON public.task_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Função para criar notificação ao inserir histórico de status
CREATE OR REPLACE FUNCTION public.notify_task_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_task RECORD;
  v_actor_name TEXT;
BEGIN
  SELECT t.*, p.full_name INTO v_task
  FROM public.tasks t
  LEFT JOIN public.profiles p ON p.id = NEW.user_id
  WHERE t.id = NEW.task_id;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = NEW.user_id;

  -- Notificar o criador se não for ele mesmo agindo
  IF v_task.created_by IS NOT NULL AND v_task.created_by != NEW.user_id THEN
    INSERT INTO public.notifications(user_id, type, title, body, task_id)
    VALUES (
      v_task.created_by,
      NEW.action,
      CASE NEW.action
        WHEN 'status_changed' THEN 'Status alterado: ' || v_task.title
        WHEN 'comment_added'  THEN 'Novo comentário: '  || v_task.title
        ELSE 'Atualização: ' || v_task.title
      END,
      COALESCE(v_actor_name, 'Alguém') || ' ' ||
      CASE NEW.action
        WHEN 'status_changed' THEN 'mudou o status para ' || COALESCE(NEW.new_value, '?')
        WHEN 'comment_added'  THEN 'comentou na tarefa'
        ELSE 'atualizou a tarefa'
      END,
      NEW.task_id
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Notificar o responsável se não for ele mesmo agindo
  IF v_task.assignee_id IS NOT NULL AND v_task.assignee_id != NEW.user_id AND v_task.assignee_id != v_task.created_by THEN
    INSERT INTO public.notifications(user_id, type, title, body, task_id)
    VALUES (
      v_task.assignee_id,
      NEW.action,
      CASE NEW.action
        WHEN 'status_changed' THEN 'Status alterado: ' || v_task.title
        WHEN 'comment_added'  THEN 'Novo comentário: '  || v_task.title
        ELSE 'Atualização: ' || v_task.title
      END,
      COALESCE(v_actor_name, 'Alguém') || ' ' ||
      CASE NEW.action
        WHEN 'status_changed' THEN 'mudou o status para ' || COALESCE(NEW.new_value, '?')
        WHEN 'comment_added'  THEN 'comentou na tarefa'
        ELSE 'atualizou a tarefa'
      END,
      NEW.task_id
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_history_notify
  AFTER INSERT ON public.task_history
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_change();

-- Habilitar Realtime para notificações (para o badge do sino atualizar ao vivo)
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
