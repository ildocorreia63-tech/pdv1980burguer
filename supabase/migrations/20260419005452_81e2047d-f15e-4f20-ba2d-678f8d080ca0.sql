DROP POLICY "Authenticated insert customers" ON public.customers;
DROP POLICY "Authenticated update customers" ON public.customers;

CREATE POLICY "Authenticated insert customers" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated update customers" ON public.customers
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);