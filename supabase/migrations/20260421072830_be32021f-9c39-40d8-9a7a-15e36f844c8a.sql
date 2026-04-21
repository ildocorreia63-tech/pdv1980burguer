-- 1. Store settings (singleton row)
CREATE TABLE public.store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL DEFAULT 'Minha Loja',
  whatsapp_number TEXT,
  welcome_message TEXT DEFAULT 'Bem-vindo! Faça seu pedido.',
  menu_open BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.store_settings (store_name) VALUES ('Minha Loja');

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store settings public read" ON public.store_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins manage store settings" ON public.store_settings
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Delivery zones (bairros + taxas)
CREATE TABLE public.delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery zones public read" ON public.delivery_zones
  FOR SELECT USING (true);

CREATE POLICY "Admins manage delivery zones" ON public.delivery_zones
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- 3. Allow public read on products & categories (for online menu)
CREATE POLICY "Products public read" ON public.products
  FOR SELECT USING (active = true);

CREATE POLICY "Categories public read" ON public.categories
  FOR SELECT USING (true);

-- 4. Online orders
CREATE TYPE public.online_order_status AS ENUM ('pending', 'accepted', 'rejected', 'completed');
CREATE TYPE public.online_order_type AS ENUM ('delivery', 'pickup');

CREATE TABLE public.online_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  order_type public.online_order_type NOT NULL,
  -- delivery info (null for pickup)
  delivery_zone_id UUID REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  delivery_zone_name TEXT,
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  address_street TEXT,
  address_number TEXT,
  address_complement TEXT,
  address_reference TEXT,
  -- totals
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status public.online_order_status NOT NULL DEFAULT 'pending',
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  accepted_by UUID,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create online orders" ON public.online_orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated read online orders" ON public.online_orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated update online orders" ON public.online_orders
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins delete online orders" ON public.online_orders
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

CREATE TRIGGER online_orders_updated_at
  BEFORE UPDATE ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Online order items
CREATE TABLE public.online_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  online_order_id UUID NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.online_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create online order items" ON public.online_order_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated read online order items" ON public.online_order_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins delete online order items" ON public.online_order_items
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- 6. Realtime for online_orders (so PDV gets new orders live)
ALTER PUBLICATION supabase_realtime ADD TABLE public.online_orders;