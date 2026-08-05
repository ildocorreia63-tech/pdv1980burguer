import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { handleError } from "@/lib/errors";
import { CustomerPurchaseHistoryDialog } from "@/components/customers/CustomerPurchaseHistoryDialog";
import { Plus, Phone, Mail, Cake, Pencil, Search, ReceiptText } from "lucide-react";
import { toast } from "sonner";

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpf: string | null;
  birth_date: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_reference: string | null;
  notes: string | null;
  credit_balance: number;
}

type Draft = Omit<CustomerRow, "id" | "credit_balance"> & { id?: string };

const emptyDraft: Draft = {
  name: "",
  phone: "",
  email: "",
  cpf: "",
  birth_date: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_reference: "",
  notes: "",
};

const onlyDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export default function Clientes() {
  const [list, setList] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [historyCustomer, setHistoryCustomer] = useState<CustomerRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id,name,phone,email,cpf,birth_date,address_street,address_number,address_complement,address_reference,notes,credit_balance",
      )
      .order("name", { ascending: true });
    setLoading(false);
    if (error) return handleError(error, "Não foi possível carregar os clientes");
    setList((data ?? []).map((c) => ({ ...c, credit_balance: Number(c.credit_balance ?? 0) })));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    const qDigits = onlyDigits(q);
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (qDigits.length > 0 &&
          (onlyDigits(c.phone).includes(qDigits) || onlyDigits(c.cpf).includes(qDigits))),
    );
  }, [list, search]);

  const openNew = () => {
    setDraft(emptyDraft);
    setOpen(true);
  };

  const openEdit = (c: CustomerRow) => {
    setDraft({
      id: c.id,
      name: c.name ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      cpf: c.cpf ?? "",
      birth_date: c.birth_date ?? "",
      address_street: c.address_street ?? "",
      address_number: c.address_number ?? "",
      address_complement: c.address_complement ?? "",
      address_reference: c.address_reference ?? "",
      notes: c.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    const name = (draft.name ?? "").trim();
    if (name.length < 2) return toast.error("Informe o nome do cliente");

    const phone = onlyDigits(draft.phone);
    if (phone && (phone.length < 10 || phone.length > 13)) return toast.error("WhatsApp inválido");

    const cpf = onlyDigits(draft.cpf);
    if (cpf && cpf.length !== 11) return toast.error("CPF inválido");

    const email = (draft.email ?? "").trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast.error("E-mail inválido");

    const payload = {
      name,
      phone: phone || null,
      email: email || null,
      cpf: cpf || null,
      birth_date: draft.birth_date || null,
      address_street: (draft.address_street ?? "").trim() || null,
      address_number: (draft.address_number ?? "").trim() || null,
      address_complement: (draft.address_complement ?? "").trim() || null,
      address_reference: (draft.address_reference ?? "").trim() || null,
      notes: (draft.notes ?? "").trim() || null,
    };

    setSaving(true);
    const { error } = draft.id
      ? await supabase.from("customers").update(payload).eq("id", draft.id)
      : await supabase.from("customers").insert(payload);
    setSaving(false);

    if (error) return handleError(error, "Não foi possível salvar o cliente");
    toast.success(draft.id ? "Cliente atualizado!" : "Cliente cadastrado!");
    setOpen(false);
    load();
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <AppShell
      title="Clientes"
      action={
        <Button size="icon" variant="outline" onClick={openNew} aria-label="Novo cliente">
          <Plus className="h-4 w-4" />
        </Button>
      }
    >
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, WhatsApp, CPF ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <p className="mb-2 text-xs text-muted-foreground">
        {filtered.length} cliente{filtered.length === 1 ? "" : "s"}
      </p>

      <div className="space-y-2">
        {filtered.map((c) => (
          <Card key={c.id} className="p-3 shadow-card-retro flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{c.name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {c.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {c.phone}
                  </span>
                )}
                {c.email && (
                  <span className="flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3" /> {c.email}
                  </span>
                )}
                {c.birth_date && (
                  <span className="flex items-center gap-1">
                    <Cake className="h-3 w-3" /> {c.birth_date.split("-").reverse().join("/")}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p
                className={`font-display text-sm ${c.credit_balance > 0 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {formatBRL(c.credit_balance)}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setHistoryCustomer(c)}
              aria-label={`Ver histórico de ${c.name}`}
            >
              <ReceiptText className="h-4 w-4 text-primary" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)} aria-label="Editar cliente">
              <Pencil className="h-4 w-4 text-primary" />
            </Button>
          </Card>
        ))}
        {!loading && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
        )}
        {loading && <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={draft.name ?? ""} onChange={(e) => set({ name: e.target.value })} maxLength={120} />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <Label>WhatsApp</Label>
                <Input
                  inputMode="numeric"
                  value={draft.phone ?? ""}
                  onChange={(e) => set({ phone: e.target.value })}
                  placeholder="11999998888"
                  maxLength={20}
                />
              </div>
              <div>
                <Label>CPF</Label>
                <Input
                  inputMode="numeric"
                  value={draft.cpf ?? ""}
                  onChange={(e) => set({ cpf: e.target.value })}
                  placeholder="00000000000"
                  maxLength={14}
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={draft.email ?? ""}
                  onChange={(e) => set({ email: e.target.value })}
                  maxLength={255}
                />
              </div>
              <div>
                <Label>Aniversário</Label>
                <Input
                  type="date"
                  value={draft.birth_date ?? ""}
                  onChange={(e) => set({ birth_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Rua</Label>
                <Input
                  value={draft.address_street ?? ""}
                  onChange={(e) => set({ address_street: e.target.value })}
                  maxLength={160}
                />
              </div>
              <div>
                <Label>Número</Label>
                <Input
                  value={draft.address_number ?? ""}
                  onChange={(e) => set({ address_number: e.target.value })}
                  maxLength={20}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Complemento</Label>
                <Input
                  value={draft.address_complement ?? ""}
                  onChange={(e) => set({ address_complement: e.target.value })}
                  maxLength={120}
                />
              </div>
              <div>
                <Label>Referência</Label>
                <Input
                  value={draft.address_reference ?? ""}
                  onChange={(e) => set({ address_reference: e.target.value })}
                  maxLength={160}
                />
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={draft.notes ?? ""}
                onChange={(e) => set({ notes: e.target.value })}
                rows={2}
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter>
            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerPurchaseHistoryDialog
        customer={historyCustomer}
        open={historyCustomer !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setHistoryCustomer(null);
        }}
      />
    </AppShell>
  );
}
