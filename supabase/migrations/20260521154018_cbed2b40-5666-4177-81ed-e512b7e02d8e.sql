
-- Habilita extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Tabela de mensagens agendadas
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('user','room','all')),
  target_user_id uuid,
  content text NOT NULL,
  recurrence text NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once','daily','weekly','weekdays')),
  scheduled_at timestamptz NOT NULL,
  days_of_week int[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled','done')),
  last_run_at timestamptz,
  run_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sched_msgs_status_time ON public.scheduled_messages(status, scheduled_at);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Scheduled messages admin all" ON public.scheduled_messages;
CREATE POLICY "Scheduled messages admin all"
  ON public.scheduled_messages
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_scheduled_messages_updated_at
  BEFORE UPDATE ON public.scheduled_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Função dispatcher: dispara mensagens com scheduled_at <= now()
CREATE OR REPLACE FUNCTION public.dispatch_scheduled_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  count_sent INTEGER := 0;
  next_at timestamptz;
  next_done boolean;
BEGIN
  FOR r IN
    SELECT * FROM public.scheduled_messages
    WHERE status = 'active' AND scheduled_at <= now()
    ORDER BY scheduled_at ASC
    LIMIT 200
  LOOP
    -- Envia
    IF r.target_kind = 'user' AND r.target_user_id IS NOT NULL THEN
      INSERT INTO public.direct_messages (sender_id, recipient_id, content, kind)
      VALUES (r.created_by, r.target_user_id, r.content, 'text');
    ELSIF r.target_kind IN ('room','all') THEN
      INSERT INTO public.chat_messages (author_id, content)
      VALUES (r.created_by, r.content);
    END IF;

    count_sent := count_sent + 1;

    -- Calcula próxima execução
    next_done := false;
    IF r.recurrence = 'once' THEN
      next_at := r.scheduled_at;
      next_done := true;
    ELSIF r.recurrence = 'daily' THEN
      next_at := r.scheduled_at + interval '1 day';
      WHILE next_at <= now() LOOP next_at := next_at + interval '1 day'; END LOOP;
    ELSIF r.recurrence = 'weekdays' THEN
      next_at := r.scheduled_at + interval '1 day';
      WHILE EXTRACT(DOW FROM next_at) IN (0,6) OR next_at <= now() LOOP
        next_at := next_at + interval '1 day';
      END LOOP;
    ELSIF r.recurrence = 'weekly' THEN
      next_at := r.scheduled_at + interval '7 days';
      WHILE next_at <= now() LOOP next_at := next_at + interval '7 days'; END LOOP;
    ELSE
      next_at := r.scheduled_at;
      next_done := true;
    END IF;

    UPDATE public.scheduled_messages
      SET last_run_at = now(),
          run_count = run_count + 1,
          scheduled_at = next_at,
          status = CASE WHEN next_done THEN 'done' ELSE 'active' END
    WHERE id = r.id;
  END LOOP;

  RETURN count_sent;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_scheduled_messages() FROM PUBLIC, anon, authenticated;

-- Agenda execução a cada minuto (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-scheduled-msgs') THEN
    PERFORM cron.unschedule('dispatch-scheduled-msgs');
  END IF;
  PERFORM cron.schedule(
    'dispatch-scheduled-msgs',
    '* * * * *',
    $cron$ SELECT public.dispatch_scheduled_messages(); $cron$
  );
END$$;
