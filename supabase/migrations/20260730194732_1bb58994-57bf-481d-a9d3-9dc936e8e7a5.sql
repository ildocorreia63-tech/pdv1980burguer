ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS min_order_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_min_order boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rating numeric NOT NULL DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS show_rating boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_whatsapp_link boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_login_button boolean NOT NULL DEFAULT true;

DROP VIEW IF EXISTS public.public_store_settings;

CREATE VIEW public.public_store_settings
WITH (security_invoker = false) AS
SELECT
  id, store_name, logo_url, banner_url, banner_enabled, welcome_message,
  whatsapp_number, business_hours, menu_open, delivery_mode, delivery_km_tiers,
  store_address, store_lat, store_lng,
  min_order_value, show_min_order, rating, show_rating,
  show_whatsapp_link, show_login_button
FROM public.store_settings;

GRANT SELECT ON public.public_store_settings TO anon, authenticated;