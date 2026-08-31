import React, { useState, useEffect, useRef } from "react";
import { Package, AlertTriangle, XCircle, Search, Plus, X, Trash2, ArrowDownCircle, ArrowUpCircle, EyeOff, Eye, Edit2 } from "lucide-react";
import { useAccess } from "../../hooks/useAccess";
import { apiFetch } from "../../lib/apiFetch";
type Product = { id: string; name: string; category: string; sku: string; current_stock_qty: number; unit_purchase_cost: number; price: number; safety_low_threshold: number; muted?: boolean; show_in_mobile?: boolean; image?: string; unit?: string; description?: string; };
type LogEntry = { id: string; type: "STOCK_IN" | "STOCK_OUT"; product_name: string; qty: number; reason: string; operator: string; timestamp: string; };
type VariantDraft = { id: string; size_label: string; price: string };

const EMPTY_PRODUCT = { name: "", sku: "", category: "", price: "", current_stock_qty: "", safety_low_threshold: "5", unit: "gm", image: "", description: "", show_in_mobile: true };
const DECIMAL_UNITS = new Set(["gm", "kg", "g", "gram", "grams", "ltr", "l", "liter", "litre"]);

const normalizeUnit = (unit?: string) => (unit || "pcs").toLowerCase();
const isDecimalQuantityUnit = (unit?: string) => DECIMAL_UNITS.has(normalizeUnit(unit));
const quantityStep = (unit?: string) => (isDecimalQuantityUnit(unit) ? "0.001" : "1");
const formatQuantityValue = (value: number, unit?: string) => {
  if (!Number.isFinite(value)) return "0";
  return isDecimalQuantityUnit(unit) ? Number(value.toFixed(3)).toString() : String(Math.round(value));
};
const getProductStockValue = (product: Product) => {
  const unit = normalizeUnit(product.unit);
  const qty = Number(product.current_stock_qty || 0);
  const rate = Number(product.unit_purchase_cost || product.price || 0);
  if (!Number.isFinite(qty) || !Number.isFinite(rate)) return 0;
  if (unit === "gm") return rate * qty;
  return rate * qty;
};
const normalizeQuantityInput = (value: string, unit?: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return isDecimalQuantityUnit(unit) ? Number(parsed.toFixed(3)).toString() : String(Math.round(parsed));
};

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("All Items");
  const [logTab, setLogTab] = useState("All");
  const [viewMode, setViewMode] = useState<"products" | "audit-log">("products");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ ...EMPTY_PRODUCT });
  const [addError, setAddError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const addProductLockRef = useRef(false);
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([]);
  const [variantLoading, setVariantLoading] = useState(false);

  const [stockModal, setStockModal] = useState<{ product: Product; type: "in" | "out" } | null>(null);
  const [stockQty, setStockQty] = useState("");
  const [stockReason, setStockReason] = useState("");
  const [stockError, setStockError] = useState("");
  const [pendingStockAdjust, setPendingStockAdjust] = useState<{ product: Product; type: "in" | "out"; qty: number; reason: string } | null>(null);

  const access = useAccess("Inventory");
  const isReadOnly = access === "Read-Only";
  const goToAuditLog = () => {
    setViewMode("audit-log");
    document.getElementById("inventory-audit-log")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const fetchAll = () => {
    apiFetch("/api/products").then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : []));
    apiFetch("/api/inventory-log").then(r => r.json()).then(d => setLog(Array.isArray(d) ? d : []));
    apiFetch("/api/categories").then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d.map((c: any) => c.name) : []));
  };

  useEffect(() => { fetchAll();
    const onStockUpdated = () => fetchAll();
    window.addEventListener("stock-updated", onStockUpdated);
    return () => window.removeEventListener("stock-updated", onStockUpdated);
  }, []);

  const categoryFilterOptions = ["All", ...categories];

  const nextSku = () => {
    const nums = products.map(p => parseInt(p.sku?.replace(/\D/g, "") || "0")).filter(n => !isNaN(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return `SKU${String(next).padStart(3, "0")}`;
  };

  const newVariantId = () => `variant-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const openAddProductModal = () => {
    setEditProductId(null);
    setAddForm({ ...EMPTY_PRODUCT, sku: nextSku() });
    setVariantDrafts([]);
    setShowAddModal(true);
  };

  const openEditProductModal = async (p: Product) => {
    setEditProductId(p.id);
    setAddForm({
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: String(p.price),
      current_stock_qty: String(p.current_stock_qty),
      safety_low_threshold: String(p.safety_low_threshold),
      unit: p.unit || "gm",
      image: p.image || "",
      description: p.description || "",
      show_in_mobile: p.show_in_mobile ?? true,
    });
    setVariantLoading(true);
    setShowAddModal(true);
    try {
      const res = await apiFetch(`/api/product-variants?product_id=${p.id}`);
      const json = await res.json();
      const list = Array.isArray(json) ? json : [];
      const basePrice = Number(p.price) || 0;
      setVariantDrafts(list.map((variant: any) => ({
        id: variant.variant_id || newVariantId(),
        size_label: variant.size_label || "",
        price: basePrice > 0 && variant.variant_price_modifier ? String(Number((basePrice * Number(variant.variant_price_modifier)).toFixed(2))) : "",
      })));
    } catch {
      setVariantDrafts([]);
    } finally {
      setVariantLoading(false);
    }
  };

  const addVariantRow = (sizeLabel = "", price = "") => {
    setVariantDrafts(prev => [...prev, { id: newVariantId(), size_label: sizeLabel, price }]);
  };

  const addPresetVariant = (sizeLabel: string, modifier: number) => {
    const basePrice = Number(addForm.price) || 0;
    const computedPrice = basePrice > 0 ? (basePrice * modifier).toFixed(2) : "";
    setVariantDrafts(prev => {
      const idx = prev.findIndex(v => v.size_label.toLowerCase() === sizeLabel.toLowerCase());
      const nextRow = { id: idx >= 0 ? prev[idx].id : newVariantId(), size_label: sizeLabel, price: computedPrice };
      if (idx >= 0) return prev.map((v, i) => i === idx ? nextRow : v);
      return [...prev, nextRow];
    });
  };

  const updateVariantDraft = (id: string, patch: Partial<VariantDraft>) => {
    setVariantDrafts(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v));
  };

  const removeVariantDraft = (id: string) => {
    setVariantDrafts(prev => prev.filter(v => v.id !== id));
  };

  const filtered = products.filter(p => {
    const matchTab = activeTab === "All Items" || (activeTab === "Low Stock" && p.current_stock_qty > 0 && p.current_stock_qty <= p.safety_low_threshold) || (activeTab === "Out of Stock" && p.current_stock_qty === 0);
    const matchCat = catFilter === "All" || p.category === catFilter;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchCat && matchSearch;
  });

  const metrics = [
    { label: "Total Products", value: products.length, icon: Package, color: "text-blue-500" },
    { label: "Total Stock Value", value: `₹${products.reduce((s, p) => s + getProductStockValue(p), 0).toFixed(2)}`, icon: Package, color: "text-green-500" },
    { label: "Low Stock Items", value: products.filter(p => p.current_stock_qty > 0 && p.current_stock_qty <= p.safety_low_threshold).length, icon: AlertTriangle, color: "text-yellow-500" },
    { label: "Out of Stock", value: products.filter(p => p.current_stock_qty === 0).length, icon: XCircle, color: "text-red-500" },
  ];

  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 300; canvas.height = 300;
      const ctx = canvas.getContext("2d")!;
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 300, 300);
      URL.revokeObjectURL(url);
      setAddForm(prev => ({ ...prev, image: canvas.toDataURL("image/jpeg", 0.75) }));
    };
    img.src = url;
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addProductLockRef.current) return;
    addProductLockRef.current = true;
    setIsSavingProduct(true);
    setAddError("");
    try {
      if (!addForm.name || !addForm.category || !addForm.price) {
        setAddError("Name, category and price are required.");
        return;
      }
      const sku = addForm.sku || nextSku();
      const currentStockQty = Number(normalizeQuantityInput(addForm.current_stock_qty, addForm.unit)) || 0;
      const safetyLowThreshold = Number(normalizeQuantityInput(addForm.safety_low_threshold, addForm.unit)) || 0;
      if (editProductId) {
        const res = await apiFetch(`/api/products/${editProductId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...addForm, sku, price: Number(Number(addForm.price).toFixed(2)), current_stock_qty: currentStockQty, safety_low_threshold: safetyLowThreshold })
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setAddError(d.error || "Failed to save product.");
          return;
        }
      } else {
        const res = await apiFetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...addForm, sku, price: Number(Number(addForm.price).toFixed(2)), current_stock_qty: currentStockQty, safety_low_threshold: safetyLowThreshold })
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setAddError(d.error || "Failed to add product.");
          return;
        }
      }
      setShowAddModal(false);
      setEditProductId(null);
      setAddForm({ ...EMPTY_PRODUCT });
      setVariantDrafts([]);
      fetchAll();
    } finally {
      addProductLockRef.current = false;
      setIsSavingProduct(false);
    }
  };

  const handleToggleMute = async (p: Product) => {
    const updated = { ...p, muted: !p.muted };
    await apiFetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muted: updated.muted }),
    });
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, muted: updated.muted } : x));
  };

  const handleToggleMobileVisibility = async (p: Product) => {
    const nextVisible = !(p.show_in_mobile ?? true);
    await apiFetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ show_in_mobile: nextVisible }),
    });
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, show_in_mobile: nextVisible } : x));
  };

  const handleDelete = async () => {
    if (!deleteTarget || !deleteConfirm) return;
    await apiFetch(`/api/products/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    setDeleteConfirm(false);
    fetchAll();
  };

  const handleStockAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setStockError("");
    if (!stockModal) return;
    const qty = Number(normalizeQuantityInput(stockQty, stockModal.product.unit));
    if (!qty || qty <= 0) { setStockError("Enter a valid quantity."); return; }
    if (stockModal.type === "out" && stockModal.product.current_stock_qty - qty < 0) {
      setStockError("Stock cannot go below zero."); return;
    }
    setPendingStockAdjust({
      product: stockModal.product,
      type: stockModal.type,
      qty,
      reason: stockReason.trim(),
    });
  };

  const confirmStockAdjust = async () => {
    if (!pendingStockAdjust) return;
    const { product, type, qty, reason } = pendingStockAdjust;
    const res = await apiFetch(`/api/products/${product.id}/stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, qty, reason })
    });
    if (!res.ok) {
      const d = await res.json();
      setStockError(d.error);
      setPendingStockAdjust(null);
      return;
    }
    setStockModal(null);
    setStockQty("");
    setStockReason("");
    setPendingStockAdjust(null);
    fetchAll();
  };

  const displayedLog = log
    .filter((entry: LogEntry) => {
      const reason = String(entry.reason || "").trim().toLowerCase();
      if (reason.startsWith("order ")) return false;
      if (reason.startsWith("deleted bill ")) return false;
      return true;
    })
    .filter(l => logTab === "All" || (logTab === "Stock In" && l.type === "STOCK_IN") || (logTab === "Stock Out" && l.type === "STOCK_OUT"))
    .slice()
    // Show newest inventory activity first.
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center gap-4">
            <div className={`p-3 rounded-full bg-gray-50 ${m.color}`}><m.icon size={24} /></div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">{m.label}</p>
              <p className="text-xl font-bold text-gray-800">{m.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <div className="flex gap-2">
            {["All Items", "Low Stock", "Out of Stock"].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${activeTab === tab ? "bg-maroon text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {tab}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={goToAuditLog}
              className={`px-4 py-2 rounded text-sm font-semibold transition-colors border ${viewMode === "audit-log" ? "bg-maroon text-white border-maroon" : "bg-white text-maroon border-maroon/30 hover:bg-maroon/5"}`}
            >
              Jump to Audit Log
            </button>
            {isReadOnly && (
              <span className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-3 py-2 rounded font-semibold">
                <EyeOff size={12} /> Read-Only Mode
              </span>
            )}
            {!isReadOnly && (
              <button onClick={() => { setStockModal(null); openAddProductModal(); }} className="bg-maroon hover:bg-maroon-light text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-1">
                <Plus size={16} /> Add Product
              </button>
            )}
          </div>
        </div>

        <div className="p-4 border-b border-gray-100 flex gap-4 bg-gray-50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="border border-gray-300 rounded px-3 py-2 text-sm bg-white min-w-[150px]">
            {categoryFilterOptions.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="inventory-scrollbar max-h-[560px] overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 z-10 text-xs text-gray-500 uppercase bg-white border-b border-gray-200">
              <tr>
                <th className="py-3 px-4"># ID</th>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Qty</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Alerts</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-gray-500">{i + 1}</td>
                  <td className="py-3 px-4 font-medium text-gray-800">
                    <div className="flex items-center gap-2">
                      {p.image
                        ? <img src={p.image} alt={p.name} className="w-8 h-8 rounded object-cover border border-gray-200 flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display='none'; }}/>
                        : <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0"><Package size={14} className="text-gray-400" /></div>
                      }
                      {p.name}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-500">{p.category}</td>
                  <td className="py-3 px-4 font-mono text-xs">{p.sku}</td>
                  <td className="py-3 px-4 font-bold">
                    {p.unit === "gm" && p.current_stock_qty >= 1000
                      ? <>{formatQuantityValue(p.current_stock_qty / 1000, "kg")} <span className="text-xs text-gray-400 font-normal">kg</span></>
                      : <>{formatQuantityValue(p.current_stock_qty, p.unit)} <span className="text-xs text-gray-400 font-normal">{p.unit || "pcs"}</span></>}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${p.current_stock_qty === 0 ? "bg-red-100 text-red-700" : p.current_stock_qty <= p.safety_low_threshold ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                      {p.current_stock_qty === 0 ? "Out of Stock" : p.current_stock_qty <= p.safety_low_threshold ? "Low Stock" : "In Stock"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                      {p.muted
                        ? <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500">🔕 Muted</span>
                        : p.current_stock_qty === 0
                          ? <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-600">⚠ Depleted</span>
                          : <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600">🔔 Active</span>}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-1">
                      {!isReadOnly && (
                        <>
                          <button onClick={() => { void openEditProductModal(p); }}
                            className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Edit"><Edit2 size={16} /></button>
                          <button onClick={() => { setStockModal({ product: p, type: "in" }); setStockQty(""); setStockReason(""); setStockError(""); }}
                            className="text-green-600 hover:bg-green-50 p-1.5 rounded" title="Stock In"><ArrowDownCircle size={16} /></button>
                          <button onClick={() => { setStockModal({ product: p, type: "out" }); setStockQty(""); setStockReason(""); setStockError(""); }}
                            className="text-orange-500 hover:bg-orange-50 p-1.5 rounded" title="Stock Out"><ArrowUpCircle size={16} /></button>
                          <button onClick={() => handleToggleMobileVisibility(p)}
                            className={`p-1.5 rounded text-xs font-bold ${p.show_in_mobile ?? true ? "text-emerald-600 hover:bg-emerald-50" : "text-gray-400 hover:bg-gray-50"}`}
                            title={p.show_in_mobile ?? true ? "Hide from mobile app" : "Show in mobile app"}>
                            {p.show_in_mobile ?? true ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>
                          <button onClick={() => handleToggleMute(p)}
                            className={`p-1.5 rounded text-xs font-bold ${p.muted ? "text-gray-400 hover:bg-gray-50" : "text-blue-500 hover:bg-blue-50"}`}
                            title={p.muted ? "Unmute" : "Mute"}>{p.muted ? "🔔" : "🔕"}</button>
                          <button onClick={() => { setDeleteTarget(p); setDeleteConfirm(false); }}
                            className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="Delete"><Trash2 size={16} /></button>
                        </>
                      )}
                      {isReadOnly && <span className="text-xs text-gray-400 italic px-2">View only</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-gray-400 italic">No products found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inventory Audit Log */}
      <div id="inventory-audit-log" className="bg-white rounded-lg shadow-sm border border-gray-100 scroll-mt-24">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-serif text-lg text-maroon font-bold">Inventory Audit Log</h3>
          <div className="flex gap-2">
            {["All", "Stock In", "Stock Out"].map(t => (
              <button key={t} onClick={() => setLogTab(t)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${logTab === t ? "bg-maroon text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="inventory-scrollbar max-h-[520px] overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 z-10 text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Qty</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Operator</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {displayedLog.map(l => (
                <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${l.type === "STOCK_IN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {l.type === "STOCK_IN" ? "Stock In" : "Stock Out"}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-gray-800">{l.product_name}</td>
                  <td className="py-3 px-4 font-bold">{l.qty}</td>
                  <td className="py-3 px-4 text-gray-500">{l.reason || "—"}</td>
                  <td className="py-3 px-4 text-gray-600">{l.operator}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{new Date(l.timestamp).toLocaleString()}</td>
                </tr>
              ))}
              {displayedLog.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-gray-400 italic">No activity recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl">
              <h3 className="font-bold text-maroon text-lg">{editProductId ? "Edit Product" : "Add New Product"}</h3>
              <button onClick={() => { setShowAddModal(false); setEditProductId(null); setAddForm({ ...EMPTY_PRODUCT }); setVariantDrafts([]); setVariantLoading(false); addProductLockRef.current = false; setIsSavingProduct(false); }}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleAddProduct} className="p-5 space-y-3 overflow-y-auto flex-1">
              {/* Product Image */}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Product Image (optional)</label>
                <div className="mt-1 flex items-center gap-3">
                  {addForm.image
                    ? <img src={addForm.image} alt="preview" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                    : <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300"><Package size={24} /></div>
                  }
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded text-center transition-colors">
                      Upload Image
                      <input type="file" accept="image/*" className="hidden" onChange={handleProductImageUpload} />
                    </label>
                    <input
                      type="text"
                      placeholder="Or paste image URL"
                      value={addForm.image.startsWith("data:") ? "" : addForm.image}
                      onChange={e => setAddForm(prev => ({ ...prev, image: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-maroon"
                    />
                  </div>
                  {addForm.image && (
                    <button type="button" onClick={() => setAddForm(prev => ({ ...prev, image: "" }))} className="text-gray-400 hover:text-red-500"><X size={16} /></button>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Product Name</label>
                <input type="text" required value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">SKU Code (auto-generated)</label>
                <input type="text" value={addForm.sku} onChange={e => setAddForm(p => ({ ...p, sku: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon font-mono bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Category</label>
                <select required value={addForm.category} onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon bg-white">
                  <option value="">— Select Category —</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase">Unit</label>
                  <select value={addForm.unit} onChange={e => {
                  const nextUnit = e.target.value;
                  setAddForm(p => ({
                    ...p,
                    unit: nextUnit,
                    current_stock_qty: normalizeQuantityInput(p.current_stock_qty, nextUnit),
                    safety_low_threshold: normalizeQuantityInput(p.safety_low_threshold, nextUnit),
                  }));
                  if (nextUnit === "pc") setVariantDrafts([]);
                }}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon bg-white">
                  <option value="gm">gm</option>
                  <option value="kg">kg</option>
                  <option value="pc">pc</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Selling Price (₹)</label>
                <input type="number" required min="0" step="0.01" value={addForm.price} onChange={e => setAddForm(p => ({ ...p, price: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Initial Quantity ({addForm.unit}) <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="number" min="0" step={quantityStep(addForm.unit)} inputMode={isDecimalQuantityUnit(addForm.unit) ? "decimal" : "numeric"} value={addForm.current_stock_qty} onChange={e => setAddForm(p => ({ ...p, current_stock_qty: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Safety Low Threshold ({addForm.unit})</label>
                <input type="number" min="0" step={quantityStep(addForm.unit)} inputMode={isDecimalQuantityUnit(addForm.unit) ? "decimal" : "numeric"} value={addForm.safety_low_threshold} onChange={e => setAddForm(p => ({ ...p, safety_low_threshold: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Description (optional)</label>
                <textarea
                  value={(addForm as any).description}
                  onChange={e => setAddForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Short product description for mobile app..."
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon resize-none"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                <input
                  type="checkbox"
                  checked={(addForm as any).show_in_mobile ?? true}
                  onChange={e => setAddForm(prev => ({ ...prev, show_in_mobile: e.target.checked }))}
                  className="accent-maroon"
                />
                Show this product in the mobile app
              </label>
              {addError && <p className="text-red-500 text-sm">{addError}</p>}
              <button type="submit" disabled={isSavingProduct} className="w-full bg-maroon text-white font-bold py-2.5 rounded hover:bg-maroon-light transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {isSavingProduct ? "Saving..." : (editProductId ? "Save Changes" : "Add Product")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="font-bold text-red-600 text-lg mb-2">Delete Product</h3>
            <p className="text-gray-600 text-sm mb-4">Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.</p>
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer">
              <input type="checkbox" checked={deleteConfirm} onChange={e => setDeleteConfirm(e.target.checked)} className="accent-red-600" />
              I confirm I want to permanently delete this product.
            </label>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 border border-gray-300 rounded py-2 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete} disabled={!deleteConfirm}
                className="flex-1 bg-red-600 text-white rounded py-2 text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock In / Out Modal */}
      {stockModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
            <div className={`p-4 border-b border-gray-100 flex items-center justify-between rounded-t-xl ${stockModal.type === "in" ? "bg-green-50" : "bg-orange-50"}`}>
              <h3 className={`font-bold text-lg ${stockModal.type === "in" ? "text-green-700" : "text-orange-700"}`}>
                {stockModal.type === "in" ? "Stock In" : "Stock Out"} — {stockModal.product.name}
              </h3>
              <button onClick={() => { setStockModal(null); setPendingStockAdjust(null); }}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleStockAdjust} className="p-5 space-y-4">
              <p className="text-sm text-gray-500">Current stock: <strong>{formatQuantityValue(stockModal.product.current_stock_qty, stockModal.product.unit)}</strong></p>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Quantity</label>
                <input type="number" min={isDecimalQuantityUnit(stockModal.product.unit) ? "0.001" : "1"} step={quantityStep(stockModal.product.unit)} inputMode={isDecimalQuantityUnit(stockModal.product.unit) ? "decimal" : "numeric"} required value={stockQty} onChange={e => setStockQty(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Reason {stockModal.type === "out" ? "(e.g. spoilage, waste)" : "(e.g. vendor delivery)"}</label>
                <input type="text" value={stockReason} onChange={e => setStockReason(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              {stockError && <p className="text-red-500 text-sm">{stockError}</p>}
              <button type="submit" className={`w-full text-white font-bold py-2.5 rounded transition-colors ${stockModal.type === "in" ? "bg-green-600 hover:bg-green-700" : "bg-orange-500 hover:bg-orange-600"}`}>
                Review {stockModal.type === "in" ? "Stock In" : "Stock Out"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjust Confirmation Modal */}
      {pendingStockAdjust && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div>
              <h3 className={`font-bold text-lg ${pendingStockAdjust.type === "in" ? "text-green-700" : "text-orange-700"}`}>
                Confirm {pendingStockAdjust.type === "in" ? "Stock In" : "Stock Out"}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Please confirm this inventory change before it is saved.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Product</span>
                <span className="font-semibold text-gray-800 text-right">{pendingStockAdjust.product.name}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Action</span>
                <span className="font-semibold text-gray-800">{pendingStockAdjust.type === "in" ? "Add stock" : "Reduce stock"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Quantity</span>
                <span className="font-semibold text-gray-800">{formatQuantityValue(pendingStockAdjust.qty, pendingStockAdjust.product.unit)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Reason</span>
                <span className="font-semibold text-gray-800 text-right">{pendingStockAdjust.reason || "—"}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setPendingStockAdjust(null)}
                className="flex-1 border border-gray-300 rounded py-2 text-sm font-semibold hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void confirmStockAdjust(); }}
                className={`flex-1 text-white rounded py-2 text-sm font-semibold transition-colors ${pendingStockAdjust.type === "in" ? "bg-green-600 hover:bg-green-700" : "bg-orange-500 hover:bg-orange-600"}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
