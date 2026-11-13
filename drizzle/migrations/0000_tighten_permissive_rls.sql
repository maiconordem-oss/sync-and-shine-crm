DROP POLICY IF EXISTS "Projects viewable by authenticated" ON public.projects;
CREATE POLICY "Projects viewable by signed-in" ON public.projects FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Attachments viewable by authenticated" ON public.attachments;
CREATE POLICY "Attachments viewable via task" ON public.attachments FOR SELECT TO authenticated USING (auth.uid() = uploaded_by OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = attachments.task_id));

DROP POLICY IF EXISTS "Templates viewable by authenticated" ON public.task_templates;
CREATE POLICY "Templates viewable by signed-in" ON public.task_templates FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can view task links" ON public.task_links;
CREATE POLICY "Task links viewable via task" ON public.task_links FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_links.task_id));

DROP POLICY IF EXISTS "audit insert authenticated" ON public.task_audit_log;
CREATE POLICY "audit insert as self" ON public.task_audit_log FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

DROP POLICY IF EXISTS "Checklists viewable" ON public.checklists;
CREATE POLICY "Checklists viewable via task" ON public.checklists FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = checklists.task_id));

DROP POLICY IF EXISTS "Presence viewable by authenticated" ON public.user_presence;
CREATE POLICY "Presence viewable by signed-in" ON public.user_presence FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles viewable by signed-in" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Deps viewable" ON public.task_dependencies;
CREATE POLICY "Deps viewable via task" ON public.task_dependencies FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_dependencies.task_id));

DROP POLICY IF EXISTS "Roles viewable by authenticated" ON public.user_roles;
CREATE POLICY "Roles viewable own or manager" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin_or_manager(auth.uid()));

DROP POLICY IF EXISTS "Recurring view by authenticated" ON public.recurring_tasks;
CREATE POLICY "Recurring view involved or manager" ON public.recurring_tasks FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()) OR assignee_id = auth.uid() OR created_by = auth.uid());

DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
CREATE POLICY "avatars_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Attachments read owner task or manager" ON storage.objects;
CREATE POLICY "Attachments read owner task or manager" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'attachments' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.is_admin_or_manager(auth.uid())
    OR EXISTS (SELECT 1 FROM public.attachments a JOIN public.tasks t ON t.id = a.task_id
               WHERE a.storage_path = objects.name AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid()))
  )
);