ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS address_reference text;

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique_idx
  ON public.customers (phone) WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.upsert_customer_profile(_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_phone text;
  v_email text;
  v_cpf text;
  v_birth date;
  v_id uuid;
BEGIN
  v_name  := btrim(coalesce(_data->>'name',''));
  v_phone := regexp_replace(coalesce(_data->>'phone',''), '\D', '', 'g');
  v_email := nullif(btrim(coalesce(_data->>'email','')), '');
  v_cpf   := nullif(regexp_replace(coalesce(_data->>'cpf',''), '\D', '', 'g'), '');
  v_birth := nullif(_data->>'birth_date','')::date;

  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'nome inválido';
  END IF;
  IF length(v_phone) < 10 OR length(v_phone) > 13 THEN
    RAISE EXCEPTION 'WhatsApp inválido';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'e-mail inválido';
  END IF;
  IF v_cpf IS NOT NULL AND length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'CPF inválido';
  END IF;

  INSERT INTO public.customers (
    name, phone, email, cpf, birth_date,
    address_street, address_number, address_complement, address_reference
  ) VALUES (
    v_name, v_phone, v_email, v_cpf, v_birth,
    nullif(btrim(coalesce(_data->>'address_street','')), ''),
    nullif(btrim(coalesce(_data->>'address_number','')), ''),
    nullif(btrim(coalesce(_data->>'address_complement','')), ''),
    nullif(btrim(coalesce(_data->>'address_reference','')), '')
  )
  ON CONFLICT (phone) WHERE phone IS NOT NULL DO UPDATE SET
    name = EXCLUDED.name,
    email = COALESCE(EXCLUDED.email, public.customers.email),
    cpf = COALESCE(EXCLUDED.cpf, public.customers.cpf),
    birth_date = COALESCE(EXCLUDED.birth_date, public.customers.birth_date),
    address_street = COALESCE(EXCLUDED.address_street, public.customers.address_street),
    address_number = COALESCE(EXCLUDED.address_number, public.customers.address_number),
    address_complement = COALESCE(EXCLUDED.address_complement, public.customers.address_complement),
    address_reference = COALESCE(EXCLUDED.address_reference, public.customers.address_reference),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_customer_profile(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_customer_profile(jsonb) TO anon, authenticated;