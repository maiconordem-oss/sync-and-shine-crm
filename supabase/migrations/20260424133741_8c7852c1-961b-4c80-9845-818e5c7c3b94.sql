CREATE TABLE public.monthly_closures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference_month TEXT NOT NULL,
  pj_user_id UUID NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  tasks_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  closed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reference_month, pj_user_id)
);

ALTER TABLE public.monthly_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Closures view own or manager"
ON public.monthly_closures FOR SELECT
TO authenticated
USING (auth.uid() = pj_user_id OR public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Closures insert by manager"
ON public.monthly_closures FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Closures update by manager"
ON public.monthly_closures FOR UPDATE
TO authenticated
USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Closures delete by manager"
ON public.monthly_closures FOR DELETE
TO authenticated
USING (public.is_admin_or_manager(auth.uid()));

CREATE TRIGGER update_monthly_closures_updated_at
BEFORE UPDATE ON public.monthly_closures
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();