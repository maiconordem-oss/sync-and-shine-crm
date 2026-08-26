-- 1) Storage: attachments
DROP POLICY IF EXISTS "Attachments upload authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Attachments view authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Attachments storage read authenticated" ON storage.objects;

CREATE POLICY "Attachments read owner task or manager"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attachments'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_admin_or_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.attachments a
      JOIN public.tasks t ON t.id = a.task_id
      WHERE a.storage_path = storage.objects.name
    )
  )
);

-- 2) Storage: avatars update ownership
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
CREATE POLICY "avatars_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 3) time_entries select scoping
DROP POLICY IF EXISTS "Time entries viewable by authenticated" ON public.time_entries;
CREATE POLICY "Time entries viewable by owner task or manager"
ON public.time_entries FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin_or_manager(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = time_entries.task_id
      AND (t.assignee_id = auth.uid() OR t.created_by = auth.uid())
  )
);

-- 4) profiles: hide email column from generic reads
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, avatar_url, job_title, contract_type, sound_enabled, created_at, updated_at)
  ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.get_profile_emails()
RETURNS TABLE(id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.email
  FROM public.profiles p
  WHERE p.id = auth.uid()
     OR public.is_admin_or_manager(auth.uid())
$$;

REVOKE ALL ON FUNCTION public.get_profile_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_emails() TO authenticated;

-- 5) revoke anon execution on security definer helpers
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.is_admin_or_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_done_on_canceled() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_pj_tasks_for_report(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pj_tasks_for_report(timestamptz, timestamptz) TO authenticated;