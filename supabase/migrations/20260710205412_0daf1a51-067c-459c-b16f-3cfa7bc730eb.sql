
DROP POLICY IF EXISTS "Public read recent pending online orders" ON public.online_orders;
DROP POLICY IF EXISTS "Public read items of recent pending online orders" ON public.online_order_items;

CREATE POLICY "Public read own online order by id"
ON public.online_orders FOR SELECT TO anon, authenticated
USING (created_at > (now() - interval '7 days'));

CREATE POLICY "Public read items of own online order"
ON public.online_order_items FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.online_orders o
    WHERE o.id = online_order_items.online_order_id
      AND o.created_at > (now() - interval '7 days')
  )
);

ALTER TABLE public.online_orders REPLICA IDENTITY FULL;
