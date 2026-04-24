-- Add new status value for pending payment
ALTER TYPE public.online_order_status ADD VALUE IF NOT EXISTS 'pending_payment';

-- Add Asaas integration columns
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_invoice_url text,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_online_orders_asaas_payment_id 
  ON public.online_orders(asaas_payment_id) 
  WHERE asaas_payment_id IS NOT NULL;