
GRANT INSERT ON public.online_orders TO anon, authenticated;
GRANT INSERT ON public.online_order_items TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.online_orders TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.online_order_items TO authenticated;
GRANT ALL ON public.online_orders TO service_role;
GRANT ALL ON public.online_order_items TO service_role;
GRANT SELECT ON public.delivery_zones TO anon, authenticated;
GRANT ALL ON public.delivery_zones TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
