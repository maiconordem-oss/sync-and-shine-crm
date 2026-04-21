-- Add 'in_review' to task_status enum
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'in_review';

-- Update auto-payment trigger function to require an approver (admin/manager) different from the PJ assignee
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
BEGIN
  IF NEW.status = 'done'
     AND (OLD.status IS DISTINCT FROM 'done')
     AND NEW.task_type = 'external'
     AND NEW.service_value IS NOT NULL
     AND NEW.service_value > 0 THEN

    -- Require approval: the user moving to 'done' must be an admin/manager AND not the assignee
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
      (CURRENT_DATE + INTERVAL '7 days')::date
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Ensure trigger is attached (idempotent)
DROP TRIGGER IF EXISTS trg_auto_create_payment ON public.tasks;
CREATE TRIGGER trg_auto_create_payment
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_payment_on_done();