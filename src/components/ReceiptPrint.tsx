import { formatCurrency, formatDate } from "../lib/utils";

export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
  amount: number;
}

export interface ReceiptData {
  title: string;
  subtitle?: string;
  reference: string;
  date: number;
  customerName?: string;
  customerContact?: string;
  paymentMethod?: string;
  location?: string;
  items: ReceiptItem[];
  total: number;
  paid: number;
  balance: number;
  footer?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PRINT_STYLE = `
@media print {
  @page { size: 80mm auto; margin: 0; }
  body > * { display: none !important; }
  [data-print-root] {
    display: block !important;
    width: 80mm;
    margin: 0;
    padding: 4mm 3mm;
  }
}
`;

function buildBody(data: ReceiptData): string {
  const row = (label: string, value: string) =>
    `<div style="display:flex;justify-content:space-between"><span>${label}</span><span>${value}</span></div>`;

  const itemsHtml = data.items
    .map(
      (it) => `
      <div style="display:flex;justify-content:space-between">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.name)}</span>
        <span style="width:11mm;text-align:right">${it.qty}</span>
        <span style="width:18mm;text-align:right">${formatCurrency(it.price)}</span>
        <span style="width:18mm;text-align:right">${formatCurrency(it.amount)}</span>
      </div>`
    )
    .join("");

  return `
  <div style="width:80mm;padding:4mm 3mm;margin:0;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.4;color:#000;background:#fff">
    <div style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;text-align:center">${esc(data.title)}</div>
    ${data.subtitle ? `<div style="font-size:12px;font-weight:700;text-align:center">${esc(data.subtitle)}</div>` : ""}
    <div style="text-align:center;margin-bottom:2mm">Textile ERP</div>
    <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:1.5mm 0;margin-bottom:1.5mm">
      ${row("Invoice#:", esc(data.reference))}
      ${row("Date:", esc(formatDate(data.date, true)))}
      ${data.customerName ? row("Customer:", esc(data.customerName)) : ""}
      ${data.customerContact ? row("Contact:", esc(data.customerContact)) : ""}
      ${data.paymentMethod ? row("Payment:", esc(data.paymentMethod)) : ""}
      ${data.location ? row("Location:", esc(data.location)) : ""}
    </div>
    <div style="display:flex;font-weight:700;border-bottom:1px solid #000;padding-bottom:1mm;margin-bottom:1mm">
      <span style="flex:1">Item</span><span style="width:11mm;text-align:right">Qty</span><span style="width:18mm;text-align:right">Rate</span><span style="width:18mm;text-align:right">Amt</span>
    </div>
    <div>${itemsHtml}</div>
    <div style="border-top:1px solid #000;margin-top:1.5mm;padding-top:1.5mm">
      <div style="display:flex;justify-content:space-between;font-weight:700"><span>TOTAL</span><span>${formatCurrency(data.total)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Paid</span><span>${formatCurrency(data.paid)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Balance</span><span>${formatCurrency(data.balance)}</span></div>
    </div>
    <div style="text-align:center;margin-top:3mm">${esc(data.footer ?? "Thank you for your business!")}</div>
  </div>`;
}

/**
 * Print a thermal-style receipt at exactly 80mm width. The receipt is appended
 * directly to the main document and `@media print` hides the app UI, so the
 * browser applies the `@page { size: 80mm auto }` rule and sizes to thermal
 * paper. Cleaned up automatically after printing.
 */
export function printReceipt(data: ReceiptData) {
  document.querySelectorAll("[data-print-root]").forEach((el) => el.remove());
  document.querySelectorAll("[data-print-style]").forEach((el) => el.remove());

  const style = document.createElement("style");
  style.setAttribute("data-print-style", "");
  style.textContent = PRINT_STYLE;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.setAttribute("data-print-root", "");
  root.innerHTML = buildBody(data);
  document.body.appendChild(root);

  const cleanup = () => {
    window.clearTimeout(timer);
    document.querySelectorAll("[data-print-root]").forEach((el) => el.remove());
    document.querySelectorAll("[data-print-style]").forEach((el) => el.remove());
    window.removeEventListener("afterprint", cleanup);
  };

  const timer = window.setTimeout(() => {
    window.print();
    window.setTimeout(cleanup, 1500);
  }, 120);
  window.addEventListener("afterprint", cleanup);
}