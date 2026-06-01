
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE TABLE IF NOT EXISTS public.task_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.task_audit_log TO authenticated;
GRANT ALL ON public.task_audit_log TO service_role;

ALTER TABLE public.task_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit insert authenticated" ON public.task_audit_log;
CREATE POLICY "audit insert authenticated"
  ON public.task_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "audit select by manager or involved" ON public.task_audit_log;
CREATE POLICY "audit select by manager or involved"
  ON public.task_audit_log FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_audit_log.task_id
        AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_task_audit_log_task ON public.task_audit_log(task_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_external_task_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_payment boolean;
BEGIN
  IF OLD.task_type = 'external' AND COALESCE(OLD.service_value, 0) > 0 THEN
    SELECT EXISTS(SELECT 1 FROM public.payments WHERE task_id = OLD.id) INTO has_payment;
    IF OLD.completed_at IS NOT NULL OR OLD.status = 'done' OR has_payment THEN
      RAISE EXCEPTION 'Tarefa externa com serviço concluído ou pagamento não pode ser excluída. Use Cancelar.';
    END IF;
  END IF;

  INSERT INTO public.task_audit_log(task_id, actor_id, action, details)
  VALUES (OLD.id, auth.uid(), 'deleted', jsonb_build_object(
    'title', OLD.title,
    'task_type', OLD.task_type,
    'status', OLD.status::text,
    'service_value', OLD.service_value
  ));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_external_task_delete ON public.tasks;
CREATE TRIGGER trg_prevent_external_task_delete
  BEFORE DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_external_task_delete();

CREATE OR REPLACE FUNCTION public.handle_task_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_payment boolean;
BEGIN
  IF OLD.status = 'canceled' AND NEW.status <> 'canceled' THEN
    IF NOT public.is_admin_or_manager(auth.uid()) THEN
      RAISE EXCEPTION 'Tarefa cancelada. Somente um gestor pode reativá-la.';
    END IF;
    NEW.canceled_at := NULL;
    NEW.canceled_by := NULL;
    NEW.cancel_reason := NULL;
    INSERT INTO public.task_audit_log(task_id, actor_id, action, details)
    VALUES (NEW.id, auth.uid(), 'status_changed',
      jsonb_build_object('from','canceled','to', NEW.status::text, 'note','reativada'));
    RETURN NEW;
  END IF;

  IF NEW.status = 'canceled' AND OLD.status <> 'canceled' THEN
    NEW.canceled_at := COALESCE(NEW.canceled_at, now());
    NEW.canceled_by := COALESCE(NEW.canceled_by, auth.uid());

    SELECT EXISTS(SELECT 1 FROM public.payments WHERE task_id = NEW.id) INTO has_payment;

    INSERT INTO public.task_audit_log(task_id, actor_id, action, details)
    VALUES (NEW.id, auth.uid(), 'canceled', jsonb_build_object(
      'reason', NEW.cancel_reason,
      'previous_status', OLD.status::text,
      'had_completion', (OLD.completed_at IS NOT NULL),
      'kept_payment', has_payment
    ));

    IF has_payment THEN
      INSERT INTO public.task_audit_log(task_id, actor_id, action, details)
      VALUES (NEW.id, auth.uid(), 'payment_kept_on_cancel', '{}'::jsonb);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_task_cancellation ON public.tasks;
CREATE TRIGGER trg_handle_task_cancellation
  BEFORE UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_task_cancellation();

CREATE OR REPLACE FUNCTION public.block_done_on_canceled()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'canceled' AND NEW.status = 'done' THEN
    RAISE EXCEPTION 'Tarefa cancelada não pode ser concluída. Fale com o gestor.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_done_on_canceled ON public.tasks;
CREATE TRIGGER trg_block_done_on_canceled
  BEFORE UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.block_done_on_canceled();

DROP FUNCTION IF EXISTS public.get_pj_tasks_for_report(timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.get_pj_tasks_for_report(start_iso timestamp with time zone, end_iso timestamp with time zone)
 RETURNS TABLE(id uuid, title text, assignee_id uuid, service_value numeric, task_type text, status text, completed_at timestamp with time zone, approved_at timestamp with time zone, canceled_at timestamp with time zone, cancel_reason text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, title, assignee_id, service_value, task_type::text, status::text, completed_at, approved_at, canceled_at, cancel_reason
  FROM public.tasks
  WHERE task_type = 'external'
    AND (status = 'done' OR (status = 'canceled' AND completed_at IS NOT NULL))
    AND is_admin_or_manager(auth.uid())
    AND (
      (completed_at >= start_iso AND completed_at < end_iso)
      OR (approved_at >= start_iso AND approved_at < end_iso)
    );
$function$;
