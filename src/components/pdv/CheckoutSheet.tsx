import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, paymentLabels } from "@/lib/format";
import { Banknote, CreditCard, QrCode, Ticket, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Method = "cash" | "pix" | "debit" | "credit" | "meal_voucher" | "credit_note";
type CartItem = { product: { id: string; name: string; price: number }; qty: number };
type Customer = { id: string; name: string; phone: string | null; credit_balance: number };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cart: CartItem[];
  subtotal: number;
  onConfirmed: (receipt: import("@/lib/receipt").ReceiptData) => void;
};

const methodIcons: Record<Method, any> = {
  cash: Banknote,
  pix: QrCode,
  debit: CreditCard,
  credit: CreditCard,
  meal_voucher: Ticket,
  credit_note: UserPlus,
};

export const CheckoutSheet = ({ open, onOpenChange, cart, subtotal, onConfirmed }: Props) => {
  const { user } = useAuth();
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [splits, setSplits] = useState<{ method: Method; amount: number }[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const total = Math.max(0, subtotal - discount);
  const paidSum = splits.reduce((s, x) => s + x.amount, 0);
  const remaining = +(total - paidSum).toFixed(2);
  const hasCredit = splits.some((s) => s.method === "credit_note");

  useEffect(() => {
    if (open) {
      setDiscount(0);
      setNotes("");
      setSplits([]);
      setCustomerId(null);
      supabase.from("customers").select("id,name,phone,credit_balance").order("name").then(({ data }) => {
        setCustomers((data ?? []).map((c) => ({ ...c, credit_balance: Number(c.credit_balance) })));
      });
    }
  }, [open]);

  const addSplit = (method: Method) => {
    setSplits((s) => [...s, { method, amount: +remaining.toFixed(2) > 0 ? +remaining.toFixed(2) : 0 }]);
  };

  const updateSplit = (i: number, amount: number) => {
    setSplits((s) => s.map((x, idx) => (idx === i ? { ...x, amount } : x)));
  };

  const removeSplit = (i: number) => setSplits((s) => s.filter((_, idx) => idx !== i));

  const createCustomer = async () => {
    if (!newCustName.trim()) return toast.error("Informe o nome");
    const { data, error } = await supabase
      .from("customers")
      .insert({ name: newCustName.trim(), phone: newCustPhone || null })
      .select()
      .single();
    if (error) return toast.error(error.message);
    const c = { ...data, credit_balance: Number(data.credit_balance) };
    setCustomers((cs) => [...cs, c]);
    setCustomerId(c.id);
    setShowNewCustomer(false);
    setNewCustName("");
    setNewCustPhone("");
    toast.success("Cliente cadastrado");
  };

  const confirm = async () => {
    if (!user) return;
    if (cart.length === 0) return;
    if (Math.abs(remaining) > 0.01) return toast.error("Valor pago não confere com o total");
    if (hasCredit && !customerId) return toast.error("Selecione um cliente para fiado");

    setSaving(true);
    try {
      const creditAmount = splits.filter((s) => s.method === "credit_note").reduce((a, b) => a + b.amount, 0);
      const paidAmount = total - creditAmount;
      const status = creditAmount === 0 ? "paid" : paidAmount === 0 ? "credit" : "partial";

      const { data: sale, error: e1 } = await supabase
        .from("sales")
        .insert({
          operator_id: user.id,
          customer_id: customerId,
          subtotal,
          discount,
          total,
          paid_amount: paidAmount,
          credit_amount: creditAmount,
          status,
          notes: notes || null,
        })
        .select()
        .single();
      if (e1) throw e1;

      const items = cart.map((c) => ({
        sale_id: sale.id,
        product_id: c.product.id,
        product_name: c.product.name,
        unit_price: c.product.price,
        quantity: c.qty,
        subtotal: c.product.price * c.qty,
      }));
      const { error: e2 } = await supabase.from("sale_items").insert(items);
      if (e2) throw e2;

      const payments = splits.map((s) => ({
        sale_id: sale.id,
        customer_id: s.method === "credit_note" ? customerId : null,
        method: s.method,
        amount: s.amount,
        status: (s.method === "credit_note" ? "pending" : "paid") as "paid" | "pending",
        paid_at: s.method === "credit_note" ? null : new Date().toISOString(),
        created_by: user.id,
      }));
      const { error: e3 } = await supabase.from("payments").insert(payments);
      if (e3) throw e3;

      if (creditAmount > 0 && customerId) {
        const c = customers.find((x) => x.id === customerId);
        await supabase
          .from("customers")
          .update({ credit_balance: (c?.credit_balance ?? 0) + creditAmount })
          .eq("id", customerId);
      }

      const customer = customerId ? customers.find((c) => c.id === customerId) : null;
      onConfirmed({
        saleId: sale.id,
        createdAt: sale.created_at,
        items: cart.map((c) => ({
          name: c.product.name,
          qty: c.qty,
          unitPrice: c.product.price,
          subtotal: c.product.price * c.qty,
        })),
        subtotal,
        discount,
        total,
        payments: splits.map((s) => ({
          method: s.method,
          amount: s.amount,
          status: (s.method === "credit_note" ? "pending" : "paid") as "paid" | "pending",
        })),
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        notes: notes || null,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar venda");
    } finally {
      setSaving(false);
    }
  };

  const methods: Method[] = ["cash", "pix", "debit", "credit", "meal_voucher", "credit_note"];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl text-left">Receber pagamento</SheetTitle>
        </SheetHeader>

        <div className="mt-3 rounded-lg bg-muted/50 p-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatBRL(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-muted-foreground">Desconto</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={discount || ""}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              className="h-8 w-24 text-right"
            />
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-border">
            <span className="font-display text-lg">Total</span>
            <span className="font-display text-2xl text-primary">{formatBRL(total)}</span>
          </div>
        </div>

        <div className="mt-4">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Forma de pagamento</Label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {methods.map((m) => {
              const Icon = methodIcons[m];
              return (
                <button
                  key={m}
                  onClick={() => addSplit(m)}
                  className="rounded-lg border border-border bg-card p-2.5 flex flex-col items-center gap-1 active:scale-95 transition shadow-card-retro"
                >
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-[11px] font-display">{paymentLabels[m]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {splits.length > 0 && (
          <div className="mt-3 space-y-2">
            {splits.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                <span className="text-xs font-medium flex-1">{paymentLabels[s.method]}</span>
                <Input
                  type="number"
                  step="0.01"
                  value={s.amount || ""}
                  onChange={(e) => updateSplit(i, Number(e.target.value) || 0)}
                  className="h-8 w-24 text-right"
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeSplit(i)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className={cn("text-xs text-right font-medium", Math.abs(remaining) < 0.01 ? "text-success" : "text-destructive")}>
              {Math.abs(remaining) < 0.01 ? "✓ Total batido" : `Falta ${formatBRL(remaining)}`}
            </div>
          </div>
        )}

        {hasCredit && (
          <div className="mt-3 rounded-lg border border-accent/40 bg-accent/10 p-3">
            <Label className="text-xs uppercase tracking-wider">Cliente do fiado</Label>
            <div className="mt-2 flex gap-2">
              <select
                value={customerId ?? ""}
                onChange={(e) => setCustomerId(e.target.value || null)}
                className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— selecione —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.credit_balance > 0 ? `(deve ${formatBRL(c.credit_balance)})` : ""}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={() => setShowNewCustomer((v) => !v)}>
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
            {showNewCustomer && (
              <div className="mt-2 space-y-2">
                <Input placeholder="Nome do cliente" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} />
                <Input placeholder="Telefone (opcional)" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} />
                <Button size="sm" className="w-full" onClick={createCustomer}>Cadastrar cliente</Button>
              </div>
            )}
          </div>
        )}

        <div className="mt-3">
          <Label htmlFor="notes" className="text-xs uppercase tracking-wider text-muted-foreground">Observação</Label>
          <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: sem cebola, retirar 20h..." />
        </div>

        <Button className="w-full mt-4 h-12 font-display text-lg" onClick={confirm} disabled={saving || splits.length === 0}>
          Confirmar venda
        </Button>
      </SheetContent>
    </Sheet>
  );
};
