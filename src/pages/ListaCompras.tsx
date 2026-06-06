import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, AlertTriangle, RotateCcw } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  stock_quantity: number;
  min_stock: number;
  active: boolean;
};

export default function ListaCompras() {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [onlyLow, setOnlyLow] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ingredients" as any)
        .select("*")
        .eq("active", true)
        .order("name");
      const list = (data as any as Ingredient[]) || [];
      setItems(list);
      const initQty: Record<string, number> = {};
      list.forEach((i) => {
        const suggested = Math.max(0, Number(i.min_stock) - Number(i.stock_quantity));
        initQty[i.id] = suggested > 0 ? suggested : 0;
      });
      setQty(initQty);
      setLoading(false);
    })();
  }, []);

  const visible = useMemo(
    () => (onlyLow ? items.filter((i) => Number(i.stock_quantity) <= Number(i.min_stock)) : items),
    [items, onlyLow]
  );

  const total = useMemo(
    () => visible.reduce((s, i) => s + (qty[i.id] || 0) * Number(i.cost_per_unit), 0),
    [visible, qty]
  );

  const resetSuggested = () => {
    const next: Record<string, number> = {};
    items.forEach((i) => {
      const sug = Math.max(0, Number(i.min_stock) - Number(i.stock_quantity));
      next[i.id] = sug > 0 ? sug : 0;
    });
    setQty(next);
    setChecked({});
  };

  const today = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());

  return (
    <AppShell
      title="Lista de Compras"
      action={
        <div className="flex gap-1 print:hidden">
          <Button size="icon" variant="outline" onClick={resetSuggested} title="Recalcular sugestões">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => window.print()} title="Imprimir">
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="print:hidden mb-3 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={onlyLow} onCheckedChange={(v) => setOnlyLow(!!v)} />
          Só abaixo do mínimo
        </label>
        <p className="text-xs text-muted-foreground">{visible.length} itens</p>
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">Lista de Compras</h1>
        <p className="text-xs">{today}</p>
      </div>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-8">Carregando...</p>
      ) : visible.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhum insumo cadastrado.</p>
      ) : (
        <Card className="divide-y divide-border print:border-0 print:shadow-none">
          {visible.map((i) => {
            const low = Number(i.stock_quantity) <= Number(i.min_stock);
            const q = qty[i.id] ?? 0;
            const isChecked = !!checked[i.id];
            return (
              <div
                key={i.id}
                className={cn(
                  "flex items-center gap-3 p-3 print:py-1.5",
                  isChecked && "opacity-60"
                )}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(v) => setChecked((c) => ({ ...c, [i.id]: !!v }))}
                  className="h-5 w-5 print:border-black"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className={cn("font-medium truncate", isChecked && "line-through")}>
                      {i.name}
                    </p>
                    {low && (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive print:hidden" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground print:text-black">
                    Estoque: {Number(i.stock_quantity).toLocaleString("pt-BR")} {i.unit} · Mín: {Number(i.min_stock).toLocaleString("pt-BR")} · {formatBRL(Number(i.cost_per_unit))}/{i.unit}
                  </p>
                </div>
                <div className="flex items-center gap-1 print:gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    value={q}
                    onChange={(e) =>
                      setQty((s) => ({ ...s, [i.id]: parseFloat(e.target.value) || 0 }))
                    }
                    className="h-8 w-20 text-right print:hidden"
                  />
                  <span className="hidden print:inline text-sm font-medium">
                    {q.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-xs text-muted-foreground print:text-black w-8">
                    {i.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <div className="mt-4 flex items-center justify-between rounded-md bg-muted px-4 py-3 print:bg-transparent print:border-t print:border-black print:mt-6">
        <span className="font-medium">Total estimado</span>
        <span className="text-lg font-bold">{formatBRL(total)}</span>
      </div>

      <style>{`
        @media print {
          @page { margin: 12mm; }
          nav, header, footer { display: none !important; }
          body { background: white !important; }
          main { max-width: 100% !important; padding: 0 !important; }
        }
      `}</style>
    </AppShell>
  );
}
