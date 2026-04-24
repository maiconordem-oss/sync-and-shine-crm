-- ══════════════════════════════════════════════════════════════
-- Correção de permissões
-- 1. CLT membro vê apenas tarefas atribuídas a ele (não todas)
-- 2. Chat interno restrito a CLT, gestores e admins (não PJ)
-- ══════════════════════════════════════════════════════════════

-- ── Tarefas: CLT vê só as suas ────────────────────────────────
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    -- Admin e gestor veem tudo
    public.is_admin_or_manager(auth.uid())
    -- Qualquer usuário vê tarefas onde é responsável
    OR assignee_id = auth.uid()
    -- Qualquer usuário vê tarefas que ele criou
    OR created_by = auth.uid()
    -- Subtarefas: visíveis se a tarefa pai for visível (via parent_task_id)
    OR EXISTS (
      SELECT 1 FROM public.tasks parent
      WHERE parent.id = parent_task_id
        AND (
          public.is_admin_or_manager(auth.uid())
          OR parent.assignee_id = auth.uid()
          OR parent.created_by = auth.uid()
        )
    )
  );

-- ── Chat: só CLT, gestores e admins ──────────────────────────
DROP POLICY IF EXISTS "chat_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_insert" ON public.chat_messages;

-- Leitura: não-PJ
CREATE POLICY "chat_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager(auth.uid())
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND contract_type = 'pj'
    )
  );

-- Inserção: não-PJ
CREATE POLICY "chat_insert" ON public.chat_messages
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

-- ── Permissões customizadas por papel ─────────────────────────
-- Tabela para que o admin possa configurar o que cada papel vê/faz
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role        TEXT NOT NULL CHECK (role IN ('admin','manager','member','pj')),
  permission  TEXT NOT NULL,  -- ex: 'tasks.create', 'tasks.view_all', 'chat.access'
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID REFERENCES auth.users(id),
  UNIQUE(role, permission)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Só admin lê e escreve
CREATE POLICY "perms_select" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "perms_all" ON public.role_permissions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

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
