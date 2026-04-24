
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sound_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_select_all" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "chat_insert_own" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "chat_delete_own_or_admin" ON public.chat_messages FOR DELETE TO authenticated USING (auth.uid() = author_id OR public.is_admin_or_manager(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
