CREATE OR REPLACE VIEW public.public_store_settings AS
SELECT id, store_name, welcome_message, menu_open, business_hours, whatsapp_number, banner_url, banner_enabled
FROM public.store_settings;
GRANT SELECT ON public.public_store_settings TO anon, authenticated;