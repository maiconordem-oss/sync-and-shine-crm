-- ── 1. Tasks SELECT policy ─────────────────────────────────────
DROP POLICY IF EXISTS "Tasks viewable by authenticated"  ON public.tasks;
DROP POLICY IF EXISTS "Tasks visible by role"            ON public.tasks;
DROP POLICY IF EXISTS "tasks_select"                     ON public.tasks;
DROP POLICY IF EXISTS "Tasks viewable by team"           ON public.tasks;
DROP POLICY IF EXISTS "tasks select"                     ON public.tasks;
DROP POLICY IF EXISTS "tasks_rls_v3"                     ON public.tasks;

CREATE POLICY "tasks_rls_v3" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR assignee_id = auth.uid()
    OR created_by = auth.uid()
  );

-- ── 2. Chat: bloquear PJ ──────────────────────────────────────────
DROP POLICY IF EXISTS "chat_select"        ON public.chat_messages;
DROP POLICY IF EXISTS "chat_insert"        ON public.chat_messages;
DROP POLICY IF EXISTS "chat_select_all"    ON public.chat_messages;
DROP POLICY IF EXISTS "chat_insert_own"    ON public.chat_messages;
DROP POLICY IF EXISTS "chat_select_v2"     ON public.chat_messages;
DROP POLICY IF EXISTS "chat_insert_v2"     ON public.chat_messages;

CREATE POLICY "chat_select_v2" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager(auth.uid())
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND contract_type = 'pj'
    )
  );

CREATE POLICY "chat_insert_v2" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND (
      public.is_admin_or_manager(auth.uid())
      OR NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND contract_type = 'pj'
      )
    )
  );

-- ── 3. role_permissions policies ──────────────────────────────────
DROP POLICY IF EXISTS "Role permissions viewable by authenticated" ON public.role_permissions;
DROP POLICY IF EXISTS "Role permissions insert by admin"           ON public.role_permissions;
DROP POLICY IF EXISTS "Role permissions update by admin"           ON public.role_permissions;
DROP POLICY IF EXISTS "Role permissions delete by admin"           ON public.role_permissions;
DROP POLICY IF EXISTS "perms_select_v2" ON public.role_permissions;
DROP POLICY IF EXISTS "perms_write_v2"  ON public.role_permissions;

CREATE POLICY "perms_select_v2" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "perms_write_v2" ON public.role_permissions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ── 4. Approval fields on tasks ───────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS approved_by   UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_note   TEXT;

-- ── 5. Unique index payments ──────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_task_beneficiary_pending
  ON public.payments (task_id, beneficiary_user_id)
  WHERE status = 'pending' AND task_id IS NOT NULL AND beneficiary_user_id IS NOT NULL;

-- ── 6. Realtime para notifications ────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;