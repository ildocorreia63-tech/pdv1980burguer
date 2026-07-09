CREATE OR REPLACE FUNCTION public.validate_online_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order online_orders%ROWTYPE;
  v_items_sum numeric;
  v_expected_total numeric;
BEGIN
  IF TG_TABLE_NAME = 'online_order_items' THEN
    v_order_id := NEW.online_order_id;
  ELSE
    v_order_id := NEW.id;
  END IF;

  SELECT * INTO v_order FROM online_orders WHERE id = v_order_id;
  IF v_order.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Skip validation for staff-managed updates (accepted orders)
  IF v_order.accepted_by IS NOT NULL OR v_order.sale_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_items_sum
  FROM online_order_items WHERE online_order_id = v_order.id;

  -- If no items yet (initial order insert), skip — the items trigger will validate later.
  IF v_items_sum = 0 THEN
    RETURN NULL;
  END IF;

  v_expected_total := round(v_items_sum + COALESCE(v_order.delivery_fee, 0), 2);

  IF round(v_order.subtotal, 2) <> round(v_items_sum, 2) THEN
    RAISE EXCEPTION 'Subtotal do pedido (%) não confere com soma dos itens (%)', v_order.subtotal, v_items_sum;
  END IF;

  IF round(v_order.total, 2) <> v_expected_total THEN
    RAISE EXCEPTION 'Total do pedido (%) não confere com subtotal+frete (%)', v_order.total, v_expected_total;
  END IF;

  RETURN NULL;
END;
$$;