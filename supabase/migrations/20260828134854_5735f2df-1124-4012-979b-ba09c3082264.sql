CREATE OR REPLACE FUNCTION public.get_billing_profiles()
RETURNS TABLE(id uuid, cnpj text, legal_name text, pix_key_type text, pix_key text, bank_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.cnpj, p.legal_name, p.pix_key_type, p.pix_key, p.bank_name
  FROM public.profiles p
  WHERE p.id = auth.uid()
     OR public.is_admin_or_manager(auth.uid())
$$;

REVOKE ALL ON FUNCTION public.get_billing_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_profiles() TO authenticated, service_role;

-- Restaura leitura das colunas não sensíveis (e-mail e dados bancários seguem via funções)
GRANT SELECT (id, full_name, avatar_url, job_title, created_at, updated_at, contract_type, sound_enabled) ON public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url, job_title, sound_enabled, cnpj, legal_name, pix_key_type, pix_key, bank_name, contract_type, updated_at) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;