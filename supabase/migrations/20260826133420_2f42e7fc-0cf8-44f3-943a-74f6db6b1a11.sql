CREATE OR REPLACE FUNCTION public.guard_service_value_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ref_month TEXT;
  closure_status TEXT;
  synced_payments INTEGER := 0;
BEGIN
  -- Só nos interessa quando o valor do serviço muda
  IF NEW.service_value IS NOT DISTINCT FROM OLD.service_value THEN
    RETURN NEW;
  END IF;

  -- 1) Somente Admin/Gestor pode alterar o valor
  IF NOT public.is_admin_or_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Somente Admin ou Gestor pode alterar o valor do serviço.';
  END IF;

  -- 2) Trava após fechamento do mês de referência da tarefa
  ref_month := to_char(COALESCE(NEW.completed_at, NEW.approved_at, NEW.canceled_at, NEW.created_at)::date, 'YYYY-MM');

  IF NEW.assignee_id IS NOT NULL THEN
    SELECT mc.status INTO closure_status
    FROM public.monthly_closures mc
    WHERE mc.reference_month = ref_month
      AND mc.pj_user_id = NEW.assignee_id
    LIMIT 1;

    IF closure_status IN ('closed', 'paid') THEN
      RAISE EXCEPTION 'O mês % deste PJ já está fechado. Reabra o fechamento para ajustar o valor.', ref_month;
    END IF;
  END IF;

  -- 3) Sincroniza pagamento pendente vinculado à tarefa
  IF NEW.task_type = 'external' AND NEW.service_value IS NOT NULL AND NEW.service_value > 0 THEN
    UPDATE public.payments
    SET amount = NEW.service_value
    WHERE task_id = NEW.id
      AND status = 'pending';
    GET DIAGNOSTICS synced_payments = ROW_COUNT;
  END IF;

  -- 4) Auditoria da alteração
  INSERT INTO public.task_audit_log(task_id, actor_id, action, details)
  VALUES (NEW.id, auth.uid(), 'service_value_changed', jsonb_build_object(
    'from', OLD.service_value,
    'to', NEW.service_value,
    'reference_month', ref_month,
    'pending_payments_updated', synced_payments
  ));

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_guard_service_value
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.guard_service_value_change();