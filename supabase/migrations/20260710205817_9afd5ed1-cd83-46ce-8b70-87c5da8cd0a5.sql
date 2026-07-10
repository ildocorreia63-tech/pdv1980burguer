
-- Restore Data API grants that were missing (cause of "pedidos não aparecem")
GRANT SELECT, INSERT ON public.online_orders TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_orders TO authenticated;
GRANT ALL ON public.online_orders TO service_role;

GRANT SELECT, INSERT ON public.online_order_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_order_items TO authenticated;
GRANT ALL ON public.online_order_items TO service_role;

GRANT SELECT ON public.delivery_zones TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;
GRANT ALL ON public.delivery_zones TO service_role;

GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;

-- Restore grants on all remaining public tables used by the app
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredients TO authenticated;
GRANT ALL ON public.ingredients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredient_movements TO authenticated;
GRANT ALL ON public.ingredient_movements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_recipes TO authenticated;
GRANT ALL ON public.product_recipes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
