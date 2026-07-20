
-- Cash register sessions
CREATE TABLE public.cash_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by UUID NOT NULL REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opening_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  opening_notes TEXT,
  closed_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMPTZ,
  closing_amount NUMERIC(12,2),
  expected_amount NUMERIC(12,2),
  difference NUMERIC(12,2),
  closing_notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_registers TO authenticated;
GRANT ALL ON public.cash_registers TO service_role;

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cash_registers"
  ON public.cash_registers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert cash_registers"
  ON public.cash_registers FOR INSERT TO authenticated WITH CHECK (auth.uid() = opened_by);
CREATE POLICY "Authenticated can update cash_registers"
  ON public.cash_registers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete cash_registers"
  ON public.cash_registers FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_cash_registers_updated_at
  BEFORE UPDATE ON public.cash_registers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cash movements (sangria = withdrawal, reforço/suprimento = adds cash)
CREATE TABLE public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_register_id UUID NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sangria','reforco')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cash_movements"
  ON public.cash_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert cash_movements"
  ON public.cash_movements FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins can delete cash_movements"
  ON public.cash_movements FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX idx_cash_movements_register ON public.cash_movements(cash_register_id);
CREATE INDEX idx_cash_registers_status ON public.cash_registers(status);

-- Helper: only one open register at a time
CREATE UNIQUE INDEX uniq_single_open_register ON public.cash_registers(status) WHERE status = 'open';
