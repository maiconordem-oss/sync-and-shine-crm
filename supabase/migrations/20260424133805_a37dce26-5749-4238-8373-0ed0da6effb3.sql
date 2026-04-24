ALTER TABLE public.monthly_closures
  ADD COLUMN closed_by UUID,
  ADD COLUMN paid_by UUID;