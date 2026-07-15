GRANT EXECUTE ON FUNCTION public.create_online_order(jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_online_order(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_online_order_status(uuid) TO anon, authenticated;