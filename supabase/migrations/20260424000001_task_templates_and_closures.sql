-- Task templates table
CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  default_priority TEXT NOT NULL DEFAULT 'medium',
  default_task_type TEXT NOT NULL DEFAULT 'internal',
  default_estimated_hours NUMERIC(6,2),
  default_service_value NUMERIC(12,2),
  default_tags TEXT[],
  checklist_items TEXT[],
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read templates" ON public.task_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager create templates" ON public.task_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "manager update templates" ON public.task_templates FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "manager delete templates" ON public.task_templates FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()));

-- Monthly closures table
CREATE TABLE IF NOT EXISTS public.monthly_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_month TEXT NOT NULL, -- YYYY-MM
  pj_user_id UUID REFERENCES auth.users(id) NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tasks_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','paid')),
  notes TEXT,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reference_month, pj_user_id)
);
ALTER TABLE public.monthly_closures ENABLE ROW LEVEL SECURITY;
-- Admin/manager: see all
CREATE POLICY "manager view closures" ON public.monthly_closures FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()));
-- PJ: only own
CREATE POLICY "pj view own closures" ON public.monthly_closures FOR SELECT TO authenticated USING (auth.uid() = pj_user_id);
CREATE POLICY "manager manage closures" ON public.monthly_closures FOR ALL TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- Payments: PJ only sees own
DROP POLICY IF EXISTS "pj view own payments" ON public.payments;
CREATE POLICY "pj view own payments" ON public.payments FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager(auth.uid())
    OR beneficiary_user_id = auth.uid()
    OR created_by = auth.uid()
  );
