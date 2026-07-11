
CREATE OR REPLACE FUNCTION public.create_online_order(_order jsonb, _items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number bigint;
  v_status online_order_status;
  v_pm text;
  v_type online_order_type;
  v_zone_id uuid;
  v_zone_fee numeric;
  v_subtotal numeric;
  v_total numeric;
  v_delivery_fee numeric;
  v_items_sum numeric;
  v_name text;
  v_phone text;
BEGIN
  v_name := coalesce(_order->>'customer_name','');
  v_phone := coalesce(_order->>'customer_phone','');
  IF length(v_name) < 1 OR length(v_name) > 120 THEN RAISE EXCEPTION 'nome inválido'; END IF;
  IF length(v_phone) < 1 OR length(v_phone) > 30 THEN RAISE EXCEPTION 'telefone inválido'; END IF;

  v_pm := _order->>'payment_method';
  IF v_pm IS NOT NULL AND v_pm NOT IN ('cash','pix','card_delivery','credit','debit') THEN
    RAISE EXCEPTION 'forma de pagamento inválida';
  END IF;

  v_type := (_order->>'order_type')::online_order_type;
  v_subtotal := coalesce((_order->>'subtotal')::numeric, 0);
  v_total := coalesce((_order->>'total')::numeric, 0);
  v_delivery_fee := coalesce((_order->>'delivery_fee')::numeric, 0);

  IF v_subtotal < 0 OR v_total < 0 OR v_delivery_fee < 0 THEN
    RAISE EXCEPTION 'valores inválidos';
  END IF;

  IF v_type = 'delivery' THEN
    v_zone_id := nullif(_order->>'delivery_zone_id','')::uuid;
    IF v_zone_id IS NULL THEN RAISE EXCEPTION 'zona de entrega obrigatória'; END IF;
    SELECT fee INTO v_zone_fee FROM delivery_zones WHERE id = v_zone_id AND active = true;
    IF v_zone_fee IS NULL THEN RAISE EXCEPTION 'zona de entrega inválida'; END IF;
    IF v_zone_fee <> v_delivery_fee THEN RAISE EXCEPTION 'taxa de entrega divergente'; END IF;
  END IF;

  SELECT COALESCE(SUM((i->>'subtotal')::numeric), 0) INTO v_items_sum
  FROM jsonb_array_elements(_items) i;
  IF round(v_items_sum,2) <> round(v_subtotal,2) THEN
    RAISE EXCEPTION 'subtotal não confere com itens (% vs %)', v_subtotal, v_items_sum;
  END IF;
  IF round(v_total,2) <> round(v_subtotal + v_delivery_fee, 2) THEN
    RAISE EXCEPTION 'total não confere com subtotal+frete';
  END IF;

  v_status := (
    CASE WHEN v_pm IN ('pix','credit','debit') THEN 'pending_payment'
    ELSE 'pending' END
  )::online_order_status;

  INSERT INTO online_orders (
    customer_name, customer_phone, order_type, delivery_zone_id, delivery_zone_name,
    delivery_fee, address_street, address_number, address_complement, address_reference,
    subtotal, total, notes, payment_method, payment_change_for, status
  ) VALUES (
    v_name, v_phone, v_type, v_zone_id, nullif(_order->>'delivery_zone_name',''),
    v_delivery_fee,
    nullif(_order->>'address_street',''), nullif(_order->>'address_number',''),
    nullif(_order->>'address_complement',''), nullif(_order->>'address_reference',''),
    v_subtotal, v_total, nullif(_order->>'notes',''), v_pm,
    nullif(_order->>'payment_change_for','')::numeric, v_status
  )
  RETURNING id, order_number INTO v_id, v_number;

  INSERT INTO online_order_items (online_order_id, product_id, product_name, unit_price, quantity, subtotal)
  SELECT v_id,
         nullif(i->>'product_id','')::uuid,
         i->>'product_name',
         (i->>'unit_price')::numeric,
         (i->>'quantity')::numeric,
         (i->>'subtotal')::numeric
  FROM jsonb_array_elements(_items) i;

  RETURN jsonb_build_object('id', v_id, 'order_number', v_number);
END;
$$;

REVOKE ALL ON FUNCTION public.create_online_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_online_order(jsonb, jsonb) TO anon, authenticated;
