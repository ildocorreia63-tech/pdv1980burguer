import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import logo from "@/assets/logo-1980.jpg";
import { Seo } from "@/components/Seo";

type AuthRouteState = {
  from?: { pathname?: string; search?: string; hash?: string };
  accessDenied?: boolean;
};

export default function Auth() {
  const nav = useNavigate();
  const location = useLocation();
  const { user, isStaff, loading: authLoading } = useAuth();
  const routeState = (location.state as AuthRouteState | null) ?? null;
  const returnTo = routeState?.from?.pathname && !["/auth", "/reset-password"].includes(routeState.from.pathname)
    ? `${routeState.from.pathname}${routeState.from.search ?? ""}${routeState.from.hash ?? ""}`
    : "/";
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!authLoading && user && isStaff) nav(returnTo, { replace: true });
  }, [authLoading, user, isStaff, returnTo, nav]);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        toast.error("E-mail ou senha inválidos.");
        return;
      }

      const { data: roles, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);

      if (roleError) {
        await supabase.auth.signOut();
        toast.error("Não foi possível verificar o acesso. Tente novamente.");
        return;
      }

      const hasStaffRole = roles?.some((row) => row.role === "admin" || row.role === "operator");
      if (!hasStaffRole) {
        await supabase.auth.signOut();
        toast.error("Esta conta não tem acesso ao PDV. Peça ao administrador para cadastrar seu usuário.");
        return;
      }

      toast.success("Bem-vindo!");
      nav(returnTo, { replace: true });
    } catch {
      toast.error("Não foi possível entrar. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) return toast.error("Digite seu e-mail primeiro.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) return toast.error("Não foi possível enviar o link. Tente novamente.");
      toast.success("Enviamos um link de redefinição para o seu e-mail.");
    } catch {
      toast.error("Não foi possível enviar o link. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 gradient-paper">
      <Seo
        title="Login — 1980 Burguer PDV"
        description="Acesse o painel da 1980 Burguer para gerenciar vendas, pedidos online, fiado e despesas da hamburgueria."
        path="/auth"
        noindex
      />
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 h-20 w-20 overflow-hidden rounded-2xl ring-4 ring-primary/30 shadow-retro">
            <img src={logo} alt="1980 Burguer" className="h-full w-full object-cover" />
          </div>
          <h1 className="font-display text-4xl text-primary">1980 Burguer — Login</h1>
          <p className="text-sm text-muted-foreground">PDV — A sua hamburgueria</p>
        </div>

        <Card className="p-5 shadow-retro">
          <form onSubmit={handleSignIn} className="space-y-3">
            <div>
              <Label htmlFor="login-email">E-mail</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="login-password">Senha</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading || authLoading}>
              {(loading || authLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="w-full text-center text-xs text-primary hover:underline"
            >
              Esqueci minha senha
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Acesso exclusivo da equipe. O administrador cadastra os operadores.
          </p>
          {user && !authLoading && !isStaff && (
            <p role="alert" className="mt-3 rounded-md bg-destructive/10 p-3 text-center text-xs text-destructive">
              Esta conta não tem um papel de operador ou administrador no PDV.
            </p>
          )}
          {routeState?.accessDenied && !user && (
            <p role="alert" className="mt-3 rounded-md bg-destructive/10 p-3 text-center text-xs text-destructive">
              Entre com uma conta autorizada para acessar esta página.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
