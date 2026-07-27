
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'menu',
  ADD COLUMN IF NOT EXISTS external_platform TEXT,
  ADD COLUMN IF NOT EXISTS external_order_id TEXT,
  ADD COLUMN IF NOT EXISTS external_payload JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS online_orders_external_unique
  ON public.online_orders (external_platform, external_order_id)
  WHERE external_platform IS NOT NULL AND external_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS online_orders_source_idx ON public.online_orders (source);
