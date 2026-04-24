-- ══════════════════════════════════════════════════════════════════
-- MIGRATION CONSOLIDADA DE PERMISSÕES
-- Remove TODAS as políticas antigas de tasks e aplica as corretas
--
-- Regras de negócio definitivas:
--   Admin / Gestor → vê TODAS as tarefas (todas as colunas kanban)
--   Membro CLT     → vê APENAS tarefas onde é assignee ou created_by
--   Prestador PJ   → vê APENAS tarefas onde é assignee
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Remove TODAS as políticas de SELECT em tasks ───────────────
DROP POLICY IF EXISTS "Tasks viewable by authenticated"  ON public.tasks;
DROP POLICY IF EXISTS "Tasks visible by role"            ON public.tasks;
DROP POLICY IF EXISTS "tasks_select"                     ON public.tasks;
DROP POLICY IF EXISTS "Tasks viewable by team"           ON public.tasks;
DROP POLICY IF EXISTS "tasks select"                     ON public.tasks;

-- ── 2. Política única correta ─────────────────────────────────────
CREATE POLICY "tasks_rls_v3" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    -- Admin: vê tudo
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    -- Responsável: sempre vê suas tarefas (gestor, CLT e PJ)
    OR assignee_id = auth.uid()
    -- Criador: sempre vê o que criou (gestor, CLT)
    OR created_by = auth.uid()
  );

-- ── 3. Chat: bloquear PJ ──────────────────────────────────────────
DROP POLICY IF EXISTS "chat_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_insert" ON public.chat_messages;

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

-- ── 4. Tabela role_permissions (cria se não existir) ──────────────
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role        TEXT NOT NULL CHECK (role IN ('admin','manager','member','pj')),
  permission  TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  UNIQUE(role, permission)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perms_select" ON public.role_permissions;
DROP POLICY IF EXISTS "perms_all"    ON public.role_permissions;

CREATE POLICY "perms_select_v2" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "perms_write_v2" ON public.role_permissions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Valores padrão
INSERT INTO public.role_permissions (role, permission, enabled) VALUES
  ('admin',   'tasks.create',      true),
  ('admin',   'tasks.view_all',    true),
  ('admin',   'tasks.delete_any',  true),
  ('admin',   'tasks.approve',     true),
  ('admin',   'chat.access',       true),
  ('admin',   'payments.manage',   true),
  ('admin',   'reports.view_all',  true),
  ('admin',   'automations.edit',  true),
  ('admin',   'members.manage',    true),
  ('manager', 'tasks.create',      true),
  ('manager', 'tasks.view_all',    true),
  ('manager', 'tasks.delete_any',  true),
  ('manager', 'tasks.approve',     true),
  ('manager', 'chat.access',       true),
  ('manager', 'payments.manage',   true),
  ('manager', 'reports.view_all',  true),
  ('manager', 'automations.edit',  true),
  ('manager', 'members.manage',    false),
  ('member',  'tasks.create',      true),
  ('member',  'tasks.view_all',    false),
  ('member',  'tasks.delete_any',  false),
  ('member',  'tasks.approve',     false),
  ('member',  'chat.access',       true),
  ('member',  'payments.manage',   false),
  ('member',  'reports.view_all',  false),
  ('member',  'automations.edit',  false),
  ('member',  'members.manage',    false),
  ('pj',      'tasks.create',      false),
  ('pj',      'tasks.view_all',    false),
  ('pj',      'tasks.delete_any',  false),
  ('pj',      'tasks.approve',     false),
  ('pj',      'chat.access',       false),
  ('pj',      'payments.manage',   false),
  ('pj',      'reports.view_all',  false),
  ('pj',      'automations.edit',  false),
  ('pj',      'members.manage',    false)
ON CONFLICT (role, permission) DO NOTHING;

-- ── 5. task_history (cria se não existir) ────────────────────────
CREATE TABLE IF NOT EXISTS public.task_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  field       TEXT,
  old_value   TEXT,
  new_value   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_history_task ON public.task_history(task_id);
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "history_select" ON public.task_history;
DROP POLICY IF EXISTS "history_insert" ON public.task_history;
CREATE POLICY "history_select_v2" ON public.task_history FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())
    )
  );
CREATE POLICY "history_insert_v2" ON public.task_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── 6. task_links (cria se não existir) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.task_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  title      TEXT,
  added_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_links_task ON public.task_links(task_id);
ALTER TABLE public.task_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "links_select" ON public.task_links;
DROP POLICY IF EXISTS "links_insert" ON public.task_links;
DROP POLICY IF EXISTS "links_delete" ON public.task_links;
CREATE POLICY "links_select_v2" ON public.task_links FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid())
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())));
CREATE POLICY "links_insert_v2" ON public.task_links FOR INSERT TO authenticated WITH CHECK (auth.uid() = added_by);
CREATE POLICY "links_delete_v2" ON public.task_links FOR DELETE TO authenticated
  USING (auth.uid() = added_by OR public.is_admin_or_manager(auth.uid()));

-- ── 7. monthly_closures (cria se não existir) ────────────────────
CREATE TABLE IF NOT EXISTS public.monthly_closures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_month TEXT NOT NULL,
  pj_user_id      UUID REFERENCES auth.users(id) NOT NULL,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  tasks_count     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','paid')),
  notes           TEXT,
  closed_at       TIMESTAMPTZ,
  closed_by       UUID REFERENCES auth.users(id),
  paid_at         TIMESTAMPTZ,
  paid_by         UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reference_month, pj_user_id)
);
ALTER TABLE public.monthly_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manager view closures" ON public.monthly_closures;
DROP POLICY IF EXISTS "pj view own closures"  ON public.monthly_closures;
DROP POLICY IF EXISTS "manager manage closures" ON public.monthly_closures;
CREATE POLICY "closures_manager" ON public.monthly_closures FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "closures_pj_own" ON public.monthly_closures FOR SELECT TO authenticated
  USING (auth.uid() = pj_user_id);

-- ── 8. Realtime para notificações ────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ── 9. sound_enabled no perfil ───────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='sound_enabled') THEN
    ALTER TABLE public.profiles ADD COLUMN sound_enabled BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- ── 10. Campos de aprovação nas tasks ────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS approved_by   UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_note   TEXT;

-- ── 11. Unique index pagamentos (evita duplicatas) ────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_task_beneficiary_pending
  ON public.payments (task_id, beneficiary_user_id)
  WHERE status = 'pending' AND task_id IS NOT NULL AND beneficiary_user_id IS NOT NULL;
