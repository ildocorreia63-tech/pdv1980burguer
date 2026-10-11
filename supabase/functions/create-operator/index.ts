import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Servidor sem configuração de autenticação" }, 500);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sessão necessária" }, 401);

  try {
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Sessão inválida" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin, error: roleError } = await admin.rpc("is_admin", { _user_id: user.id });
    if (roleError || !isAdmin) return json({ error: "Apenas administradores podem cadastrar operadores" }, 403);

    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (name.length < 2 || name.length > 80) return json({ error: "Nome deve ter entre 2 e 80 caracteres" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "Informe um e-mail válido para o login" }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "A senha deve ter entre 8 e 128 caracteres" }, 400);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: name },
    });
    if (createError || !created.user) return json({ error: createError?.message ?? "Não foi possível criar a conta" }, 400);

    const { error: roleErrorInsert } = await admin.from("user_roles").upsert(
      { user_id: created.user.id, role: "operator" },
      { onConflict: "user_id,role" },
    );
    const { error: accountError } = roleErrorInsert
      ? { error: roleErrorInsert }
      : await admin.from("operator_profiles").insert({ user_id: created.user.id, login_email: email });
    if (roleErrorInsert || accountError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Conta não foi cadastrada como operador: " + (roleErrorInsert ?? accountError).message }, 500);
    }

    return json({ id: created.user.id, name, email }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});
