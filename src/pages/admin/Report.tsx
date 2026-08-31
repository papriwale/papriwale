import { useState } from "react";
import { Download, FileText, Calendar, Loader2, EyeOff } from "lucide-react";
import jsPDF from "jspdf";
import { apiFetch } from "../../lib/apiFetch";
import { useAccess } from "../../hooks/useAccess";
import { getCurrentBusinessDateString, getCurrentBusinessMonthString, isWithinBusinessDateRange, toBusinessDateString, toBusinessMonthString } from "../../lib/businessTime";

export default function AdminReport() {
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);

  const access = useAccess("Financial Reports");
  const isReadOnly = access === "Read-Only";

  const fetchAll = async () => {
    const [orders, expenses, products] = await Promise.all([
      apiFetch("/api/orders").then(r => r.json()),
      apiFetch("/api/expenses").then(r => r.json()),
      apiFetch("/api/products").then(r => r.json()),
    ]);
    return { orders, expenses, products };
  };

  const exportDailyCSV = async () => {
    setGenerating("csv");
    const { orders, expenses } = await fetchAll();
    const today = getCurrentBusinessDateString();
    const filteredTodayOrders = orders.filter((o: any) => isWithinBusinessDateRange(o.timestamp || o.created_at, today, today));
    const todayExpenses = expenses.filter((e: any) => isWithinBusinessDateRange(e.expense_date, today, today));

    const rows = [
      ["Type", "ID", "Amount", "Status/Category", "Time"],
      ...filteredTodayOrders.map((o: any) => ["Order", o.id, o.grand_total, o.order_status, toBusinessDateString(o.timestamp || o.created_at)]),
      ...todayExpenses.map((e: any) => ["Expense", e.id, e.amount, e.expense_type, toBusinessDateString(e.expense_date)]),
    ];
    const csv = rows.map(r => r.map(String).map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-summary-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setGenerating(null);
  };

  const exportMonthlyPDF = async () => {
    setGenerating("pdf");
    const { orders, expenses, products } = await fetchAll();
    const now = new Date();
    const month = now.toLocaleString("default", { month: "long", year: "numeric" });
    const monthPrefix = getCurrentBusinessMonthString();

    const monthOrders = orders.filter((o: any) => toBusinessMonthString(o.timestamp || o.created_at) === monthPrefix);
    const paidOrders = monthOrders.filter((o: any) => o.order_status === "Paid");
    const totalRevenue = paidOrders.reduce((s: number, o: any) => s + Number(o.grand_total), 0);
    const monthExpenses = expenses.filter((e: any) => toBusinessMonthString(e.expense_date) === monthPrefix);
    const totalExpenses = monthExpenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
    const netIncome = totalRevenue - totalExpenses;
    const lowStock = products.filter((p: any) => p.current_stock_qty > 0 && p.current_stock_qty <= p.safety_low_threshold).length;
    const outOfStock = products.filter((p: any) => p.current_stock_qty === 0).length;

    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(92, 26, 27);
    doc.text("Papriwale — Monthly P&L Report", 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Period: ${month}`, 14, 30);
    doc.text(`Generated: ${now.toLocaleString()}`, 14, 37);

    doc.setDrawColor(201, 162, 39);
    doc.line(14, 42, 196, 42);

    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text("Revenue Summary", 14, 52);
    doc.setFontSize(11);
    doc.text(`Total Orders (month): ${monthOrders.length}`, 14, 61);
    doc.text(`Paid Orders: ${paidOrders.length}`, 14, 68);
    doc.text(`Total Revenue: Rs. ${totalRevenue.toFixed(2)}`, 14, 75);

    doc.setFontSize(13);
    doc.text("Expense Summary", 14, 88);
    doc.setFontSize(11);
    doc.text(`Total Expenses: Rs. ${totalExpenses.toFixed(2)}`, 14, 97);

    doc.setFontSize(13);
    doc.setTextColor(netIncome >= 0 ? 22 : 180, netIncome >= 0 ? 163 : 30, netIncome >= 0 ? 74 : 30);
    doc.text(`Net Income: Rs. ${netIncome.toFixed(2)}`, 14, 110);

    doc.setTextColor(30);
    doc.setFontSize(13);
    doc.text("Inventory Snapshot", 14, 123);
    doc.setFontSize(11);
    doc.text(`Total Products: ${products.length}`, 14, 132);
    doc.text(`Low Stock Items: ${lowStock}`, 14, 139);
    doc.text(`Out of Stock Items: ${outOfStock}`, 14, 146);

    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text("© 2026 Papriwale. Confidential.", 14, 285);

    doc.save(`papriwale-pl-${monthPrefix}.pdf`);
    setGenerating(null);
  };

  const exportRangePDF = async () => {
    if (!rangeStart || !rangeEnd) return;
    setGenerating("range");
    const { orders, expenses } = await fetchAll();

    const rangeOrders = orders.filter((o: any) => isWithinBusinessDateRange(o.timestamp || o.created_at, rangeStart, rangeEnd));
    const paidOrders = rangeOrders.filter((o: any) => o.order_status === "Paid");
    const totalRevenue = paidOrders.reduce((s: number, o: any) => s + Number(o.grand_total), 0);
    const rangeExpenses = expenses.filter((e: any) => isWithinBusinessDateRange(e.expense_date, rangeStart, rangeEnd));
    const totalExpenses = rangeExpenses.reduce((s: number, e: any) => s + Number(e.amount), 0);

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(92, 26, 27);
    doc.text("Papriwale — Custom Range Report", 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Range: ${rangeStart} to ${rangeEnd}`, 14, 30);

    doc.setDrawColor(201, 162, 39);
    doc.line(14, 35, 196, 35);

    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.text(`Total Orders: ${rangeOrders.length}`, 14, 45);
    doc.text(`Paid Orders: ${paidOrders.length}`, 14, 53);
    doc.text(`Total Revenue: Rs. ${totalRevenue.toFixed(2)}`, 14, 61);
    doc.text(`Total Expenses: Rs. ${totalExpenses.toFixed(2)}`, 14, 69);
    doc.setFontSize(13);
    setNetColor(doc, totalRevenue - totalExpenses);
    doc.text(`Net Income: Rs. ${(totalRevenue - totalExpenses).toFixed(2)}`, 14, 80);

    doc.save(`papriwale-report-${rangeStart}-${rangeEnd}.pdf`);
    setGenerating(null);
  };

  const setNetColor = (doc: jsPDF, n: number) => {
    if (n >= 0) doc.setTextColor(22, 163, 74); else doc.setTextColor(180, 30, 30);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
        <h3 className="font-serif text-xl text-maroon font-bold mb-6">Financial & Operational Reports</h3>
        {isReadOnly && (
          <div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 border border-yellow-200 px-4 py-2 rounded mb-4 text-sm font-semibold">
            <EyeOff size={14} /> Read-Only — you can view reports but not export sensitive data.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Daily Summary CSV */}
          <div className="border border-gray-200 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                <FileText size={20} />
              </div>
              <h4 className="font-bold text-gray-800 text-lg mb-1">Daily Summary</h4>
              <p className="text-sm text-gray-500 mb-4">Sales, expenses, and inventory snapshot for today.</p>
            </div>
            <button
              onClick={exportDailyCSV}
              disabled={isReadOnly || generating === "csv"}
              className="w-full bg-white border border-gray-300 hover:border-maroon hover:text-maroon text-gray-700 font-semibold py-2 rounded shadow-sm transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60"
            >
              {generating === "csv" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Export CSV
            </button>
          </div>

          {/* Monthly P&L PDF */}
          <div className="border border-gray-200 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-4">
                <Calendar size={20} />
              </div>
              <h4 className="font-bold text-gray-800 text-lg mb-1">Monthly P&L</h4>
              <p className="text-sm text-gray-500 mb-4">Profit and loss statement, dealer payouts, and salary draws.</p>
            </div>
            <button
              onClick={exportMonthlyPDF}
              disabled={isReadOnly || generating === "pdf"}
              className="w-full bg-white border border-gray-300 hover:border-maroon hover:text-maroon text-gray-700 font-semibold py-2 rounded shadow-sm transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60"
            >
              {generating === "pdf" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Export PDF
            </button>
          </div>

          {/* Custom Date Range */}
          <div className="border border-gray-200 rounded-lg p-5 flex flex-col justify-between bg-gray-50">
            <div>
              <h4 className="font-bold text-gray-800 text-sm mb-3 uppercase tracking-wider">Custom Range Export</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Start Date</label>
                  <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">End Date</label>
                  <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
            <button
              onClick={exportRangePDF}
              disabled={isReadOnly || !rangeStart || !rangeEnd || generating === "range"}
              className="w-full bg-maroon text-white font-semibold py-2 rounded shadow-sm hover:bg-maroon-light transition-colors flex items-center justify-center gap-2 text-sm mt-4 disabled:opacity-60"
            >
              {generating === "range" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Generate Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
