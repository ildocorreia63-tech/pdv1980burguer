import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate, paymentLabels } from "@/lib/format";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Phone, Banknote, QrCode, CreditCard, Receipt as ReceiptIcon } from "lucide-react";
import { toast } from "sonner";
import { ReceiptDialog } from "@/components/pdv/ReceiptDialog";
import type { ReceiptData } from "@/lib/receipt";

type Customer = { id: string; name: string; phone: string | null; credit_balance: number };
type Sale = { id: string; total: number; credit_amount: number; created_at: string; status: string };

export default function Fiados() {
  const { user } = useAuth();
  const [list, setList] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [history, setHistory] = useState<Sale[]>([]);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<"cash" | "pix" | "debit" | "credit">("cash");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const load = async () => {
    const { data } = await supabase.from("customers").select("*").order("credit_balance", { ascending: false });
    setList((data ?? []).map((c) => ({ ...c, credit_balance: Number(c.credit_balance) })));
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (c: Customer) => {
    setSelected(c);
    setPayAmount(c.credit_balance);
    const { data } = await supabase
      .from("sales")
      .select("id,total,credit_amount,created_at,status")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory((data ?? []).map((s) => ({ ...s, total: Number(s.total), credit_amount: Number(s.credit_amount) })));
  };

  const registerPayment = async () => {
    if (!selected || !user) return;
    if (payAmount <= 0 || payAmount > selected.credit_balance) return toast.error("Valor inválido");

    const { error: e1 } = await supabase.from("payments").insert({
      customer_id: selected.id,
      method: payMethod,
      amount: payAmount,
      status: "paid" as const,
      paid_at: new Date().toISOString(),
      created_by: user.id,
      notes: "Baixa de fiado",
    });
    if (e1) return toast.error(e1.message);

    const newBal = +(selected.credit_balance - payAmount).toFixed(2);
    await supabase.from("customers").update({ credit_balance: newBal }).eq("id", selected.id);
    toast.success("Pagamento registrado!");
    setSelected(null);
    load();
  };

  const createCustomer = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from("customers").insert({ name: newName.trim(), phone: newPhone || null });
    if (error) return toast.error(error.message);
    setNewOpen(false);
    setNewName("");
    setNewPhone("");
    load();
  };

  const filtered = list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const totalDebt = list.reduce((s, c) => s + c.credit_balance, 0);

  return (
    <AppShell
      title="Fiados"
      action={
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button size="icon" variant="outline"><Plus className="h-4 w-4" /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
              <div><Label>Telefone</Label><Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} /></div>
              <Button className="w-full" onClick={createCustomer}>Cadastrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <Card className="p-4 shadow-card-retro mb-3 bg-accent/10 border-accent/30">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Total a receber</p>
        <p className="font-display text-3xl text-primary">{formatBRL(totalDebt)}</p>
      </Card>

      <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />

      <div className="space-y-2">
        {filtered.map((c) => (
          <button key={c.id} onClick={() => openDetail(c)} className="w-full text-left">
            <Card className="p-3 shadow-card-retro flex items-center justify-between active:scale-[0.98] transition">
              <div className="min-w-0">
                <p className="font-medium truncate">{c.name}</p>
                {c.phone && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {c.phone}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className={`font-display text-lg ${c.credit_balance > 0 ? "text-destructive" : "text-success"}`}>
                  {formatBRL(c.credit_balance)}
                </p>
                <p className="text-[10px] text-muted-foreground">{c.credit_balance > 0 ? "deve" : "em dia"}</p>
              </div>
            </Card>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhum cliente.</p>}
      </div>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-display text-2xl text-left">{selected.name}</SheetTitle>
              </SheetHeader>

              <Card className="mt-3 p-3 bg-destructive/10 border-destructive/30">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Saldo devedor</p>
                <p className="font-display text-3xl text-destructive">{formatBRL(selected.credit_balance)}</p>
              </Card>

              {selected.credit_balance > 0 && (
                <div className="mt-3 rounded-lg border border-border p-3 bg-card">
                  <Label className="text-xs uppercase tracking-wider">Receber pagamento</Label>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {([
                      ["cash", Banknote],
                      ["pix", QrCode],
                      ["debit", CreditCard],
                      ["credit", CreditCard],
                    ] as const).map(([m, Icon]) => (
                      <button
                        key={m}
                        onClick={() => setPayMethod(m)}
                        className={`rounded-lg border p-2 flex flex-col items-center gap-1 text-[10px] font-display ${
                          payMethod === m ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {paymentLabels[m]}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={payAmount || ""}
                      onChange={(e) => setPayAmount(Number(e.target.value) || 0)}
                    />
                    <Button onClick={registerPayment}>Receber</Button>
                  </div>
                </div>
              )}

              <h4 className="font-display text-lg mt-4 mb-2">Histórico</h4>
              <div className="space-y-2">
                {history.map((s) => (
                  <Card key={s.id} className="p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{formatDate(s.created_at)}</p>
                      <p className="text-[11px] uppercase font-display">{s.status}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatBRL(s.total)}</p>
                      {s.credit_amount > 0 && (
                        <p className="text-[11px] text-destructive">fiado: {formatBRL(s.credit_amount)}</p>
                      )}
                    </div>
                  </Card>
                ))}
                {history.length === 0 && <p className="text-xs text-muted-foreground">Sem vendas.</p>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
