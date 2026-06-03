import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Trash2, CalendarIcon, X, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { usePersistentState } from "@/hooks/usePersistentState";

type Period = "today" | "7d" | "30d" | "all" | "custom";
const periodLabel: Record<Period, string> = { today: "Hoje", "7d": "7d", "30d": "30d", all: "Tudo", custom: "Período" };

type Expense = { id: string; description: string; category: string | null; amount: number; expense_date: string; notes: string | null };

const DEFAULT_CATEGORIES = ["Insumos", "Embalagens", "Aluguel", "Energia", "Água", "Internet", "Funcionários", "Marketing", "Outros"];

export default function Despesas() {
  const { user, isAdmin } = useAuth();
  const [categories, setCategories] = usePersistentState<string[]>("expense-categories", DEFAULT_CATEGORIES);
  const [list, setList] = useState<Expense[]>([]);
  const [open, setOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState(categories[0] ?? "Outros");
  const [amount, setAmount] = useState(0);
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const formatLocalDate = (value: string) => {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  };
  const [date, setDate] = useState(localToday());
  const [notes, setNotes] = useState("");
  const [period, setPeriod] = useState<Period>("30d");
  const [range, setRange] = useState<DateRange | undefined>();

  const load = async () => {
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .limit(500);
    setList((data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })));
  };

  useEffect(() => { load(); }, []);

  const { startStr, endStr } = useMemo(() => {
    const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const end = new Date();
    const start = new Date();
    if (period === "today") { /* same day */ }
    else if (period === "7d") start.setDate(start.getDate() - 6);
    else if (period === "30d") start.setDate(start.getDate() - 29);
    else if (period === "all") return { startStr: "", endStr: "" };
    else if (period === "custom" && range?.from) {
      const t = range.to ?? range.from;
      return { startStr: toStr(range.from), endStr: toStr(t) };
    }
    return { startStr: toStr(start), endStr: toStr(end) };
  }, [period, range]);

  const filtered = useMemo(() => {
    if (!startStr) return list;
    return list.filter((e) => e.expense_date >= startStr && e.expense_date <= endStr);
  }, [list, startStr, endStr]);


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

  const today = localToday();
  const md = new Date(); md.setDate(1);
  const monthIso = `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, "0")}-01`;

  const totalToday = list.filter((e) => e.expense_date === today).reduce((s, e) => s + e.amount, 0);
  const totalMonth = list.filter((e) => e.expense_date >= monthIso).reduce((s, e) => s + e.amount, 0);
  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0);
  const periodStr = startStr ? `${formatLocalDate(startStr)} a ${formatLocalDate(endStr)}` : "Todas as despesas";

  return (
    <AppShell
      title="Despesas"
      action={
        <div className="flex gap-2">
          <Dialog open={catOpen} onOpenChange={setCatOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="outline" title="Gerenciar categorias"><Tag className="h-4 w-4" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Categorias de despesas</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Nova categoria"
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = newCat.trim();
                        if (!v) return;
                        if (categories.some((c) => c.toLowerCase() === v.toLowerCase())) {
                          return toast.error("Categoria já existe");
                        }
                        setCategories([...categories, v]);
                        setNewCat("");
                        toast.success("Categoria adicionada");
                      }
                    }}
                  />
                  <Button
                    onClick={() => {
                      const v = newCat.trim();
                      if (!v) return;
                      if (categories.some((c) => c.toLowerCase() === v.toLowerCase())) {
                        return toast.error("Categoria já existe");
                      }
                      setCategories([...categories, v]);
                      setNewCat("");
                      toast.success("Categoria adicionada");
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1 max-h-72 overflow-auto">
                  {categories.map((c) => (
                    <div key={c} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                      <span>{c}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => {
                          if (!confirm(`Excluir categoria "${c}"?`)) return;
                          const next = categories.filter((x) => x !== c);
                          setCategories(next);
                          if (cat === c) setCat(next[0] ?? "Outros");
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {categories.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-4">Nenhuma categoria.</p>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
                      {categories.map((c) => <option key={c}>{c}</option>)}
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
        </div>
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

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
          {(["today", "7d", "30d", "all"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${period === p ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {periodLabel[p]}
            </button>
          ))}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={period === "custom" ? "default" : "outline"} size="sm" className="h-8 text-xs">
              <CalendarIcon className="h-3.5 w-3.5" />
              {period === "custom" && range?.from
                ? range.to && range.to.getTime() !== range.from.getTime()
                  ? `${format(range.from, "dd/MM", { locale: ptBR })} – ${format(range.to, "dd/MM", { locale: ptBR })}`
                  : format(range.from, "dd/MM/yyyy", { locale: ptBR })
                : "Datas"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" selected={range} onSelect={(r) => { setRange(r); if (r?.from) setPeriod("custom"); }}
              numberOfMonths={1} locale={ptBR} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
        {period !== "30d" && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setPeriod("30d"); setRange(undefined); }}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{periodStr}</span>
        <span className="font-semibold text-destructive">{filtered.length} • {formatBRL(totalFiltered)}</span>
      </div>

      <div className="space-y-2">
        {filtered.map((e) => (
          <Card key={e.id} className="p-3 shadow-card-retro flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium truncate">{e.description}</p>
              <p className="text-[11px] text-muted-foreground">
                {e.category} • {formatLocalDate(e.expense_date)}
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
        {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhuma despesa no período.</p>}
      </div>
    </AppShell>
  );
}

