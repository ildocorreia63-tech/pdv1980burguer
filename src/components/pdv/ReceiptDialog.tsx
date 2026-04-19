import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ReceiptData, buildReceiptText, openWhatsApp, copyToClipboard, printReceipt, shareReceipt } from "@/lib/receipt";
import { formatBRL, formatDate, paymentLabels } from "@/lib/format";
import { MessageCircle, Copy, Printer, Share2, Check } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  receipt: ReceiptData | null;
};

export const ReceiptDialog = ({ open, onOpenChange, receipt }: Props) => {
  const [copied, setCopied] = useState(false);
  if (!receipt) return null;
  const text = buildReceiptText(receipt);

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      toast.success("Comprovante copiado!");
      setTimeout(() => setCopied(false), 2000);
    } else toast.error("Não foi possível copiar");
  };

  const handleWhatsApp = () => {
    openWhatsApp(text, receipt.customerPhone);
  };

  const handleShare = async () => {
    const ok = await shareReceipt(text);
    if (!ok) handleCopy();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <Check className="h-6 w-6 text-success" /> Comprovante
          </DialogTitle>
        </DialogHeader>

        <Card className="p-3 bg-muted/30 font-mono text-xs">
          <p className="font-display text-base text-center text-primary">🍔 1980 BURGUER</p>
          <p className="text-center text-[10px] text-muted-foreground mb-2">A sua hamburgueria</p>
          <div className="border-t border-dashed border-border my-1" />
          <p>Pedido: #{receipt.saleId.slice(0, 8).toUpperCase()}</p>
          <p>{formatDate(receipt.createdAt)}</p>
          {receipt.customerName && <p>Cliente: {receipt.customerName}</p>}
          <div className="border-t border-dashed border-border my-1" />
          {receipt.items.map((it, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="flex-1">{it.qty}x {it.name}</span>
              <span>{formatBRL(it.subtotal)}</span>
            </div>
          ))}
          <div className="border-t border-dashed border-border my-1" />
          <div className="flex justify-between"><span>Subtotal</span><span>{formatBRL(receipt.subtotal)}</span></div>
          {receipt.discount > 0 && (
            <div className="flex justify-between text-destructive"><span>Desconto</span><span>-{formatBRL(receipt.discount)}</span></div>
          )}
          <div className="flex justify-between font-bold text-sm mt-1"><span>TOTAL</span><span>{formatBRL(receipt.total)}</span></div>
          <div className="border-t border-dashed border-border my-1" />
          <p className="font-semibold">PAGAMENTO</p>
          {receipt.payments.map((p, i) => (
            <div key={i} className="flex justify-between">
              <span>{paymentLabels[p.method] ?? p.method}{p.status === "pending" ? " (FIADO)" : ""}</span>
              <span>{formatBRL(p.amount)}</span>
            </div>
          ))}
          {receipt.notes && <p className="mt-1">Obs: {receipt.notes}</p>}
        </Card>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <Button onClick={handleWhatsApp} className="bg-[#25D366] hover:bg-[#1fb958] text-white col-span-2 h-12 font-display text-base">
            <MessageCircle className="h-5 w-5 mr-2" /> Enviar pelo WhatsApp
          </Button>
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            Copiar
          </Button>
          <Button variant="outline" onClick={() => printReceipt(receipt)}>
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </Button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <Button variant="outline" onClick={handleShare} className="col-span-2">
              <Share2 className="h-4 w-4 mr-1" /> Compartilhar (sistema)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
