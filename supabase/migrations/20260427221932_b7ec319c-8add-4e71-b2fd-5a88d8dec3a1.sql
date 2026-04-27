DROP POLICY IF EXISTS "tasks_update_v2" ON public.tasks;

CREATE POLICY "tasks_update_v3"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  auth.uid() = created_by
  OR auth.uid() = assignee_id
  OR public.is_admin_or_manager(auth.uid())
);