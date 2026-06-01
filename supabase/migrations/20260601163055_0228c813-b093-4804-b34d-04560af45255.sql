
-- 1) Add 'canceled' to task_status enum
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'canceled';
