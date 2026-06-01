
-- 1) CUSTOMERS: restrict SELECT to staff (admin or operator)
DROP POLICY IF EXISTS "Customers readable" ON public.customers;
CREATE POLICY "Staff read customers" ON public.customers
FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'));

DROP POLICY IF EXISTS "Authenticated insert customers" ON public.customers;
CREATE POLICY "Staff insert customers" ON public.customers
FOR INSERT TO authenticated
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'));

DROP POLICY IF EXISTS "Authenticated update customers" ON public.customers;
CREATE POLICY "Staff update customers" ON public.customers
FOR UPDATE TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'));

-- 2) STORE_SETTINGS: hide PIX/whatsapp sensitive fields from anon; expose public-safe fields via a view
DROP POLICY IF EXISTS "Store settings public read" ON public.store_settings;
CREATE POLICY "Store settings staff read" ON public.store_settings
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE VIEW public.public_store_settings
WITH (security_invoker = true) AS
SELECT id, store_name, welcome_message, menu_open, business_hours, whatsapp_number
FROM public.store_settings;

GRANT SELECT ON public.public_store_settings TO anon, authenticated;

-- 3) ONLINE_ORDERS: validate public INSERT
DROP POLICY IF EXISTS "Anyone can create online orders" ON public.online_orders;
CREATE POLICY "Public create online orders validated" ON public.online_orders
FOR INSERT TO anon, authenticated
WITH CHECK (
  status IN ('pending', 'pending_payment')
  AND accepted_by IS NULL
  AND accepted_at IS NULL
  AND sale_id IS NULL
  AND payment_confirmed_at IS NULL
  AND asaas_payment_id IS NULL
  AND asaas_invoice_url IS NULL
  AND (payment_method IS NULL OR payment_method IN ('cash','pix','card_delivery'))
  AND length(customer_name) BETWEEN 1 AND 120
  AND length(customer_phone) BETWEEN 1 AND 30
  AND subtotal >= 0 AND total >= 0 AND delivery_fee >= 0
  AND (
    order_type = 'pickup'
    OR (
      order_type = 'delivery'
      AND delivery_zone_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.delivery_zones dz
        WHERE dz.id = online_orders.delivery_zone_id
          AND dz.active = true
          AND dz.fee = online_orders.delivery_fee
      )
    )
  )
);

-- 4) ONLINE_ORDER_ITEMS: only allow inserts for orders not yet processed, and price must match product
DROP POLICY IF EXISTS "Anyone can create online order items" ON public.online_order_items;
CREATE POLICY "Public create online order items validated" ON public.online_order_items
FOR INSERT TO anon, authenticated
WITH CHECK (
  quantity > 0
  AND unit_price >= 0
  AND subtotal >= 0
  AND EXISTS (
    SELECT 1 FROM public.online_orders o
    WHERE o.id = online_order_items.online_order_id
      AND o.accepted_by IS NULL
      AND o.sale_id IS NULL
      AND o.payment_confirmed_at IS NULL
      AND o.created_at > now() - interval '10 minutes'
  )
  AND (
    product_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = online_order_items.product_id
        AND p.price = online_order_items.unit_price
    )
  )
);

-- 5) STORAGE: remove broad public listing on product-images; public CDN URLs still serve files
DROP POLICY IF EXISTS "Product images public read" ON storage.objects;
CREATE POLICY "Admins list product images" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND is_admin(auth.uid()));

-- 6) SECURITY DEFINER functions: revoke EXECUTE from anon/public; trigger functions revoke from authenticated too
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- 7) REALTIME: restrict realtime.messages subscriptions to authenticated staff
DO $$
BEGIN
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP POLICY IF EXISTS "Staff realtime access" ON realtime.messages;
CREATE POLICY "Staff realtime access" ON realtime.messages
FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'));
