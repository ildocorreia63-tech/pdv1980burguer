
DROP POLICY IF EXISTS "Insert expenses" ON public.expenses;
CREATE POLICY "Insert expenses" ON public.expenses FOR INSERT
  WITH CHECK (auth.uid() = created_by AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operator'::app_role)));

DROP POLICY IF EXISTS "Insert payments" ON public.payments;
CREATE POLICY "Insert payments" ON public.payments FOR INSERT
  WITH CHECK (auth.uid() = created_by AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operator'::app_role)));

DROP POLICY IF EXISTS "Operators create sales" ON public.sales;
CREATE POLICY "Operators create sales" ON public.sales FOR INSERT
  WITH CHECK (auth.uid() = operator_id AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operator'::app_role)));
