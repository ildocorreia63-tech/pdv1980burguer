
-- 1) Remove políticas públicas amplas que expõem PII de todos os pedidos recentes
DROP POLICY IF EXISTS "Public read own online order by id" ON public.online_orders;
DROP POLICY IF EXISTS "Public read items of own online order" ON public.online_order_items;

-- 2) RPC segura: retorna somente o pedido específico + itens quando o cliente informa o id (UUID ~128 bits, não-enumerável)
CREATE OR REPLACE FUNCTION public.get_online_order(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order jsonb;
  v_items jsonb;
BEGIN
  SELECT to_jsonb(o) - 'asaas_api_response' INTO v_order
  FROM public.online_orders o
  WHERE o.id = _id
    AND o.created_at > now() - interval '30 days';

  IF v_order IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb) INTO v_items
  FROM public.online_order_items i
  WHERE i.online_order_id = _id;

  RETURN jsonb_build_object('order', v_order, 'items', v_items);
END;
$$;

-- 3) RPC leve para polling de status (sem PII)
CREATE OR REPLACE FUNCTION public.get_online_order_status(_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'status', status,
    'payment_confirmed_at', payment_confirmed_at,
    'cancellation_reason', cancellation_reason,
    'cancelled_at', cancelled_at,
    'accepted_at', accepted_at,
    'sale_id', sale_id
  )
  FROM public.online_orders
  WHERE id = _id
    AND created_at > now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.get_online_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_online_order_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_online_order(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_online_order_status(uuid) TO anon, authenticated;

-- 4) Hardening: revogar EXECUTE público de funções SECURITY DEFINER que são apenas triggers
REVOKE ALL ON FUNCTION public.consume_ingredients_for_sale_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_online_order_totals() FROM PUBLIC, anon, authenticated;
