-- ══════════════════════════════════════════════════════
-- Corrige pagamentos duplicados criados por automações
-- ══════════════════════════════════════════════════════

-- 1. Cancela todos os pagamentos com amount=0 (criados incorretamente)
UPDATE public.payments
SET status = 'cancelled'
WHERE amount = 0 AND status != 'cancelled';

-- 2. Para task_id com múltiplos pagamentos pendentes do mesmo beneficiário,
--    mantém apenas o mais recente e cancela os demais
UPDATE public.payments p1
SET status = 'cancelled'
WHERE p1.status = 'pending'
  AND p1.task_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.payments p2
    WHERE p2.task_id = p1.task_id
      AND p2.beneficiary_user_id = p1.beneficiary_user_id
      AND p2.status = 'pending'
      AND p2.created_at > p1.created_at  -- mais recente existe
  );

-- 3. Índice para evitar futuros duplicados: um pagamento pendente por tarefa+beneficiário
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_task_beneficiary_pending
  ON public.payments (task_id, beneficiary_user_id)
  WHERE status = 'pending' AND task_id IS NOT NULL AND beneficiary_user_id IS NOT NULL;

-- 4. Remover os pagamentos cancelados com amount=0 que só poluem
DELETE FROM public.payments
WHERE status = 'cancelled' AND amount = 0;
