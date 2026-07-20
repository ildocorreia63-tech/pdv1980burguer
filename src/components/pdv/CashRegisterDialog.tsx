import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { DollarSign, ArrowDownCircle, ArrowUpCircle, Lock, LockOpen, Printer, Loader2, X } from "lucide-react";

type Session = {
  id: string;
  opened_by: string;
  opened_at: string;
  opening_amount: number;
  opening_notes: string | null;
  closed_by: string | null;
  closed_at: string | null;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  closing_notes: string | null;
  status: "open" | "closed";
};

type Movement = {
  id: string;
  cash_register_id: string;
  type: "sangria" | "reforco";
  amount: number;
  reason: string | null;
  created_at: string;
};

type SaleRow = { total: number; payment_method: string | null; created_at: string };

async function fetchOpenSession(): Promise<Session | null> {
  const { data } = await supabase
    .from("cash_registers")
    .select("*")
    .eq("status", "open")
    .maybeSingle();
  return (data as any) ?? null;
}

async function fetchMovements(sessionId: string): Promise<Movement[]> {
  const { data } = await supabase
    .from("cash_movements")
    .select("*")
    .eq("cash_register_id", sessionId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as any[]).map((m) => ({ ...m, amount: Number(m.amount) }));
}

async function fetchSalesSince(iso: string, untilIso?: string): Promise<SaleRow[]> {
  let q = supabase.from("sales").select("total, payment_method, created_at").gte("created_at", iso);
  if (untilIso) q = q.lte("created_at", untilIso);
  const { data } = await q;
  return ((data ?? []) as any[]).map((s) => ({ ...s, total: Number(s.total) }));
}

function paymentBreakdown(sales: SaleRow[]) {
  const map: Record<string, number> = {};
  for (const s of sales) {
    const k = s.payment_method || "outros";
    map[k] = (map[k] ?? 0) + s.total;
  }
  return map;
}

