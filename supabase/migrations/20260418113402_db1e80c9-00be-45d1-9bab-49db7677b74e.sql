
-- Attachments table
CREATE TABLE public.attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by UUID,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_task ON public.attachments(task_id);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attachments viewable by authenticated"
  ON public.attachments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Attachments insert as self"
  ON public.attachments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Attachments delete own or manager"
  ON public.attachments FOR DELETE TO authenticated
  USING (auth.uid() = uploaded_by OR public.is_admin_or_manager(auth.uid()));

-- Storage policies for the attachments bucket
CREATE POLICY "Attachments storage read authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments');

CREATE POLICY "Attachments storage insert authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Attachments storage delete own or manager"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin_or_manager(auth.uid()))
  );
