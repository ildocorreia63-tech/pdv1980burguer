DROP VIEW IF EXISTS public.public_store_settings;
CREATE VIEW public.public_store_settings
WITH (security_invoker = false) AS
SELECT id, store_name, welcome_message, menu_open, business_hours, whatsapp_number,
       banner_url, banner_enabled, logo_url, delivery_mode, store_address,
       store_lat, store_lng, delivery_km_tiers
FROM public.store_settings;

GRANT SELECT ON public.public_store_settings TO anon, authenticated;