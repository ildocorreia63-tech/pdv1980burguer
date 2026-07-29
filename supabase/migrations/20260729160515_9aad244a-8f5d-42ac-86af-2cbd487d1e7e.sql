CREATE OR REPLACE FUNCTION public.reset_operational_data(_reset_stock boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales int; v_expenses int; v_orders int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'apenas administradores podem reiniciar os dados';
  END IF;

  SELECT count(*) INTO v_sales FROM public.sales;
  SELECT count(*) INTO v_expenses FROM public.expenses;
  SELECT count(*) INTO v_orders FROM public.online_orders;

  DELETE FROM public.ingredient_movements;
  DELETE FROM public.online_order_items;
  DELETE FROM public.online_orders;
  DELETE FROM public.payments;
  DELETE FROM public.sale_items;
  DELETE FROM public.sales;
  DELETE FROM public.expenses;
  DELETE FROM public.cash_movements;
  DELETE FROM public.cash_registers;

  UPDATE public.customers SET credit_balance = 0 WHERE credit_balance <> 0;

  IF _reset_stock THEN
    UPDATE public.ingredients SET stock_quantity = 0 WHERE stock_quantity <> 0;
  END IF;

  RETURN jsonb_build_object('sales', v_sales, 'expenses', v_expenses, 'orders', v_orders);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_operational_data(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_operational_data(boolean) TO authenticated;