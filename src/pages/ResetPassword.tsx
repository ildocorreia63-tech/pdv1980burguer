import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, KeyRound } from "lucide-react";
import logo from "@/assets/logo-1980.jpg";
import { handleError } from "@/lib/errors";

export default function ResetPassword() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash and fires PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // If the user landed here with an already-hydrated session, allow the change too
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("A senha precisa ter ao menos 6 caracteres");
    if (password !== confirm) return toast.error("As senhas não conferem");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return handleError(error, "Não foi possível atualizar a senha");
    toast.success("Senha atualizada! Entre com a nova senha.");
    await supabase.auth.signOut();
    nav("/auth", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 gradient-paper">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 h-20 w-20 overflow-hidden rounded-2xl ring-4 ring-primary/30 shadow-retro">
            <img src={logo} alt="1980 Burguer" className="h-full w-full object-cover" />
          </div>
          <h1 className="font-display text-3xl text-primary">Nova senha</h1>
          <p className="text-sm text-muted-foreground">Defina a senha que você usará daqui pra frente.</p>
        </div>

        <Card className="p-5 shadow-retro">
          {!ready ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <KeyRound className="h-6 w-6 text-primary" />
              Validando link de redefinição...
              <button
                onClick={() => nav("/auth")}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label htmlFor="np">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="np"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="cp">Confirmar senha</Label>
                <Input
                  id="cp"
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar nova senha
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
