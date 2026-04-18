
-- Profile contract type
CREATE TYPE public.contract_type AS ENUM ('clt', 'pj');
ALTER TABLE public.profiles ADD COLUMN contract_type public.contract_type NOT NULL DEFAULT 'clt';

-- Task type and value
CREATE TYPE public.task_type AS ENUM ('internal', 'external');
ALTER TABLE public.tasks ADD COLUMN task_type public.task_type NOT NULL DEFAULT 'internal';
ALTER TABLE public.tasks ADD COLUMN service_value NUMERIC(12,2);

-- Trigger: auto-create payment when external task completed with value
CREATE OR REPLACE FUNCTION public.auto_create_payment_on_done()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  beneficiary_label TEXT;
  existing_count INTEGER;
BEGIN
  IF NEW.status = 'done'
     AND (OLD.status IS DISTINCT FROM 'done')
     AND NEW.task_type = 'external'
     AND NEW.service_value IS NOT NULL
     AND NEW.service_value > 0 THEN

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
      NEW.created_by,
      (CURRENT_DATE + INTERVAL '7 days')::date
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_payment
AFTER UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_payment_on_done();
