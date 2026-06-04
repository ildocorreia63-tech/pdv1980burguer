
-- INGREDIENTS
CREATE TABLE public.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'un',
  cost_per_unit numeric(12,4) NOT NULL DEFAULT 0,
  stock_quantity numeric(12,4) NOT NULL DEFAULT 0,
  min_stock numeric(12,4) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredients TO authenticated;
GRANT ALL ON public.ingredients TO service_role;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read ingredients" ON public.ingredients FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'operator'));
CREATE POLICY "Admins manage ingredients" ON public.ingredients FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE TRIGGER trg_ingredients_updated BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PRODUCT RECIPES
CREATE TABLE public.product_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  quantity numeric(12,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, ingredient_id)
);
CREATE INDEX idx_recipes_product ON public.product_recipes(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_recipes TO authenticated;
GRANT ALL ON public.product_recipes TO service_role;
ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read recipes" ON public.product_recipes FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'operator'));
CREATE POLICY "Admins manage recipes" ON public.product_recipes FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE TRIGGER trg_recipes_updated BEFORE UPDATE ON public.product_recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- MOVEMENTS
CREATE TYPE public.ingredient_movement_type AS ENUM ('purchase','sale','adjustment','waste');

CREATE TABLE public.ingredient_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL,
  type public.ingredient_movement_type NOT NULL,
  quantity numeric(12,4) NOT NULL,
  unit_cost numeric(12,4),
  sale_id uuid,
  sale_item_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mov_ingredient ON public.ingredient_movements(ingredient_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredient_movements TO authenticated;
GRANT ALL ON public.ingredient_movements TO service_role;
ALTER TABLE public.ingredient_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read movements" ON public.ingredient_movements FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'operator'));
CREATE POLICY "Admins insert movements" ON public.ingredient_movements FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins update movements" ON public.ingredient_movements FOR UPDATE TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins delete movements" ON public.ingredient_movements FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

-- TRIGGER: consume ingredients on sale item insert
CREATE OR REPLACE FUNCTION public.consume_ingredients_for_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_consume numeric;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  FOR r IN
    SELECT pr.ingredient_id, pr.quantity, i.cost_per_unit
    FROM public.product_recipes pr
    JOIN public.ingredients i ON i.id = pr.ingredient_id
    WHERE pr.product_id = NEW.product_id
  LOOP
    v_consume := r.quantity * NEW.quantity;
    UPDATE public.ingredients
      SET stock_quantity = stock_quantity - v_consume
      WHERE id = r.ingredient_id;
    INSERT INTO public.ingredient_movements
      (ingredient_id, type, quantity, unit_cost, sale_id, sale_item_id, notes)
    VALUES
      (r.ingredient_id, 'sale', -v_consume, r.cost_per_unit, NEW.sale_id, NEW.id,
       'Baixa automática de venda');
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_consume_ingredients
AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.consume_ingredients_for_sale_item();
