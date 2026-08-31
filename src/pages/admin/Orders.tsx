import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Check, Clock, MessageCircle, EyeOff, Filter, Printer, Trash2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useAccess } from "../../hooks/useAccess";
import { apiFetch } from "../../lib/apiFetch";
import { getCurrentBusinessDateString, getCurrentBusinessMonthString, isWithinBusinessDateRange, toBusinessDateString, toBusinessMonthString } from "../../lib/businessTime";
import { usePrinter } from "../../hooks/usePrinter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  name: string;
  size?: string;
  unit?: string;
  price: number;
  qty: number;
}

interface Order {
  id: string;
  timestamp: string;
  order_status: string;
  order_source: string;
  table_id?: string;
  payment_mode?: string;
  payment_method?: string;
  created_by?: string;
  customer_phone?: string;
  items: OrderItem[];
  grand_total: number;
  tax_collected?: number;
  discount_applied?: number;
  extraneous_charges?: number;
  other_charges_desc?: string;
  created_at?: string;
  order_timestamp?: string;
}

type Tab = "orders" | "deleted";
type FilterMode = "today" | "month" | "custom";
type SalesPeriod = "day" | "week" | "month";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function paymentLabel(order: Order): string {
  const raw = (order as any).payment_method || order.payment_mode || "—";
  if (raw === "upi")  return "UPI / QR";
  if (raw === "card") return "Credit / Debit Card";
  if (raw === "cash") return "Counter Cash";
  return raw;
}

function orderDateTime(order: Order): string {
  const ts = order.timestamp || order.order_timestamp || order.created_at || "";
  return ts ? new Date(ts).toLocaleString() : "—";
}

