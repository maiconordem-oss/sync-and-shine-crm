ALTER FUNCTION public.block_done_on_canceled() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.auto_create_payment_on_done() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_service_value_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_task_cancellation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_external_task_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_scheduled_messages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_tasks_for_today() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dispatch_scheduled_messages() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_recurring_tasks_for_today() TO service_role;