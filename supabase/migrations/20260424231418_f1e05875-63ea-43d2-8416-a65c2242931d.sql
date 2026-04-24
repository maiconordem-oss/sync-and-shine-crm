
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role text NOT NULL,
  permission text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(role, permission)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Role permissions viewable by authenticated"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Role permissions insert by admin"
  ON public.role_permissions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Role permissions update by admin"
  ON public.role_permissions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Role permissions delete by admin"
  ON public.role_permissions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default permissions
INSERT INTO public.role_permissions (role, permission, enabled) VALUES
  ('admin','tasks.create',true),('admin','tasks.view_all',true),('admin','tasks.delete_any',true),('admin','tasks.approve',true),('admin','chat.access',true),('admin','payments.manage',true),('admin','reports.view_all',true),('admin','automations.edit',true),('admin','members.manage',true),
  ('manager','tasks.create',true),('manager','tasks.view_all',true),('manager','tasks.delete_any',true),('manager','tasks.approve',true),('manager','chat.access',true),('manager','payments.manage',true),('manager','reports.view_all',true),('manager','automations.edit',true),('manager','members.manage',false),
  ('member','tasks.create',true),('member','tasks.view_all',false),('member','tasks.delete_any',false),('member','tasks.approve',false),('member','chat.access',true),('member','payments.manage',false),('member','reports.view_all',false),('member','automations.edit',false),('member','members.manage',false),
  ('pj','tasks.create',false),('pj','tasks.view_all',false),('pj','tasks.delete_any',false),('pj','tasks.approve',false),('pj','chat.access',false),('pj','payments.manage',false),('pj','reports.view_all',false),('pj','automations.edit',false),('pj','members.manage',false)
ON CONFLICT (role, permission) DO NOTHING;
