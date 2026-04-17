
-- Tighten checklists
DROP POLICY IF EXISTS "Checklists manageable by authenticated" ON public.checklists;
CREATE POLICY "Checklists insert by task editor" ON public.checklists
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
      AND (t.created_by = auth.uid() OR t.assignee_id = auth.uid() OR public.is_admin_or_manager(auth.uid()))
    )
  );
CREATE POLICY "Checklists update by task editor" ON public.checklists
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
      AND (t.created_by = auth.uid() OR t.assignee_id = auth.uid() OR public.is_admin_or_manager(auth.uid()))
    )
  );
CREATE POLICY "Checklists delete by task editor" ON public.checklists
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
      AND (t.created_by = auth.uid() OR t.assignee_id = auth.uid() OR public.is_admin_or_manager(auth.uid()))
    )
  );

-- Tighten notifications inserts
DROP POLICY IF EXISTS "Notifications insert authenticated" ON public.notifications;
CREATE POLICY "Notifications insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_admin_or_manager(auth.uid()));

-- Tighten automation_runs inserts: only manager
DROP POLICY IF EXISTS "Automation runs insert authenticated" ON public.automation_runs;
CREATE POLICY "Automation runs insert by manager" ON public.automation_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
