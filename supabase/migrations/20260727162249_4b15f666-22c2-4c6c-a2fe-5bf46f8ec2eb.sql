
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'zones' CHECK (delivery_mode IN ('zones','km')),
  ADD COLUMN IF NOT EXISTS store_address TEXT,
  ADD COLUMN IF NOT EXISTS store_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS store_lng NUMERIC,
  ADD COLUMN IF NOT EXISTS delivery_km_tiers JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE VIEW public.public_store_settings AS
SELECT id, store_name, welcome_message, menu_open, business_hours,
       whatsapp_number, banner_url, banner_enabled,
       delivery_mode, store_address, store_lat, store_lng, delivery_km_tiers
FROM public.store_settings;

GRANT SELECT ON public.public_store_settings TO anon, authenticated;
ALTER VIEW public.public_store_settings SET (security_invoker = true);