function printReport(html: string) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) { toast.error("Bloqueado pelo navegador"); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Caixa</title>
    <style>
      body{font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:10px;color:#000}
      h1{font-size:14px;margin:4px 0;text-align:center}
      h2{font-size:12px;margin:8px 0 4px}
      hr{border:none;border-top:1px dashed #000;margin:6px 0}
      table{width:100%;border-collapse:collapse}
      td{padding:1px 0}
      .r{text-align:right}
      .b{font-weight:700}
      @media print{@page{margin:5mm}}
    </style></head><body>${html}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}<\/script></body></html>`);
  w.document.close();
}

const paymentLabel: Record<string, string> = {
  cash: "Dinheiro", pix: "PIX", card_delivery: "Cartão (entrega)",
  credit: "Crédito", debit: "Débito", fiado: "Fiado", outros: "Outros",
};

export function CashRegisterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Open form
  const [openAmount, setOpenAmount] = useState<number>(0);
  const [openNotes, setOpenNotes] = useState("");

  // Movement form
  const [movType, setMovType] = useState<"sangria" | "reforco">("sangria");
  const [movAmount, setMovAmount] = useState<number>(0);
  const [movReason, setMovReason] = useState("");

  // Close form
  const [closingAmount, setClosingAmount] = useState<number>(0);
  const [closingNotes, setClosingNotes] = useState("");
  const [closing, setClosing] = useState(false);

  const load = async () => {
    setLoading(true);
    const s = await fetchOpenSession();
    setSession(s);
    if (s) {
      const [mv, sl] = await Promise.all([fetchMovements(s.id), fetchSalesSince(s.opened_at)]);
      setMovements(mv);
      setSales(sl);
    } else {
      setMovements([]);
      setSales([]);
    }
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const totals = useMemo(() => {
    const cashSales = sales.filter((s) => (s.payment_method || "").toLowerCase() === "cash")
      .reduce((s, x) => s + x.total, 0);
    const reforco = movements.filter((m) => m.type === "reforco").reduce((s, m) => s + m.amount, 0);
    const sangria = movements.filter((m) => m.type === "sangria").reduce((s, m) => s + m.amount, 0);
    const opening = Number(session?.opening_amount ?? 0);
    const expected = opening + cashSales + reforco - sangria;
    const salesTotal = sales.reduce((s, x) => s + x.total, 0);
    return { opening, cashSales, reforco, sangria, expected, salesTotal, byPayment: paymentBreakdown(sales) };
  }, [session, movements, sales]);

  const openRegister = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return toast.error("Faça login");
    const { error } = await supabase.from("cash_registers").insert({
      opened_by: userRes.user.id,
      opening_amount: openAmount,
      opening_notes: openNotes || null,
    });
    if (error) return toast.error("Erro ao abrir: " + error.message);
    toast.success("Caixa aberto");
    setOpenAmount(0); setOpenNotes("");
    printReport(openingHtml(openAmount, openNotes, userRes.user.email ?? ""));
    await load();
  };

  const addMovement = async () => {
    if (!session) return;
    if (!movAmount || movAmount <= 0) return toast.error("Valor inválido");
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return toast.error("Faça login");
    const { error } = await supabase.from("cash_movements").insert({
      cash_register_id: session.id,
      type: movType,
      amount: movAmount,
      reason: movReason || null,
      created_by: userRes.user.id,
    });
    if (error) return toast.error("Erro: " + error.message);
    toast.success(`${movType === "sangria" ? "Sangria" : "Reforço"} de ${formatBRL(movAmount)} registrada`);
    setMovAmount(0); setMovReason("");
    await load();
  };

  const closeRegister = async () => {
    if (!session) return;
    setClosing(true);
    const diff = closingAmount - totals.expected;
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("cash_registers").update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: userRes.user?.id ?? null,
      closing_amount: closingAmount,
      expected_amount: totals.expected,
      difference: diff,
      closing_notes: closingNotes || null,
    }).eq("id", session.id);
    setClosing(false);
    if (error) return toast.error("Erro ao fechar: " + error.message);
    toast.success("Caixa fechado");
    printReport(closingHtml(session, totals, closingAmount, diff, closingNotes, movements));
    setClosingAmount(0); setClosingNotes("");
    await load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Controle de Caixa
            {session ? (
              <Badge className="bg-emerald-500 text-white">Aberto</Badge>
            ) : (
              <Badge variant="outline">Fechado</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {session
              ? `Aberto em ${new Date(session.opened_at).toLocaleString("pt-BR")}`
              : "Nenhum caixa aberto no momento."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !session ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Informe o valor inicial (fundo de caixa) para começar. Um comprovante de abertura será impresso.
            </p>
            <div>
              <Label>Fundo de caixa (R$)</Label>
              <Input type="number" step="0.01" min={0} value={openAmount || ""} onChange={(e) => setOpenAmount(Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} placeholder="Ex.: troco em moedas" />
            </div>
            <Button className="w-full" onClick={openRegister}>
              <LockOpen className="h-4 w-4 mr-1" /> Abrir caixa
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <Card className="p-3 space-y-1 text-sm">
              <Row label="Fundo de abertura" value={totals.opening} />
              <Row label="Vendas em dinheiro" value={totals.cashSales} />
              <Row label="Reforços (+)" value={totals.reforco} className="text-emerald-700" />
              <Row label="Sangrias (−)" value={-totals.sangria} className="text-destructive" />
              <div className="border-t border-border pt-1 mt-1">
                <Row label="Esperado em caixa" value={totals.expected} bold />
              </div>
              <div className="text-[11px] text-muted-foreground pt-1">
                Total geral de vendas no período: {formatBRL(totals.salesTotal)}
              </div>
            </Card>

            {/* Movements */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Nova movimentação</p>
              <div className="flex gap-1">
                <Button size="sm" variant={movType === "sangria" ? "default" : "outline"} className="flex-1" onClick={() => setMovType("sangria")}>
                  <ArrowDownCircle className="h-4 w-4 mr-1" /> Sangria
                </Button>
                <Button size="sm" variant={movType === "reforco" ? "default" : "outline"} className="flex-1" onClick={() => setMovType("reforco")}>
                  <ArrowUpCircle className="h-4 w-4 mr-1" /> Reforço
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input type="number" step="0.01" min={0} value={movAmount || ""} onChange={(e) => setMovAmount(Number(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-xs">Motivo</Label>
                  <Input value={movReason} onChange={(e) => setMovReason(e.target.value)} placeholder="Opcional" />
                </div>
              </div>
              <Button size="sm" className="w-full" onClick={addMovement}>Registrar</Button>

              {movements.length > 0 && (
                <div className="border-t border-border pt-2 space-y-1 max-h-32 overflow-y-auto">
                  {movements.map((m) => (
                    <div key={m.id} className="flex justify-between text-xs">
                      <span className={m.type === "sangria" ? "text-destructive" : "text-emerald-700"}>
                        {m.type === "sangria" ? "− Sangria" : "+ Reforço"} {m.reason ? `· ${m.reason}` : ""}
                      </span>
                      <span className="tabular-nums">{formatBRL(m.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Close */}
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-sm font-medium">Fechamento de caixa</p>
              <div>
                <Label className="text-xs">Valor contado em dinheiro (R$)</Label>
                <Input type="number" step="0.01" min={0} value={closingAmount || ""} onChange={(e) => setClosingAmount(Number(e.target.value) || 0)} />
                {closingAmount > 0 && (
                  <p className={`mt-1 text-xs ${closingAmount - totals.expected === 0 ? "text-emerald-700" : closingAmount - totals.expected > 0 ? "text-amber-700" : "text-destructive"}`}>
                    Diferença: {formatBRL(closingAmount - totals.expected)}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea rows={2} value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => printReport(closingHtml(session, totals, closingAmount || totals.expected, (closingAmount || totals.expected) - totals.expected, closingNotes, movements))}>
                  <Printer className="h-4 w-4 mr-1" /> Imprimir prévia
                </Button>
                <Button variant="destructive" className="flex-1" onClick={closeRegister} disabled={closing}>
                  {closing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
                  Fechar caixa
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1" /> Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold, className }: { label: string; value: number; bold?: boolean; className?: string }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-base" : ""} ${className ?? ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{formatBRL(value)}</span>
    </div>
  );
}

function openingHtml(amount: number, notes: string, email: string) {
  return `
    <h1>ABERTURA DE CAIXA</h1>
    <hr/>
    <div>Data: ${new Date().toLocaleString("pt-BR")}</div>
    <div>Operador: ${email || "-"}</div>
    <hr/>
    <table>
      <tr><td>Fundo de caixa</td><td class="r b">${formatBRL(amount)}</td></tr>
    </table>
    ${notes ? `<hr/><div><b>Obs:</b> ${notes}</div>` : ""}
    <hr/>
    <div style="text-align:center">— Caixa aberto —</div>
  `;
}

type Totals = { opening: number; cashSales: number; reforco: number; sangria: number; expected: number; salesTotal: number; byPayment: Record<string, number> };
function closingHtml(session: Session, t: Totals, counted: number, diff: number, notes: string, movs: Movement[]) {
  const pay = Object.entries(t.byPayment)
    .map(([k, v]) => `<tr><td>${paymentLabel[k] || k}</td><td class="r">${formatBRL(v)}</td></tr>`).join("");
  const movRows = movs.map((m) => `<tr><td>${m.type === "sangria" ? "− Sangria" : "+ Reforço"}${m.reason ? " · " + m.reason : ""}</td><td class="r">${formatBRL(m.amount)}</td></tr>`).join("");
  return `
    <h1>FECHAMENTO DE CAIXA</h1>
    <hr/>
    <div>Abertura: ${new Date(session.opened_at).toLocaleString("pt-BR")}</div>
    <div>Fechamento: ${new Date().toLocaleString("pt-BR")}</div>
    <hr/>
    <h2>Resumo (dinheiro)</h2>
    <table>
      <tr><td>Fundo de abertura</td><td class="r">${formatBRL(t.opening)}</td></tr>
      <tr><td>Vendas em dinheiro</td><td class="r">${formatBRL(t.cashSales)}</td></tr>
      <tr><td>Reforços</td><td class="r">${formatBRL(t.reforco)}</td></tr>
      <tr><td>Sangrias</td><td class="r">− ${formatBRL(t.sangria)}</td></tr>
      <tr><td class="b">Esperado</td><td class="r b">${formatBRL(t.expected)}</td></tr>
      <tr><td class="b">Contado</td><td class="r b">${formatBRL(counted)}</td></tr>
      <tr><td class="b">Diferença</td><td class="r b">${formatBRL(diff)}</td></tr>
    </table>
    <hr/>
    <h2>Vendas por forma</h2>
    <table>${pay || '<tr><td colspan="2">Sem vendas</td></tr>'}
      <tr><td class="b">Total vendas</td><td class="r b">${formatBRL(t.salesTotal)}</td></tr>
    </table>
    ${movRows ? `<hr/><h2>Movimentações</h2><table>${movRows}</table>` : ""}
    ${notes ? `<hr/><div><b>Obs:</b> ${notes}</div>` : ""}
    <hr/>
    <div style="text-align:center">— Caixa fechado —</div>
  `;
}
