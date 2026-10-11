import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarDays, Clock3, Loader2, Trash2, UserPlus, Users } from "lucide-react";

type Operator = { user_id: string; display_name: string; login_email: string };
type Shift = { id: string; operator_id: string; weekday: number; starts_at: string; ends_at: string; notes: string | null };
const weekDays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export default function Team() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOperator, setSavingOperator] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [weekday, setWeekday] = useState("1");
  const [startsAt, setStartsAt] = useState("09:00");
  const [endsAt, setEndsAt] = useState("18:00");
  const [notes, setNotes] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: accounts, error } = await supabase.from("operator_profiles" as any).select("user_id, login_email");
    if (error) { toast.error("Não foi possível carregar os operadores"); setLoading(false); return; }
    const rows = (accounts ?? []) as { user_id: string; login_email: string }[];
    if (!rows.length) { setOperators([]); setShifts([]); setLoading(false); return; }
    const ids = rows.map((row) => row.user_id);
    const [{ data: profiles }, { data: shiftRows, error: shiftError }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name").in("user_id", ids),
      supabase.from("operator_shifts" as any).select("*").in("operator_id", ids).order("weekday").order("starts_at"),
    ]);
    if (shiftError) toast.error("Não foi possível carregar a escala");
    const names = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.display_name || "Operador"]));
    setOperators(rows.map((row) => ({ ...row, display_name: names.get(row.user_id) || "Operador" })));
    setShifts((shiftRows ?? []) as Shift[]);
    setOperatorId((current) => rows.some((row) => row.user_id === current) ? current : rows[0]?.user_id ?? "");
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const createOperator = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return toast.error("Informe o nome do operador");
    if (password.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres");
    setSavingOperator(true);
    const { data, error } = await supabase.functions.invoke("create-operator", {
      body: { name: name.trim(), email: email.trim().toLowerCase(), password },
    });
    setSavingOperator(false);
    if (error || data?.error) return toast.error(data?.error || error?.message || "Não foi possível criar o operador");
    toast.success("Operador cadastrado. Ele já pode entrar com e-mail e senha.");
    setName(""); setEmail(""); setPassword("");
    await load();
  };

  const saveShift = async (event: FormEvent) => {
    event.preventDefault();
    if (!operatorId) return toast.error("Cadastre um operador primeiro");
    if (endsAt <= startsAt) return toast.error("O fim do turno deve ser depois do início");
    setSavingShift(true);
    const { error } = await supabase.from("operator_shifts" as any).insert({
      operator_id: operatorId,
      weekday: Number(weekday),
      starts_at: startsAt,
      ends_at: endsAt,
      notes: notes.trim() || null,
    });
    setSavingShift(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "Esse turno já está cadastrado" : error.message);
    toast.success("Turno adicionado à escala");
    setNotes("");
    await load();
  };

  const removeShift = async (id: string) => {
    const { error } = await supabase.from("operator_shifts" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    setShifts((rows) => rows.filter((row) => row.id !== id));
    toast.success("Turno removido");
  };

  const operatorName = (id: string) => operators.find((operator) => operator.user_id === id)?.display_name ?? "Operador";

  return (
    <AppShell title="Operadores e turnos">
      <div className="space-y-5">
        <Card className="p-4">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div><h2 className="font-display text-xl">Operadores cadastrados</h2><p className="text-xs text-muted-foreground">Cada pessoa usa seu próprio acesso ao PDV.</p></div>
          </div>
          {loading ? <div className="flex justify-center py-5"><Loader2 className="h-5 w-5 animate-spin" /></div> : operators.length ? (
            <ul className="divide-y divide-border">{operators.map((operator) => <li key={operator.user_id} className="py-3 text-sm"><span className="font-medium">{operator.display_name}</span><span className="block text-xs text-muted-foreground">{operator.login_email}</span></li>)}</ul>
          ) : <p className="py-2 text-sm text-muted-foreground">Nenhum operador cadastrado ainda.</p>}
        </Card>

        <Card className="p-4">
          <div className="mb-4 flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /><div><h2 className="font-display text-xl">Cadastrar operador</h2><p className="text-xs text-muted-foreground">O login será o e-mail informado.</p></div></div>
          <form onSubmit={createOperator} className="space-y-3">
            <div><Label htmlFor="operator-name">Nome</Label><Input id="operator-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" /></div>
            <div><Label htmlFor="operator-email">Login (e-mail)</Label><Input id="operator-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
            <div><Label htmlFor="operator-password">Senha inicial</Label><Input id="operator-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" /></div>
            <Button className="w-full" type="submit" disabled={savingOperator}>{savingOperator ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}Criar acesso</Button>
          </form>
        </Card>

        <Card className="p-4">
          <div className="mb-4 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /><div><h2 className="font-display text-xl">Escala semanal de turnos</h2><p className="text-xs text-muted-foreground">Cadastre os horários de cada operador por dia da semana.</p></div></div>
          {!operators.length ? <p className="text-sm text-muted-foreground">Cadastre um operador para começar a montar a escala.</p> : <>
            <form onSubmit={saveShift} className="space-y-3">
              <div><Label htmlFor="shift-operator">Operador</Label><select id="shift-operator" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>{operators.map((operator) => <option key={operator.user_id} value={operator.user_id}>{operator.display_name}</option>)}</select></div>
              <div><Label htmlFor="shift-weekday">Dia da semana</Label><select id="shift-weekday" className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={weekday} onChange={(e) => setWeekday(e.target.value)}>{weekDays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="shift-start">Início</Label><Input id="shift-start" type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></div><div><Label htmlFor="shift-end">Fim</Label><Input id="shift-end" type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required /></div></div>
              <div><Label htmlFor="shift-notes">Observação (opcional)</Label><Input id="shift-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: intervalo das 13h às 14h" /></div>
              <Button className="w-full" type="submit" disabled={savingShift}>{savingShift && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Adicionar turno</Button>
            </form>
            <div className="mt-5 space-y-2">
              {shifts.map((shift) => <div key={shift.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Clock3 className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{operatorName(shift.operator_id)} · {weekDays[shift.weekday]}</p><p className="text-xs text-muted-foreground">{shift.starts_at.slice(0,5)}–{shift.ends_at.slice(0,5)}{shift.notes ? ` · ${shift.notes}` : ""}</p></div>
                <Button size="icon" variant="ghost" className="text-destructive" aria-label="Remover turno" onClick={() => void removeShift(shift.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>)}
              {!shifts.length && <p className="text-sm text-muted-foreground">Nenhum turno cadastrado.</p>}
            </div>
          </>}
        </Card>
      </div>
    </AppShell>
  );
}
