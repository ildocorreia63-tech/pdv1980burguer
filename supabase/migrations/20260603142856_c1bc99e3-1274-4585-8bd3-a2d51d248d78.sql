DROP POLICY IF EXISTS "Authenticated update online orders" ON public.online_orders;
CREATE POLICY "Staff update online orders" ON public.online_orders
FOR UPDATE TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'operator'));