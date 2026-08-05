DROP POLICY IF EXISTS "Authenticated can view cash_movements" ON public.cash_movements;
CREATE POLICY "Staff can view cash_movements"
ON public.cash_movements
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operator'));

DROP POLICY IF EXISTS "Authenticated can view cash_registers" ON public.cash_registers;
CREATE POLICY "Staff can view cash_registers"
ON public.cash_registers
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operator'));

DROP POLICY IF EXISTS "Authenticated can update cash_registers" ON public.cash_registers;
CREATE POLICY "Staff can update cash_registers"
ON public.cash_registers
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operator'))
WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operator'));

CREATE OR REPLACE FUNCTION public.get_public_store_settings()
RETURNS TABLE (
  id uuid,
  store_name text,
  logo_url text,
  banner_url text,
  banner_enabled boolean,
  welcome_message text,
  whatsapp_number text,
  business_hours jsonb,
  menu_open boolean,
  delivery_mode text,
  delivery_km_tiers jsonb,
  store_address text,
  store_lat numeric,
  store_lng numeric,
  min_order_value numeric,
  show_min_order boolean,
  rating numeric,
  show_rating boolean,
  show_whatsapp_link boolean,
  show_login_button boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.store_name, s.logo_url, s.banner_url, s.banner_enabled,
    s.welcome_message, s.whatsapp_number, s.business_hours, s.menu_open,
    s.delivery_mode, s.delivery_km_tiers, s.store_address, s.store_lat,
    s.store_lng, s.min_order_value, s.show_min_order, s.rating,
    s.show_rating, s.show_whatsapp_link, s.show_login_button
  FROM public.store_settings AS s
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_public_store_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_store_settings() TO anon, authenticated, service_role;

DROP VIEW IF EXISTS public.public_store_settings;
CREATE VIEW public.public_store_settings
WITH (security_invoker = true)
AS
SELECT * FROM public.get_public_store_settings();

GRANT SELECT ON public.public_store_settings TO anon, authenticated;
GRANT ALL ON public.public_store_settings TO service_role;

CREATE INDEX IF NOT EXISTS idx_sales_customer_created_at
ON public.sales (customer_id, created_at DESC)
WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
ON public.sale_items (sale_id);