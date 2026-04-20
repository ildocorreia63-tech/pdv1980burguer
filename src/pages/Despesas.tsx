import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Expense = { id: string; description: string; category: string | null; amount: number; expense_date: string; notes: string | null };

const COMMON = ["Insumos", "Embalagens", "Aluguel", "Energia", "Água", "Internet", "Funcionários", "Marketing", "Outros"];

export default function Despesas() {
  const { user, isAdmin } = useAuth();
  const [list, setList] = useState<Expense[]>([]);
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("Insumos");
  const [amount, setAmount] = useState(0);
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [date, setDate] = useState(localToday());
  const [notes, setNotes] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .limit(60);
    setList((data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!user) return;
    if (!desc.trim() || amount <= 0) return toast.error("Preencha descrição e valor");
    const { error } = await supabase.from("expenses").insert({
      description: desc.trim(),
      category: cat,
      amount,
      expense_date: date,
      notes: notes || null,
      created_by: user.id,
    });
    if (error) return toast.error(error.message);
    setOpen(false);
    setDesc("");
    setAmount(0);
    setNotes("");
    load();
    toast.success("Despesa registrada");
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir despesa?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(); monthStart.setDate(1);
  const monthIso = monthStart.toISOString().slice(0, 10);

  const totalToday = list.filter((e) => e.expense_date === today).reduce((s, e) => s + e.amount, 0);
  const totalMonth = list.filter((e) => e.expense_date >= monthIso).reduce((s, e) => s + e.amount, 0);

  return (
    <AppShell
      title="Despesas"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="icon" variant="outline"><Plus className="h-4 w-4" /></Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova despesa</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Descrição</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Categoria</Label>
                  <select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm">
                    {COMMON.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              </div>
              <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} /></div>
              <div><Label>Observação</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              <Button className="w-full" onClick={save}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Card className="p-3 shadow-card-retro border-l-4 border-l-destructive">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hoje</p>
          <p className="font-display text-2xl text-destructive">{formatBRL(totalToday)}</p>
        </Card>
        <Card className="p-3 shadow-card-retro border-l-4 border-l-secondary">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Este mês</p>
          <p className="font-display text-2xl text-secondary">{formatBRL(totalMonth)}</p>
        </Card>
      </div>

      <div className="space-y-2">
        {list.map((e) => (
          <Card key={e.id} className="p-3 shadow-card-retro flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium truncate">{e.description}</p>
              <p className="text-[11px] text-muted-foreground">
                {e.category} • {new Date(e.expense_date).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <p className="font-display text-lg text-destructive">-{formatBRL(e.amount)}</p>
              {isAdmin && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(e.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </Card>
        ))}
        {list.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhuma despesa registrada.</p>}
      </div>
    </AppShell>
  );
}
