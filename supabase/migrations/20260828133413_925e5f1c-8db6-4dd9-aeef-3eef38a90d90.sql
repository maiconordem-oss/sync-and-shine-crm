ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS pix_key_type text,
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS bank_name text;

ALTER TABLE public.monthly_closures
  ADD COLUMN IF NOT EXISTS invoice_path text,
  ADD COLUMN IF NOT EXISTS invoice_name text,
  ADD COLUMN IF NOT EXISTS invoice_uploaded_at timestamptz;

CREATE OR REPLACE FUNCTION public.require_invoice_before_paid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    IF NEW.invoice_path IS NULL OR length(trim(NEW.invoice_path)) = 0 THEN
      RAISE EXCEPTION 'Nota fiscal do mês não enviada. O PJ precisa enviar a NF antes da liberação do pagamento.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_invoice_before_paid ON public.monthly_closures;
CREATE TRIGGER trg_require_invoice_before_paid
BEFORE UPDATE ON public.monthly_closures
FOR EACH ROW EXECUTE FUNCTION public.require_invoice_before_paid();

-- Storage policies (bucket privado "invoices")
DROP POLICY IF EXISTS "invoices owner insert" ON storage.objects;
CREATE POLICY "invoices owner insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "invoices owner update" ON storage.objects;
CREATE POLICY "invoices owner update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "invoices owner delete" ON storage.objects;
CREATE POLICY "invoices owner delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "invoices read owner or managers" ON storage.objects;
CREATE POLICY "invoices read owner or managers" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'invoices' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_admin_or_manager(auth.uid())
  )
);