CREATE OR REPLACE FUNCTION public.auto_create_payment_on_done()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  beneficiary_label TEXT;
  existing_count INTEGER;
  approver UUID;
  ref_date DATE;
  computed_due DATE;
BEGIN
  IF NEW.status = 'done'
     AND (OLD.status IS DISTINCT FROM 'done')
     AND NEW.task_type = 'external'
     AND NEW.service_value IS NOT NULL
     AND NEW.service_value > 0 THEN

    approver := auth.uid();
    IF approver IS NULL
       OR approver = NEW.assignee_id
       OR NOT public.is_admin_or_manager(approver) THEN
      RAISE EXCEPTION 'Apenas Admin ou Gestor (diferente do responsável PJ) pode aprovar a conclusão desta tarefa externa.';
    END IF;

    SELECT COUNT(*) INTO existing_count FROM public.payments WHERE task_id = NEW.id;
    IF existing_count > 0 THEN
      RETURN NEW;
    END IF;

    SELECT full_name INTO beneficiary_label FROM public.profiles WHERE id = NEW.assignee_id;

    -- Vencimento: último dia do mês de referência da tarefa (nunca escapa do mês do serviço)
    ref_date := COALESCE(NEW.completed_at, NEW.approved_at, now())::date;
    computed_due := (date_trunc('month', ref_date) + INTERVAL '1 month - 1 day')::date;
    IF computed_due < (CURRENT_DATE + INTERVAL '7 days')::date THEN
      computed_due := GREATEST(computed_due, ref_date);
    END IF;

    INSERT INTO public.payments (
      description, amount, currency, status,
      beneficiary_user_id, beneficiary_name,
      task_id, project_id, created_by, due_date
    ) VALUES (
      'Pagamento referente à tarefa: ' || NEW.title,
      NEW.service_value,
      'BRL',
      'pending',
      NEW.assignee_id,
      COALESCE(beneficiary_label, 'A definir'),
      NEW.id,
      NEW.project_id,
      approver,
      computed_due
    );
  END IF;
  RETURN NEW;
END;
$function$;