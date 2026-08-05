import { useEffect, useMemo, useState } from "react";
import { CalendarDays, PackageOpen, ReceiptText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { handleError } from "@/lib/errors";

interface CustomerSummary {
  id: string;
  name: string;
}

interface SaleHistoryRow {
  id: string;
  created_at: string;
  total: number;
}

interface SaleItemHistoryRow {
  id: string;
  sale_id: string;
  product_name: string;
  quantity: number;
  subtotal: number;
}

interface CustomerPurchaseHistoryDialogProps {
  customer: CustomerSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerPurchaseHistoryDialog({
  customer,
  open,
  onOpenChange,
}: CustomerPurchaseHistoryDialogProps) {
  const [sales, setSales] = useState<SaleHistoryRow[]>([]);
  const [items, setItems] = useState<SaleItemHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !customer) return;

    let active = true;
    const loadHistory = async () => {
      setLoading(true);
      const { data: saleRows, error: salesError } = await supabase
        .from("sales")
        .select("id,created_at,total")
        .eq("customer_id", customer.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!active) return;
      if (salesError) {
        setLoading(false);
        handleError(salesError, "Não foi possível carregar o histórico de compras");
        return;
      }

      const normalizedSales = (saleRows ?? []).map((sale) => ({
        ...sale,
        total: Number(sale.total ?? 0),
      }));
      const saleIds = normalizedSales.map((sale) => sale.id);

      if (saleIds.length === 0) {
        setSales([]);
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: itemRows, error: itemsError } = await supabase
        .from("sale_items")
        .select("id,sale_id,product_name,quantity,subtotal")
        .in("sale_id", saleIds)
        .order("created_at", { ascending: true });

      if (!active) return;
      setLoading(false);
      if (itemsError) {
        handleError(itemsError, "Não foi possível carregar os itens das compras");
        return;
      }

      setSales(normalizedSales);
      setItems(
        (itemRows ?? []).map((item) => ({
          ...item,
          quantity: Number(item.quantity ?? 0),
          subtotal: Number(item.subtotal ?? 0),
        })),
      );
    };

    loadHistory();
    return () => {
      active = false;
    };
  }, [customer, open]);

  const itemsBySale = useMemo(() => {
    const grouped = new Map<string, SaleItemHistoryRow[]>();
    items.forEach((item) => grouped.set(item.sale_id, [...(grouped.get(item.sale_id) ?? []), item]));
    return grouped;
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" /> Histórico de compras
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{customer?.name}</p>
        </DialogHeader>

        {loading && (
          <div className="space-y-3" aria-label="Carregando histórico">
            {[1, 2, 3].map((key) => <Skeleton key={key} className="h-24 w-full" />)}
          </div>
        )}

        {!loading && sales.length === 0 && (
          <div className="py-10 text-center text-muted-foreground">
            <PackageOpen className="mx-auto mb-2 h-8 w-8" />
            <p className="text-sm">Nenhuma compra encontrada.</p>
          </div>
        )}

        {!loading && sales.length > 0 && (
          <div className="space-y-3">
            {sales.map((sale) => (
              <section key={sale.id} className="rounded-md border border-border p-3">
                <header className="mb-2 flex items-center justify-between gap-3 border-b border-border pb-2">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" /> {formatDate(sale.created_at)}
                  </span>
                  <strong className="font-display text-primary">{formatBRL(sale.total)}</strong>
                </header>
                <div className="space-y-1.5">
                  {(itemsBySale.get(sale.id) ?? []).map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 flex-1">{item.quantity}x {item.product_name}</span>
                      <span className="shrink-0 text-muted-foreground">{formatBRL(item.subtotal)}</span>
                    </div>
                  ))}
                  {(itemsBySale.get(sale.id) ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">Itens não disponíveis.</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}