function orderTotalQty(order: Order): number {
  return (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function orderSubtotal(order: Order): number {
  return (order.items || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

function shiftBusinessDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftBusinessMonth(monthStart: string, months: number): string {
  const date = new Date(`${monthStart}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function getSalesPeriodRange(period: SalesPeriod, offset = 0): { start: string; end: string } {
  const today = toBusinessDateString(new Date());
  if (!today) return { start: "", end: "" };

  if (period === "day") {
    const target = shiftBusinessDate(today, offset);
    return { start: target, end: target };
  }

  if (period === "week") {
    const target = shiftBusinessDate(today, offset * 7);
    const current = new Date(`${target}T00:00:00Z`);
    const day = current.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = shiftBusinessDate(target, mondayOffset);
    return { start, end: shiftBusinessDate(start, 6) };
  }

  const start = shiftBusinessMonth(`${today.slice(0, 7)}-01`, offset);
  const nextMonth = new Date(`${start}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(0);
  return { start, end: nextMonth.toISOString().slice(0, 10) };
}

function getSalesPeriodLabel(period: SalesPeriod, offset: number): string {
  if (period === "day") return offset === 0 ? "Current Day" : offset > 0 ? `Day +${offset}` : `${Math.abs(offset)} Day${Math.abs(offset) === 1 ? "" : "s"} Ago`;
  if (period === "week") return offset === 0 ? "Current Week" : offset > 0 ? `Week +${offset}` : `${Math.abs(offset)} Week${Math.abs(offset) === 1 ? "" : "s"} Ago`;
  return offset === 0 ? "Current Month" : offset > 0 ? `Month +${offset}` : `${Math.abs(offset)} Month${Math.abs(offset) === 1 ? "" : "s"} Ago`;
}

function printOrder(order: Order) {
  const dash = `<div style="text-align:center;font-size:10px;margin:4px 0">----------------------------------------</div>`;
  const dt   = order.timestamp ? new Date(order.timestamp).toLocaleString() : "—";

  const itemsHtml = order.items.map(it =>
    `<div style="display:flex;justify-content:space-between;font-size:10px;margin:2px 0">
      <span style="flex:2">${it.name}${it.size ? ` (${it.size})` : ""} x${it.qty || 1}</span>
      <span>₹${((it.price || 0) * (it.qty || 1)).toFixed(2)}</span>
    </div>`
  ).join("");

  const html = `<html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',monospace;font-size:11px;width:300px;margin:0 auto;padding:10px 6px}
    @page{size:80mm auto;margin:0}
  </style></head><body>
    <div style="text-align:center;font-size:14px;font-weight:bold">Shri Badrinarayan Papriwale</div>
    <div style="text-align:center;font-size:10px">Sweets | Namkeen | Bakery</div>
    <div style="text-align:center;font-size:10px">Main Road, Buxar, Bihar</div>
    ${dash}
    <div style="display:flex;justify-content:space-between;font-size:10px"><span>Order: ${order.id}</span><span>${dt}</span></div>
    <div style="font-size:10px">Source: ${order.order_source || "—"} | Payment: ${paymentLabel(order)}</div>
    ${order.created_by ? `<div style="font-size:10px">Cashier: ${order.created_by}</div>` : ""}
    ${dash}
    ${itemsHtml}
    ${dash}
    <div style="display:flex;justify-content:space-between;font-size:10px"><span>Tax (GST)</span><span>₹${Number(order.tax_collected || 0).toFixed(2)}</span></div>
    ${dash}
    <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold"><span>Grand Total</span><span>₹${Number(order.grand_total).toFixed(2)}</span></div>
    ${dash}
    <div style="text-align:center;font-weight:bold;margin-top:4px">Thank You &amp; Visit Again!</div>
  </body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 300);
}

const STATUS_COLOR: Record<string, string> = {
  "Pending":        "bg-yellow-100 text-yellow-700",
  "Ready to Serve": "bg-green-100 text-green-700",
  "Paid":           "bg-gray-100 text-gray-500",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminOrders() {
  const [tab,         setTab]         = useState<Tab>("orders");
  const [orders,      setOrders]      = useState<Order[]>([]);
  const [deletedBills, setDeletedBills] = useState<any[]>([]);
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [analytics,   setAnalytics]   = useState({ totalRevenue: 0, totalOrders: 0 });
  const [filterMode,  setFilterMode]  = useState<FilterMode>("today");
  const [filterMonth, setFilterMonth] = useState(getCurrentBusinessMonthString());
  const [filterFrom,  setFilterFrom]  = useState("");
  const [filterTo,    setFilterTo]    = useState("");
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>("day");
  const [salesPeriodOffset, setSalesPeriodOffset] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const access     = useAccess("Orders");
  const isReadOnly = access === "Read-Only";
  const { printReceipt } = usePrinter();

  const handlePrintOrder = async (order: Order) => {
    const result = await printReceipt({
      invoiceNo: order.id,
      cashier: order.created_by || "Admin",
      paymentMode: (order as any).payment_method || order.payment_mode || "—",
      items: order.items,
      subtotal: Number(order.grand_total) + Number(order.discount_applied || 0),
      discountTotal: Number(order.discount_applied || 0),
      taxes: Number(order.tax_collected || 0),
      grandTotal: Number(order.grand_total),
    });
    if (result.fallback) printOrder(order);
  };

  const fetchOrders    = () => apiFetch("/api/orders").then(r => r.json()).then(d => setOrders(Array.isArray(d) ? d : []));
  const fetchAnalytics = () => apiFetch("/api/analytics").then(r => r.json()).then(d => { if (d && !d.error) setAnalytics(d); });
  const fetchDeletedBills = () => apiFetch("/api/deleted-bills").then(r => r.json()).then(d => setDeletedBills(Array.isArray(d) ? d : []));

  useEffect(() => { fetchOrders(); fetchAnalytics(); fetchDeletedBills(); }, []);

  const handleSetReady = async (orderId: string) => {
    await apiFetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_status: "Ready to Serve" }),
    });
    fetchOrders();
  };

  const handleSetPaid = async (orderId: string) => {
    await apiFetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_status: "Paid" }),
    });
    fetchOrders();
    fetchAnalytics();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await apiFetch(`/api/orders/${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    fetchOrders();
    fetchAnalytics();
    fetchDeletedBills();
  };

  const filteredOrders = orders
    .filter(o => {
      if (o.order_status === "In-Preparation") return false;
      const sourceDate = o.timestamp || (o as any).order_timestamp || (o as any).created_at;
      const orderDate = toBusinessDateString(sourceDate);
      if (!orderDate) return false;
      if (filterMode === "today") return orderDate === getCurrentBusinessDateString();
      if (filterMode === "month")  return toBusinessMonthString(sourceDate) === filterMonth;
      if (filterMode === "custom") return Boolean(filterFrom && filterTo) && isWithinBusinessDateRange(sourceDate, filterFrom, filterTo);
      return false;
    })
    .sort((a, b) => (b.timestamp ? new Date(b.timestamp).getTime() : 0) - (a.timestamp ? new Date(a.timestamp).getTime() : 0));

  const salesPeriodRange = getSalesPeriodRange(salesPeriod, salesPeriodOffset);
  const soldProductMap = new Map<string, { key: string; name: string; size: string; unit: string; qty: number }>();

  orders
    .filter(order => {
      if (order.order_status === "In-Preparation") return false;
      const orderDate = toBusinessDateString(order.timestamp || (order as any).created_at);
      if (!orderDate) return false;
      return isWithinBusinessDateRange(order.timestamp || (order as any).created_at, salesPeriodRange.start, salesPeriodRange.end);
    })
    .forEach(order => {
      (order.items || []).forEach(item => {
        const key = `${item.name}__${item.size || ""}__${item.unit || ""}`;
        const existing = soldProductMap.get(key);
        const qty = Number(item.qty || 0);
        if (existing) {
          existing.qty += qty;
          return;
        }
        soldProductMap.set(key, {
          key,
          name: item.name,
          size: item.size || "",
          unit: item.unit || "",
          qty,
        });
      });
    });

  const soldProductRows = Array.from(soldProductMap.values())
    .filter(item => item.qty > 0)
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

  const totalPrepared = filteredOrders.filter(o => ["Ready to Serve", "Paid"].includes(o.order_status)).length;

  const metrics = [
    { label: "Total Daily Orders", val: String(analytics.totalOrders) },
    { label: "Gross Revenue",      val: `₹${analytics.totalRevenue.toFixed(0)}` },
    { label: "Total Prepared",     val: String(totalPrepared) },
  ];

  return (
    <div className="space-y-6">

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button onClick={() => setTab("orders")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            tab === "orders" ? "border-maroon text-maroon" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}>Orders</button>
        <button onClick={() => setTab("deleted")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            tab === "deleted" ? "border-red-500 text-red-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}>
          Deleted Bills {deletedBills.length > 0 && <span className="ml-1 bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full">{deletedBills.length}</span>}
        </button>
      </div>

      {/* ── Deleted Bills Tab ── */}
      {tab === "deleted" && (
        <div className="space-y-3">
          {deletedBills.length === 0 ? (
            <div className="bg-white p-8 text-center text-gray-400 rounded-lg border border-gray-100">No deleted bills.</div>
          ) : deletedBills.map(bill => (
            <div key={bill.id} className="bg-white rounded-lg border border-red-100 shadow-sm overflow-hidden">
              <div className="p-4 flex items-center justify-between bg-red-50 border-b border-red-100 flex-wrap gap-2">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-bold text-red-700 text-lg">#{bill.id}</span>
                  <span className="text-gray-500 text-sm">₹{Number(bill.grand_total).toFixed(2)}</span>
                  <span className="text-xs text-gray-500">{bill.timestamp ? new Date(bill.timestamp).toLocaleString() : "—"}</span>
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">DELETED</span>
                </div>
                <div className="text-xs text-gray-500 text-right">
                  <span>Deleted by: <span className="font-semibold text-gray-700">{bill.deleted_by}</span></span>
                  <span className="ml-3">{bill.deleted_at ? new Date(bill.deleted_at).toLocaleString() : ""}</span>
                </div>
              </div>
              <div className="p-4 text-sm text-gray-600 space-y-1">
                {(bill.items || []).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between">
                    <span>{item.name} x{item.qty}</span>
                    <span>₹{(item.price * item.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Orders Tab ── */}
      {tab === "orders" && (<>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <span className="text-xs text-gray-500 uppercase font-semibold">{m.label}</span>
            <span className="block text-xl font-bold text-gray-800 mt-1">{m.val}</span>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-3 flex flex-wrap items-center gap-3">
        <Filter size={15} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-500 uppercase">Filter:</span>
        {(["today", "month", "custom"] as FilterMode[]).map(m => (
          <button key={m} onClick={() => setFilterMode(m)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${filterMode === m ? "bg-maroon text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {m === "today" ? "Today" : m === "month" ? "By Month" : "Custom Range"}
          </button>
        ))}
        {filterMode === "month" && (
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
        )}
        {filterMode === "custom" && (
          <>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
            <span className="text-gray-400 text-xs">to</span>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
          </>
        )}
        <span className="ml-auto text-xs text-gray-400">{filteredOrders.length} order(s)</span>
      </div>

      {/* Orders List */}
      <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "calc(7 * 120px)" }}>
        {filteredOrders.length === 0 ? (
          <div className="bg-white p-8 text-center text-gray-500 rounded-lg border border-gray-100">No orders found.</div>
        ) : filteredOrders.map(order => (
          <div key={order.id} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">

            {/* Order header row */}
            <div className="p-4 flex items-center justify-between bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-bold text-maroon text-lg">#{order.id}</span>
                <span className="text-gray-500 text-sm flex items-center gap-1">
                  <Clock size={14} /> {order.timestamp ? relativeTime(order.timestamp) : "—"}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_COLOR[order.order_status] || "bg-gray-100 text-gray-600"}`}>
                  {order.order_status?.toUpperCase()}
                </span>
                <span className="text-sm font-medium text-gray-700">Source: [{order.order_source}]</span>
                {order.table_id && <span className="text-sm text-gray-600">Table: {order.table_id}</span>}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{paymentLabel(order)}</span>
                <span className="text-sm text-gray-600">Items: {order.items?.length || 0}</span>
                <span className="text-sm font-bold text-maroon">₹{Number(order.grand_total).toFixed(2)}</span>
              </div>

              <div className="flex items-center gap-2">
                {isReadOnly && (
                  <span className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded font-semibold">
                    <EyeOff size={12} /> Read-Only
                  </span>
                )}
                <button onClick={() => handlePrintOrder(order)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1">
                  <Printer size={13} /> Print
                </button>
                {!isReadOnly && (
                  <button onClick={() => setDeleteId(order.id)}
                    className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1">
                    <Trash2 size={13} /> Delete
                  </button>
                )}

                {!isReadOnly && order.order_status === "Pending" && (
                  <button onClick={() => handleSetReady(order.id)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2">
                    <Check size={16} /> SET READY
                  </button>
                )}
                {!isReadOnly && order.order_status === "Ready to Serve" && (
                  <button onClick={() => handleSetPaid(order.id)}
                    className="bg-maroon hover:bg-maroon-light text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2">
                    <Check size={16} /> MARK PAID
                  </button>
                )}
                <button onClick={() => setExpanded(expanded === order.id ? null : order.id)} className="p-2 text-gray-500 hover:text-maroon">
                  {expanded === order.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              </div>
            </div>

            {/* Expanded detail */}
            {expanded === order.id && (
              <div className="p-4 bg-white grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="bg-gray-50 border border-gray-100 rounded p-4">
                    <div className="text-center">
                      <div className="font-serif text-xl font-bold text-gray-900">Shri Badrinarayan Papriwale</div>
                      <div className="text-xs text-gray-500">Sweets | Namkeen | Bakery</div>
                      <div className="text-xs text-gray-500">Main Road, Buxar, Bihar</div>
                    </div>
                    <div className="border-t border-dashed border-gray-200 my-3" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
                      <div><span className="font-semibold text-gray-700">Bill No:</span> #{order.id}</div>
                      <div><span className="font-semibold text-gray-700">Date & Time:</span> {orderDateTime(order)}</div>
                      <div><span className="font-semibold text-gray-700">Source:</span> {order.order_source || "—"}</div>
                      <div><span className="font-semibold text-gray-700">Payment:</span> {paymentLabel(order)}</div>
                      <div><span className="font-semibold text-gray-700">Status:</span> {order.order_status || "—"}</div>
                      <div><span className="font-semibold text-gray-700">Table:</span> {order.table_id || "Delivery"}</div>
                      <div><span className="font-semibold text-gray-700">Cashier:</span> {order.created_by || "—"}</div>
                      <div><span className="font-semibold text-gray-700">Customer:</span> {order.customer_phone ? `+91 ${order.customer_phone}` : "—"}</div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-100 rounded overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <h4 className="font-bold text-gray-800">Item Details</h4>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {order.items?.length > 0 ? order.items.map((item, idx) => {
                        const lineTotal = Number(item.price || 0) * Number(item.qty || 0);
                        return (
                          <div key={idx} className="px-4 py-3 text-sm">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800">
                                  {item.name} {item.size ? `(${item.size})` : ""}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Qty: {item.qty} {item.unit || "pcs"} {item.unit === "gm" ? "(weight based)" : ""}
                                </p>
                              </div>
                              <div className="text-right shrink-0 text-xs text-gray-600">
                                <p>Rate: ₹{Number(item.price || 0).toFixed(2)}</p>
                                <p className="font-semibold text-gray-800 mt-1">Amount: ₹{lineTotal.toFixed(2)}</p>
                              </div>
                            </div>
                          </div>
                        );
                      }) : <div className="px-4 py-6 text-gray-400 text-sm italic">No item details.</div>}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-gray-50 border border-gray-100 rounded p-4">
                    <h4 className="font-bold text-gray-800 mb-3 border-b border-gray-200 pb-2">Receipt Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Quantity</span>
                        <span className="font-semibold text-gray-800">{orderTotalQty(order)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Base Amount</span>
                        <span>₹{orderSubtotal(order).toFixed(2)}</span>
                      </div>
                      {Number(order.discount_applied || 0) > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Discount</span>
                          <span>-₹{Number(order.discount_applied || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {Number(order.extraneous_charges || 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Other Charges{order.other_charges_desc ? ` (${order.other_charges_desc})` : ""}</span>
                          <span>₹{Number(order.extraneous_charges || 0).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">GST</span>
                        <span>₹{Number(order.tax_collected || 0).toFixed(2)}</span>
                      </div>
                      <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-bold text-lg text-maroon">
                        <span>Grand Total</span>
                        <span>₹{Number(order.grand_total || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-100 rounded p-4">
                    <h4 className="font-bold text-gray-800 mb-3 border-b border-gray-200 pb-2">Additional Details</h4>
                    <div className="space-y-2 text-sm">
                      {order.created_by && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Processed By</span>
                          <span className="font-semibold text-gray-800">{order.created_by}</span>
                        </div>
                      )}
                      {order.customer_phone && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Customer Phone</span>
                          <span className="font-semibold text-gray-800">+91 {order.customer_phone}</span>
                        </div>
                      )}
                      {order.table_id && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Table ID</span>
                          <span className="font-semibold text-gray-800">{order.table_id}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {order.customer_phone && (
                    <a href={`https://wa.me/91${order.customer_phone}`} target="_blank" rel="noreferrer"
                      className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold py-2 rounded shadow transition-colors flex items-center justify-center gap-2 text-sm">
                      <MessageCircle size={16} /> Contact Customer
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50">
          <div>
            <h3 className="font-bold text-gray-800">Products Sold</h3>
            <p className="text-xs text-gray-500">Shows product quantities sold for the selected period.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">Filter:</span>
            {(["day", "week", "month"] as SalesPeriod[]).map(period => (
              <button
                key={period}
                onClick={() => {
                  setSalesPeriod(period);
                  setSalesPeriodOffset(0);
                }}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                  salesPeriod === period ? "bg-maroon text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {period === "day" ? "Day" : period === "week" ? "Week" : "Month"}
              </button>
            ))}
            <button
              onClick={() => setSalesPeriodOffset(prev => prev - 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              title="Previous period"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              onClick={() => setSalesPeriodOffset(0)}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              title="Return to current period"
            >
              Current
            </button>
            <button
              onClick={() => setSalesPeriodOffset(prev => prev + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              title="Next period"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 text-xs text-gray-500 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <span>
            Range: {salesPeriodRange.start || "—"} to {salesPeriodRange.end || "—"} {salesPeriodRange.start ? `(${getSalesPeriodLabel(salesPeriod, salesPeriodOffset)})` : ""}
          </span>
          <span>{soldProductRows.length} product(s)</span>
        </div>

        {soldProductRows.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No product sales found for this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Product</th>
                  <th className="text-center font-semibold px-4 py-3">Quantity Sold</th>
                  <th className="text-right font-semibold px-4 py-3">Variant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {soldProductRows.map((row, index) => (
                  <tr key={row.key} className={index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-4 py-3 font-medium text-gray-800">{row.name}</td>
                    <td className="px-4 py-3 text-center font-bold text-maroon">{row.qty}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {row.size || row.unit ? [row.size, row.unit].filter(Boolean).join(" · ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <h3 className="font-bold text-gray-800 text-lg">Delete Order #{deleteId}?</h3>
            <p className="text-sm text-gray-500">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
