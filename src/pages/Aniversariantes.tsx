import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errors";
import { Cake, MessageCircle, BellRing, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface BirthdayCustomer {
  id: string;
  name: string;
  phone: string | null;
  birth_date: string; // ISO date
  day: number;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const storageKey = (year: number, month: number) => `birthday_invites_${year}_${month}`;

const onlyDigits = (v?: string | null) => (v ?? "").replace(/\D/g, "");

export default function Aniversariantes() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [rows, setRows] = useState<BirthdayCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState<string[]>([]);
  const [message, setMessage] = useState(
    "Olá {nome}! 🎉 A equipe do 1980 Burguer deseja um feliz aniversário! Vem comemorar com a gente — temos um mimo te esperando. 🍔",
  );

  const year = today.getFullYear();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(year, month));
      setSent(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setSent([]);
    }
  }, [year, month]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("customers")
      .select("id,name,phone,birth_date")
      .not("birth_date", "is", null)
      .order("name")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          handleError(error, "Não foi possível carregar os clientes");
          setLoading(false);
          return;
        }
        const list = (data ?? [])
          .filter((c) => typeof c.birth_date === "string" && c.birth_date.length >= 10)
          .map((c) => {
            const [, m, d] = (c.birth_date as string).split("-");
            return {
              id: c.id,
              name: c.name,
              phone: c.phone,
              birth_date: c.birth_date as string,
              month: Number(m) - 1,
              day: Number(d),
            };
          })
          .filter((c) => c.month === month)
          .sort((a, b) => a.day - b.day)
          .map(({ month: _m, ...rest }) => rest);
        setRows(list);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month]);

  const markSent = (id: string) => {
    setSent((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      try {
        localStorage.setItem(storageKey(year, month), JSON.stringify(next));
      } catch {
        /* storage indisponível — ignora */
      }
      return next;
    });
  };

  const sendInvite = (c: BirthdayCustomer) => {
    const phone = onlyDigits(c.phone);
    if (phone.length < 10) {
      toast.error("Cliente sem WhatsApp válido cadastrado");
      return;
    }
    const text = message.replace(/\{nome\}/g, c.name.split(" ")[0] ?? c.name);
    const target = phone.startsWith("55") ? phone : `55${phone}`;
    window.open(`https://wa.me/${target}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    markSent(c.id);
  };

  const upcoming = useMemo(
    () =>
      month === today.getMonth()
        ? rows.filter((r) => r.day >= today.getDate() && r.day <= today.getDate() + 3)
        : [],
    [rows, month, today],
  );

  const pending = rows.filter((r) => !sent.includes(r.id)).length;

  return (
    <AppShell title="Aniversariantes">
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => setMonth(i)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-display transition",
                i === month
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {m.slice(0, 3)}
            </button>
          ))}
        </div>

        {upcoming.length > 0 && (
          <div className="rounded-lg border border-accent/40 bg-accent/10 p-3">
            <div className="flex items-center gap-2 text-sm font-display">
              <BellRing className="h-4 w-4 text-accent-foreground" />
              Lembrete: {upcoming.length} aniversário(s) nos próximos dias
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {upcoming.map((u) => `${u.name} (dia ${u.day})`).join(" · ")}
            </p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-3">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Mensagem do convite (use {"{nome}"})
          </label>
          <Input className="mt-2" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="font-display text-lg">
            {MONTHS[month]} · {rows.length} cliente(s)
          </span>
          <Badge variant="secondary">{pending} sem convite</Badge>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum cliente com aniversário em {MONTHS[month]}.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((c) => {
              const already = sent.includes(c.id);
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-card-retro"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Cake className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Dia {c.day} · {c.phone ? c.phone : "sem WhatsApp"}
                    </p>
                  </div>
                  {already && (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <Check className="h-3 w-3" /> enviado
                    </span>
                  )}
                  <Button size="sm" variant={already ? "outline" : "default"} onClick={() => sendInvite(c)}>
                    <MessageCircle className="mr-1 h-4 w-4" />
                    Convidar
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
