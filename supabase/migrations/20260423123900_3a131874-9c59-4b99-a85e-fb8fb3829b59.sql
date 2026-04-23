ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS pix_receiver_name text,
  ADD COLUMN IF NOT EXISTS pix_city text;