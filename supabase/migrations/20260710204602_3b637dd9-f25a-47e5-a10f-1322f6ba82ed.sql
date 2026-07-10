-- Lock down trigger-only SECURITY DEFINER functions from being invoked directly by clients.
REVOKE EXECUTE ON FUNCTION public.consume_ingredients_for_sale_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_online_order_totals() FROM PUBLIC, anon, authenticated;