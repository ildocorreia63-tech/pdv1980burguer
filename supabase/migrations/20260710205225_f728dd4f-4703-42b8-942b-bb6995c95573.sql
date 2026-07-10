
-- Missing GRANTs blocking anon/authenticated from inserting online orders
GRANT INSERT, SELECT ON public.online_orders TO anon, authenticated;
GRANT INSERT, SELECT ON public.online_order_items TO anon, authenticated;
GRANT UPDATE, DELETE ON public.online_orders TO authenticated;
GRANT UPDATE, DELETE ON public.online_order_items TO authenticated;
GRANT ALL ON public.online_orders TO service_role;
GRANT ALL ON public.online_order_items TO service_role;

-- Allow anon to read back their just-created order (needed for .select after insert)
CREATE POLICY "Public read recent pending online orders"
ON public.online_orders FOR SELECT TO anon, authenticated
USING (
  accepted_by IS NULL
  AND sale_id IS NULL
  AND created_at > (now() - interval '15 minutes')
);

CREATE POLICY "Public read items of recent pending online orders"
ON public.online_order_items FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.online_orders o
    WHERE o.id = online_order_items.online_order_id
      AND o.accepted_by IS NULL
      AND o.sale_id IS NULL
      AND o.created_at > (now() - interval '15 minutes')
  )
);
