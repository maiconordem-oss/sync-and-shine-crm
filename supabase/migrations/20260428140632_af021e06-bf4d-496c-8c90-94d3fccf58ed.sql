-- Tabela de modelos de tarefas recorrentes (mensal)
CREATE TABLE public.recurring_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID,
  assignee_id UUID,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  task_type public.task_type NOT NULL DEFAULT 'internal',
  service_value NUMERIC,
  day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  due_offset_days INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  last_generated_month TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recurring view by authenticated"
ON public.recurring_tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recurring insert by manager"
ON public.recurring_tasks FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_manager(auth.uid()) AND auth.uid() = created_by);

CREATE POLICY "Recurring update by manager"
ON public.recurring_tasks FOR UPDATE TO authenticated
USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Recurring delete by manager"
ON public.recurring_tasks FOR DELETE TO authenticated
USING (public.is_admin_or_manager(auth.uid()));

CREATE TRIGGER update_recurring_tasks_updated_at
BEFORE UPDATE ON public.recurring_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função geradora: cria tarefas para hoje quando day_of_month casa
CREATE OR REPLACE FUNCTION public.generate_recurring_tasks_for_today()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  current_month TEXT := to_char(CURRENT_DATE, 'YYYY-MM');
  today_day INTEGER := EXTRACT(DAY FROM CURRENT_DATE)::INTEGER;
  last_day INTEGER := EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'))::INTEGER;
  effective_day INTEGER;
  count_created INTEGER := 0;
BEGIN
  FOR r IN SELECT * FROM public.recurring_tasks WHERE active = true LOOP
    -- se o dia configurado é maior que o último dia do mês, usar o último dia
    effective_day := LEAST(r.day_of_month, last_day);

    IF today_day = effective_day AND (r.last_generated_month IS DISTINCT FROM current_month) THEN
      INSERT INTO public.tasks (
        title, description, project_id, assignee_id, priority, status,
        due_date, created_by, task_type, service_value
      ) VALUES (
        r.title, r.description, r.project_id, r.assignee_id, r.priority, 'new',
        (CURRENT_DATE + (r.due_offset_days || ' days')::INTERVAL),
        COALESCE(r.created_by, r.assignee_id),
        r.task_type, r.service_value
      );

      UPDATE public.recurring_tasks SET last_generated_month = current_month WHERE id = r.id;
      count_created := count_created + 1;
    END IF;
  END LOOP;

  RETURN count_created;
END;
$$;