-- Accounts and recurring shifts for PDV operators.
CREATE TABLE IF NOT EXISTS public.operator_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  login_email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.operator_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.operator_profiles TO authenticated;
DROP POLICY IF EXISTS "Admins manage operator profiles" ON public.operator_profiles;
CREATE POLICY "Admins manage operator profiles"
  ON public.operator_profiles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Operators read own profile" ON public.operator_profiles;
CREATE POLICY "Operators read own profile"
  ON public.operator_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'operator'::public.app_role));

CREATE TABLE IF NOT EXISTS public.operator_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT operator_shift_time_order CHECK (ends_at > starts_at),
  CONSTRAINT operator_shift_unique UNIQUE (operator_id, weekday, starts_at)
);
CREATE INDEX IF NOT EXISTS idx_operator_shifts_operator_weekday ON public.operator_shifts (operator_id, weekday);
ALTER TABLE public.operator_shifts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_shifts TO authenticated;
DROP POLICY IF EXISTS "Admins manage operator shifts" ON public.operator_shifts;
CREATE POLICY "Admins manage operator shifts"
  ON public.operator_shifts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Operators read own shifts" ON public.operator_shifts;
CREATE POLICY "Operators read own shifts"
  ON public.operator_shifts FOR SELECT TO authenticated
  USING (operator_id = auth.uid() AND public.has_role(auth.uid(), 'operator'::public.app_role));

-- Allow each operator to run their own drawer at the same time.
DROP INDEX IF EXISTS public.uniq_single_open_register;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_single_open_register_per_operator
  ON public.cash_registers (opened_by) WHERE status = 'open';

DROP POLICY IF EXISTS "Staff can view cash_registers" ON public.cash_registers;
CREATE POLICY "Staff can view cash_registers"
  ON public.cash_registers FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR opened_by = auth.uid());

DROP POLICY IF EXISTS "Staff can update cash_registers" ON public.cash_registers;
CREATE POLICY "Staff can update cash_registers"
  ON public.cash_registers FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR opened_by = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) OR opened_by = auth.uid());

DROP POLICY IF EXISTS "Staff can view cash_movements" ON public.cash_movements;
CREATE POLICY "Staff can view cash_movements"
  ON public.cash_movements FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.cash_registers cr
      WHERE cr.id = cash_register_id AND cr.opened_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated can insert cash_movements" ON public.cash_movements;
CREATE POLICY "Staff can insert own cash_movements"
  ON public.cash_movements FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.cash_registers cr
        WHERE cr.id = cash_register_id AND cr.opened_by = auth.uid() AND cr.status = 'open'
      )
    )
  );
