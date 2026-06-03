
-- 1) Restrict store_settings read to admins only (contains PIX key)
DROP POLICY IF EXISTS "Store settings staff read" ON public.store_settings;
CREATE POLICY "Admins read store settings"
ON public.store_settings
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- 2) Restrict online_orders read to staff only (admin or operator)
DROP POLICY IF EXISTS "Authenticated read online orders" ON public.online_orders;
CREATE POLICY "Staff read online orders"
ON public.online_orders
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'::app_role));

DROP POLICY IF EXISTS "Authenticated read online order items" ON public.online_order_items;
CREATE POLICY "Staff read online order items"
ON public.online_order_items
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'::app_role));

-- 3) Enforce subtotal = quantity * unit_price on public order item inserts
DROP POLICY IF EXISTS "Public create online order items validated" ON public.online_order_items;
CREATE POLICY "Public create online order items validated"
ON public.online_order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  quantity > 0
  AND unit_price >= 0
  AND subtotal >= 0
  AND subtotal = round((quantity * unit_price)::numeric, 2)
  AND EXISTS (
    SELECT 1 FROM online_orders o
    WHERE o.id = online_order_items.online_order_id
      AND o.accepted_by IS NULL
      AND o.sale_id IS NULL
      AND o.payment_confirmed_at IS NULL
      AND o.created_at > (now() - interval '10 minutes')
  )
  AND (
    product_id IS NULL
    OR EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = online_order_items.product_id
        AND p.price = online_order_items.unit_price
    )
  )
);
