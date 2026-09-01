
CREATE OR REPLACE FUNCTION public.guard_pj_invoice_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_or_manager(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.pj_user_id THEN
    IF OLD.status = 'paid' THEN
      RAISE EXCEPTION 'Mês já pago. A nota fiscal não pode mais ser alterada.';
    END IF;
    IF NEW.reference_month IS DISTINCT FROM OLD.reference_month
       OR NEW.pj_user_id IS DISTINCT FROM OLD.pj_user_id
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.tasks_count IS DISTINCT FROM OLD.tasks_count
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.closed_by IS DISTINCT FROM OLD.closed_by
       OR NEW.paid_by IS DISTINCT FROM OLD.paid_by THEN
      RAISE EXCEPTION 'O PJ só pode enviar a nota fiscal deste fechamento.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pj_invoice_update ON public.monthly_closures;
CREATE TRIGGER trg_guard_pj_invoice_update
BEFORE UPDATE ON public.monthly_closures
FOR EACH ROW EXECUTE FUNCTION public.guard_pj_invoice_update();

DROP POLICY IF EXISTS "PJ envia nota fiscal do proprio fechamento" ON public.monthly_closures;
CREATE POLICY "PJ envia nota fiscal do proprio fechamento"
ON public.monthly_closures
FOR UPDATE
TO authenticated
USING (auth.uid() = pj_user_id AND status <> 'paid')
WITH CHECK (auth.uid() = pj_user_id);

UPDATE public.monthly_closures
SET invoice_path = 'd5d1e532-e511-4cba-bc7f-d2266e7fb0c2/2026-08-1788226652234.pdf',
    invoice_name = 'nota-fiscal-2026-08.pdf',
    invoice_uploaded_at = '2026-09-01 01:37:33.818182+00'
WHERE pj_user_id = 'd5d1e532-e511-4cba-bc7f-d2266e7fb0c2'
  AND reference_month = '2026-08'
  AND invoice_path IS NULL;
