-- Add weekly recurrence support
ALTER TABLE public.recurring_tasks
  ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS days_of_week INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_generated_date DATE;

ALTER TABLE public.recurring_tasks
  DROP CONSTRAINT IF EXISTS recurring_tasks_frequency_check;
ALTER TABLE public.recurring_tasks
  ADD CONSTRAINT recurring_tasks_frequency_check CHECK (frequency IN ('monthly','weekly'));

-- Make day_of_month nullable (only required for monthly)
ALTER TABLE public.recurring_tasks ALTER COLUMN day_of_month DROP NOT NULL;

-- Update generator function to support weekly + monthly
CREATE OR REPLACE FUNCTION public.generate_recurring_tasks_for_today()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  current_month TEXT := to_char(CURRENT_DATE, 'YYYY-MM');
  today_day INTEGER := EXTRACT(DAY FROM CURRENT_DATE)::INTEGER;
  today_dow INTEGER := EXTRACT(DOW FROM CURRENT_DATE)::INTEGER; -- 0=domingo .. 6=sábado
  last_day INTEGER := EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'))::INTEGER;
  effective_day INTEGER;
  should_create BOOLEAN;
  count_created INTEGER := 0;
BEGIN
  FOR r IN SELECT * FROM public.recurring_tasks WHERE active = true LOOP
    should_create := false;

    IF r.frequency = 'monthly' THEN
      effective_day := LEAST(COALESCE(r.day_of_month, 1), last_day);
      IF today_day = effective_day AND (r.last_generated_month IS DISTINCT FROM current_month) THEN
        should_create := true;
      END IF;

    ELSIF r.frequency = 'weekly' THEN
      IF r.days_of_week IS NOT NULL
         AND today_dow = ANY(r.days_of_week)
         AND (r.last_generated_date IS DISTINCT FROM CURRENT_DATE) THEN
        should_create := true;
      END IF;
    END IF;

    IF should_create THEN
      INSERT INTO public.tasks (
        title, description, project_id, assignee_id, priority, status,
        due_date, created_by, task_type, service_value
      ) VALUES (
        r.title, r.description, r.project_id, r.assignee_id, r.priority, 'new',
        (CURRENT_DATE + (r.due_offset_days || ' days')::INTERVAL),
        COALESCE(r.created_by, r.assignee_id),
        r.task_type, r.service_value
      );

      IF r.frequency = 'monthly' THEN
        UPDATE public.recurring_tasks SET last_generated_month = current_month WHERE id = r.id;
      ELSE
        UPDATE public.recurring_tasks SET last_generated_date = CURRENT_DATE WHERE id = r.id;
      END IF;
      count_created := count_created + 1;
    END IF;
  END LOOP;

  RETURN count_created;
END;
$function$;