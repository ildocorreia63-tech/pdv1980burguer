
-- 1) Storage: drop the broad public SELECT policy that enables listing.
-- Public buckets still serve files via the public URL endpoint, which does not require this policy.
DROP POLICY IF EXISTS "Public can read product images" ON storage.objects;

-- 2) Revoke EXECUTE from anon/public on SECURITY DEFINER functions not meant for anonymous callers.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_ingredients_for_sale_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_online_order_totals() FROM PUBLIC, anon, authenticated;

-- 3) Ensure the three intentionally public RPCs remain callable by anon (idempotent).
GRANT EXECUTE ON FUNCTION public.create_online_order(jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_online_order(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_online_order_status(uuid) TO anon, authenticated;
