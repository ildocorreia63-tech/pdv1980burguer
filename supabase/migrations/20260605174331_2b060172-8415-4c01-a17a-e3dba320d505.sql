
-- 1) Stop auto-assigning 'operator' role on signup. New users get no role until an admin promotes them.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  -- subsequent users start with no role; admin must promote them explicitly
  RETURN NEW;
END;
$function$;

-- 2) Tighten SELECT policies so only staff (admin/operator) can read financial/customer data.
DROP POLICY IF EXISTS "Sales readable" ON public.sales;
CREATE POLICY "Staff read sales" ON public.sales
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'::app_role));

DROP POLICY IF EXISTS "Sale items readable" ON public.sale_items;
CREATE POLICY "Staff read sale items" ON public.sale_items
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'::app_role));

DROP POLICY IF EXISTS "Payments readable" ON public.payments;
CREATE POLICY "Staff read payments" ON public.payments
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'::app_role));

DROP POLICY IF EXISTS "Expenses readable" ON public.expenses;
CREATE POLICY "Staff read expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'::app_role));

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Staff or self read profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'::app_role));

DROP POLICY IF EXISTS "Categories readable" ON public.categories;
-- categories already have a public read policy ("Categories public read") which staff also inherit; no replacement needed.

DROP POLICY IF EXISTS "Products readable" ON public.products;
-- products already have "Products public read" (active=true). Add a staff-wide read so admins can see inactive items too.
CREATE POLICY "Staff read all products" ON public.products
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'::app_role));

-- 3) Restrict realtime broadcasts on online_orders to staff only.
-- Underlying table RLS already blocks anon, but make the realtime.messages policy explicit.
DROP POLICY IF EXISTS "Staff realtime access" ON realtime.messages;
CREATE POLICY "Staff realtime access" ON realtime.messages
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'::app_role));
