
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'member');
CREATE TYPE public.task_status AS ENUM ('new', 'in_progress', 'waiting', 'done', 'deferred');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'cancelled');
CREATE TYPE public.notification_type AS ENUM ('assigned', 'mentioned', 'status_changed', 'due_soon', 'overdue', 'comment', 'automation');

-- ============ UTIL FUNCTION ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  job_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','manager')
  )
$$;

-- ============ PROJECTS ============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TASKS ============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  status public.task_status NOT NULL DEFAULT 'new',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  estimated_hours NUMERIC(10,2),
  tags TEXT[] DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_project ON public.tasks(project_id);
CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TASK DEPENDENCIES ============
CREATE TABLE public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  blocked_by_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, blocked_by_task_id)
);
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

-- ============ CHECKLISTS ============
CREATE TABLE public.checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

-- ============ COMMENTS ============
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- ============ TIME ENTRIES ============
CREATE TABLE public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notifications_user ON public.notifications(user_id, read);

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  beneficiary_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  beneficiary_name TEXT,
  status public.payment_status NOT NULL DEFAULT 'pending',
  due_date DATE,
  paid_date DATE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  receipt_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AUTOMATIONS ============
CREATE TABLE public.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_automations_updated BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  trigger_payload JSONB,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

-- ============ AUTO-CREATE PROFILE & FIRST USER = ADMIN ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============

-- profiles
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins update any profile" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "Roles viewable by authenticated" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- projects
CREATE POLICY "Projects viewable by authenticated" ON public.projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers create projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Managers update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins delete projects" ON public.projects
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- tasks
CREATE POLICY "Tasks viewable by authenticated" ON public.tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Update own/assigned or manager" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = created_by
    OR auth.uid() = assignee_id
    OR public.is_admin_or_manager(auth.uid())
  );
CREATE POLICY "Manager delete tasks" ON public.tasks
  FOR DELETE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()) OR auth.uid() = created_by);

-- task_dependencies
CREATE POLICY "Deps viewable" ON public.task_dependencies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Deps manageable by manager" ON public.task_dependencies
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- checklists
CREATE POLICY "Checklists viewable" ON public.checklists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Checklists manageable by authenticated" ON public.checklists
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- comments
CREATE POLICY "Comments viewable" ON public.comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Comments insert as self" ON public.comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Comments delete own or manager" ON public.comments
  FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.is_admin_or_manager(auth.uid()));

-- time_entries
CREATE POLICY "Time entries viewable by authenticated" ON public.time_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Time entries insert own" ON public.time_entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Time entries update own" ON public.time_entries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Time entries delete own or manager" ON public.time_entries
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin_or_manager(auth.uid()));

-- notifications
CREATE POLICY "Notifications view own" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Notifications update own" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Notifications insert authenticated" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- payments
CREATE POLICY "Payments view own or manager" ON public.payments
  FOR SELECT TO authenticated
  USING (
    auth.uid() = beneficiary_user_id
    OR auth.uid() = created_by
    OR public.is_admin_or_manager(auth.uid())
  );
CREATE POLICY "Payments insert by manager" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Payments update by manager" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Payments delete by admin" ON public.payments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- automations
CREATE POLICY "Automations view by manager" ON public.automations
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Automations manage by manager" ON public.automations
  FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Automation runs view by manager" ON public.automation_runs
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Automation runs insert authenticated" ON public.automation_runs
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============ STORAGE BUCKET para anexos/comprovantes ============
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Attachments view authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'attachments');
CREATE POLICY "Attachments upload authenticated" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attachments');
CREATE POLICY "Attachments update own" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Attachments delete own" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
