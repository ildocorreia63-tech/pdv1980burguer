import { formatBRL, formatDate, paymentLabels } from "./format";

export type ReceiptData = {
  saleId: string;
  createdAt: string | Date;
  items: { name: string; qty: number; unitPrice: number; subtotal: number }[];
  subtotal: number;
  discount: number;
  total: number;
  payments: { method: string; amount: number; status: "paid" | "pending" }[];
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  operatorName?: string | null;
};

const sanitizePhone = (p?: string | null) => (p ?? "").replace(/\D/g, "");

export const buildReceiptText = (r: ReceiptData) => {
  const lines: string[] = [];
  lines.push("*🍔 1980 BURGUER*");
  lines.push("_A sua hamburgueria_");
  lines.push("━━━━━━━━━━━━━━━━");
  lines.push(`🧾 Pedido: #${r.saleId.slice(0, 8).toUpperCase()}`);
  lines.push(`🕒 ${formatDate(r.createdAt)}`);
  if (r.customerName) lines.push(`👤 Cliente: ${r.customerName}`);
  if (r.operatorName) lines.push(`👨‍🍳 Operador: ${r.operatorName}`);
  lines.push("━━━━━━━━━━━━━━━━");
  lines.push("*ITENS*");
  r.items.forEach((it) => {
    lines.push(`• ${it.qty}x ${it.name}`);
    lines.push(`   ${formatBRL(it.unitPrice)} = ${formatBRL(it.subtotal)}`);
  });
  lines.push("━━━━━━━━━━━━━━━━");
  lines.push(`Subtotal: ${formatBRL(r.subtotal)}`);
  if (r.discount > 0) lines.push(`Desconto: -${formatBRL(r.discount)}`);
  lines.push(`*TOTAL: ${formatBRL(r.total)}*`);
  lines.push("");
  lines.push("*PAGAMENTO*");
  r.payments.forEach((p) => {
    const tag = p.status === "pending" ? " (FIADO)" : "";
    lines.push(`• ${paymentLabels[p.method] ?? p.method}: ${formatBRL(p.amount)}${tag}`);
  });
  if (r.notes) {
    lines.push("");
    lines.push(`📝 Obs: ${r.notes}`);
  }
  lines.push("━━━━━━━━━━━━━━━━");
  lines.push("Obrigado pela preferência! 🍟");
  lines.push("📞 11 93924-3407 | @1980burguer");
  return lines.join("\n");
};

export const openWhatsApp = (text: string, phone?: string | null) => {
  const phoneDigits = sanitizePhone(phone);
  const url = phoneDigits
    ? `https://wa.me/${phoneDigits.length <= 11 ? "55" + phoneDigits : phoneDigits}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
};

export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export const shareReceipt = async (text: string) => {
  if (navigator.share) {
    try {
      await navigator.share({ title: "Comprovante 1980 Burguer", text });
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

export const printReceipt = (r: ReceiptData) => {
  const esc = (s: unknown) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const w = window.open("", "_blank", "width=380,height=600");
  if (!w) return;
  const itemsHtml = r.items
    .map(
      (it) =>
        `<tr><td>${it.qty}x ${esc(it.name)}</td><td style="text-align:right">${formatBRL(it.subtotal)}</td></tr>`
    )
    .join("");
  const paysHtml = r.payments
    .map(
      (p) =>
        `<div>${esc(paymentLabels[p.method] ?? p.method)}${p.status === "pending" ? " (FIADO)" : ""}: <strong>${formatBRL(p.amount)}</strong></div>`
    )
    .join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Comprovante #${r.saleId.slice(0, 8)}</title>
  <style>
    body { font-family: 'Courier New', monospace; padding: 12px; max-width: 320px; margin: 0 auto; font-size: 12px; color: #000; }
    h1 { text-align: center; margin: 0; font-size: 18px; }
    .sub { text-align: center; font-size: 10px; margin-bottom: 8px; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    .total { font-size: 16px; font-weight: bold; text-align: right; }
    .footer { text-align: center; margin-top: 8px; font-size: 10px; }
  </style></head><body>
    <h1>1980 BURGUER</h1>
    <div class="sub">A sua hamburgueria</div>
    <hr>
    <div>Pedido: #${r.saleId.slice(0, 8).toUpperCase()}</div>
    <div>${formatDate(r.createdAt)}</div>
    ${r.customerName ? `<div>Cliente: ${r.customerName}</div>` : ""}
    ${r.operatorName ? `<div>Operador: ${r.operatorName}</div>` : ""}
    <hr>
    <table>${itemsHtml}</table>
    <hr>
    <div>Subtotal: ${formatBRL(r.subtotal)}</div>
    ${r.discount > 0 ? `<div>Desconto: -${formatBRL(r.discount)}</div>` : ""}
    <div class="total">TOTAL ${formatBRL(r.total)}</div>
    <hr>
    <div><strong>PAGAMENTO</strong></div>
    ${paysHtml}
    ${r.notes ? `<hr><div>Obs: ${r.notes}</div>` : ""}
    <hr>
    <div class="footer">Obrigado pela preferência!<br>11 93924-3407 — @1980burguer</div>
    <script>window.onload=()=>{window.print();}</script>
  </body></html>`);
  w.document.close();
};
