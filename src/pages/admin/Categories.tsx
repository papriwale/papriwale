import React, { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Image as ImageIcon, X, CheckCircle2, EyeOff, Package, ChevronDown, ChevronUp } from "lucide-react";
import { apiFetch } from "../../lib/apiFetch";
import { useAccess } from "../../hooks/useAccess";

const EMPTY_CAT = { name: "", image: "" };
const EMPTY_PRODUCT = { name: "", sku: "", category: "", unit_purchase_cost: "", price: "", current_stock_qty: "", safety_low_threshold: "5", unit: "pcs", image: "", show_in_mobile: true };
const DECIMAL_UNITS = new Set(["gm", "kg", "g", "gram", "grams", "ltr", "l", "liter", "litre"]);

const normalizeUnit = (unit?: string) => (unit || "pcs").toLowerCase();
const isDecimalQuantityUnit = (unit?: string) => DECIMAL_UNITS.has(normalizeUnit(unit));
const quantityStep = (unit?: string) => (isDecimalQuantityUnit(unit) ? "0.001" : "1");
const normalizeQuantityInput = (value: string, unit?: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return isDecimalQuantityUnit(unit) ? Number(parsed.toFixed(3)).toString() : String(Math.round(parsed));
};

export default function AdminCategories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [modal, setModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [form, setForm] = useState(EMPTY_CAT);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [productModal, setProductModal] = useState<{ open: boolean; category: string } | null>(null);
  const [productForm, setProductForm] = useState({ ...EMPTY_PRODUCT });
  const [productError, setProductError] = useState("");
  const [editProductModal, setEditProductModal] = useState<{ open: boolean; product: any } | null>(null);
  const [editProductForm, setEditProductForm] = useState({ ...EMPTY_PRODUCT });
  const [editProductError, setEditProductError] = useState("");

  const access = useAccess("Inventory");
  const isReadOnly = access === "Read-Only";

  const resizeImage = (file: File, cb: (dataUrl: string) => void) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 300; canvas.height = 300;
      const ctx = canvas.getContext("2d")!;
      const size = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 300, 300);
      URL.revokeObjectURL(url);
      cb(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.src = url;
  };

  const load = () => {
    apiFetch("/api/categories").then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : []));
    apiFetch("/api/products").then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : []));
  };
  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const openAdd = () => { setForm(EMPTY_CAT); setModal({ open: true, editing: null }); };
  const openEdit = (cat: any) => { setForm({ name: cat.name, image: cat.image || "" }); setModal({ open: true, editing: cat }); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    if (modal.editing) {
      await apiFetch(`/api/categories/${modal.editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      showToast("Category updated.");
    } else {
      await apiFetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      showToast("Category added.");
    }
    setSaving(false);
    setModal({ open: false, editing: null });
    load();
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
    setDeleteId(null);
    showToast("Category deleted.");
    load();
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductError("");
    if (!productForm.name || !productForm.sku || !productForm.price) { setProductError("Name, SKU and price are required."); return; }
    const currentStockQty = Number(normalizeQuantityInput(productForm.current_stock_qty, productForm.unit)) || 0;
    const safetyLowThreshold = Number(normalizeQuantityInput(productForm.safety_low_threshold, productForm.unit)) || 0;
    await apiFetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...productForm, unit_purchase_cost: Number(Number(productForm.unit_purchase_cost).toFixed(2)), price: Number(Number(productForm.price).toFixed(2)), current_stock_qty: currentStockQty, safety_low_threshold: safetyLowThreshold, show_in_mobile: productForm.show_in_mobile ?? true }),
    });
    setProductModal(null);
    setProductForm({ ...EMPTY_PRODUCT });
    showToast("Product added.");
    load();
  };

  const openProductModal = (catName: string) => {
    setProductForm({ ...EMPTY_PRODUCT, category: catName });
    setProductError("");
    setProductModal({ open: true, category: catName });
  };

  const openEditProduct = (p: any) => {
    setEditProductForm({ name: p.name, sku: p.sku || "", category: p.category, unit_purchase_cost: p.unit_purchase_cost ?? "", price: p.price ?? "", current_stock_qty: p.current_stock_qty ?? "", safety_low_threshold: p.safety_low_threshold ?? "5", unit: p.unit || "pcs", image: p.image || "", show_in_mobile: p.show_in_mobile ?? true });
    setEditProductError("");
    setEditProductModal({ open: true, product: p });
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditProductError("");
    if (!editProductForm.name || !editProductForm.price) { setEditProductError("Name and price are required."); return; }
    const currentStockQty = Number(normalizeQuantityInput(editProductForm.current_stock_qty, editProductForm.unit)) || 0;
    const safetyLowThreshold = Number(normalizeQuantityInput(editProductForm.safety_low_threshold, editProductForm.unit)) || 0;
    await apiFetch(`/api/products/${editProductModal!.product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editProductForm, unit_purchase_cost: Number(Number(editProductForm.unit_purchase_cost).toFixed(2)), price: Number(Number(editProductForm.price).toFixed(2)), current_stock_qty: currentStockQty, safety_low_threshold: safetyLowThreshold, show_in_mobile: editProductForm.show_in_mobile ?? true }),
    });
    setEditProductModal(null);
    showToast("Product updated.");
    load();
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-semibold">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}

      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <h3 className="font-serif text-xl text-maroon font-bold">Product Categories</h3>
        {isReadOnly ? (
          <span className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-3 py-2 rounded font-semibold">
            <EyeOff size={12} /> Read-Only Mode
          </span>
        ) : (
          <button onClick={openAdd} className="bg-maroon hover:bg-maroon-light text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2">
            <Plus size={16} /> Add Category
          </button>
        )}
      </div>

      <div className="space-y-4">
        {categories.map(cat => {
          const catProducts = products.filter(p => p.category === cat.name);
          const isExpanded = expandedCat === cat.id;
          return (
            <div key={cat.id} className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              {/* Category Header Row */}
              <div className="flex items-center gap-4 p-4">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                  {cat.image
                    ? <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }}/>
                    : <div className="w-full h-full flex items-center justify-center text-gray-300"><ImageIcon size={24} /></div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-gray-800 text-base">{cat.name}</h4>
                  <p className="text-xs text-gray-500">{catProducts.length} product{catProducts.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isReadOnly && (
                    <>
                      <button onClick={() => openProductModal(cat.name)} className="flex items-center gap-1 bg-maroon text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-maroon-light transition-colors">
                        <Plus size={13} /> Add Product
                      </button>
                      <button onClick={() => openEdit(cat)} className="p-1.5 rounded text-blue-600 hover:bg-blue-50"><Edit2 size={15} /></button>
                      <button onClick={() => setDeleteId(cat.id)} className="p-1.5 rounded text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
                    </>
                  )}
                  <button onClick={() => setExpandedCat(isExpanded ? null : cat.id)} className="p-1.5 rounded text-gray-400 hover:text-maroon hover:bg-gray-50">
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>
              </div>

              {/* Products under this category */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                  {catProducts.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-lg">
                      No products in this category.
                      {!isReadOnly && (
                        <button onClick={() => openProductModal(cat.name)} className="block mx-auto mt-2 text-maroon font-semibold text-xs hover:underline">
                          + Add first product
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {catProducts.map(p => (
                        <div key={p.id} className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden group relative">
                          <div className="h-20 bg-amber-50">
                            {p.image
                              ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }}/>
                              : <div className="w-full h-full flex items-center justify-center text-gray-300"><Package size={24} /></div>
                            }
                          </div>
                          <div className="p-2">
                            <p className="font-semibold text-gray-800 text-xs truncate">{p.name}</p>
                            <p className="text-maroon font-bold text-xs">₹{p.price}</p>
                            <p className="text-gray-400 text-[10px]">Stock: {p.current_stock_qty}</p>
                          </div>
                          {!isReadOnly && (
                            <button onClick={() => openEditProduct(p)}
                              className="absolute top-1 right-1 bg-white/90 hover:bg-blue-50 text-blue-600 p-1 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity">
                              <Edit2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add/Edit Category Modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-serif text-xl text-maroon font-bold">{modal.editing ? "Edit Category" : "Add Category"}</h3>
              <button onClick={() => setModal({ open: false, editing: null })}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Category Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:border-maroon focus:ring-1 focus:ring-maroon" placeholder="e.g. Sweets" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Category Image (optional)</label>
                <div className="flex items-center gap-3 mt-1">
                  {form.image
                    ? <img src={form.image} alt="preview" className="w-16 h-16 rounded-lg object-cover border border-gray-200 shrink-0" />
                    : <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300 shrink-0"><ImageIcon size={22} /></div>
                  }
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded text-center transition-colors">
                      Upload Image
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) resizeImage(f, url => setForm(prev => ({ ...prev, image: url }))); }} />
                    </label>
                    <input type="text" placeholder="Or paste image URL"
                      value={form.image.startsWith("data:") ? "" : form.image}
                      onChange={e => setForm(prev => ({ ...prev, image: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-maroon" />
                  </div>
                  {form.image && <button type="button" onClick={() => setForm(prev => ({ ...prev, image: "" }))} className="text-gray-400 hover:text-red-500 shrink-0"><X size={16} /></button>}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal({ open: false, editing: null })} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex-1 bg-maroon text-white font-semibold py-2.5 rounded-lg hover:bg-maroon-light disabled:opacity-60">
                {saving ? "Saving..." : modal.editing ? "Update" : "Add Category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {productModal?.open && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl shrink-0">
              <h3 className="font-bold text-maroon text-lg">Add Product — {productModal.category}</h3>
              <button onClick={() => setProductModal(null)}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleAddProduct} className="p-5 space-y-3 overflow-y-auto flex-1">
              {[
                { label: "Product Name", key: "name", type: "text" },
                { label: "SKU Code", key: "sku", type: "text" },
                { label: "Unit (e.g. kg, pcs, ltr)", key: "unit", type: "text" },
                { label: "Purchase Cost (₹)", key: "unit_purchase_cost", type: "number" },
                { label: "Selling Price (₹)", key: "price", type: "number" },
                { label: "Initial Quantity", key: "current_stock_qty", type: "number" },
                { label: "Safety Low Threshold", key: "safety_low_threshold", type: "number" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-gray-600 uppercase">{f.label}</label>
                  <input type={f.type} value={(productForm as any)[f.key]}
                    onChange={e => setProductForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    step={(f.key === "current_stock_qty" || f.key === "safety_low_threshold") ? quantityStep(productForm.unit) : undefined}
                    inputMode={(f.key === "current_stock_qty" || f.key === "safety_low_threshold") && isDecimalQuantityUnit(productForm.unit) ? "decimal" : undefined}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Product Image (optional)</label>
                <div className="mt-1 flex items-center gap-3">
                  {productForm.image
                    ? <img src={productForm.image} alt="preview" className="w-16 h-16 rounded-lg object-cover border border-gray-200 shrink-0" />
                    : <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300 shrink-0"><Package size={22} /></div>
                  }
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded text-center transition-colors">
                      Upload Image
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) resizeImage(f, url => setProductForm(prev => ({ ...prev, image: url }))); }} />
                    </label>
                    <input type="text" placeholder="Or paste image URL"
                      value={productForm.image.startsWith("data:") ? "" : productForm.image}
                      onChange={e => setProductForm(prev => ({ ...prev, image: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-maroon" />
                  </div>
                  {productForm.image && <button type="button" onClick={() => setProductForm(prev => ({ ...prev, image: "" }))} className="text-gray-400 hover:text-red-500 shrink-0"><X size={16} /></button>}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                <input
                  type="checkbox"
                  checked={(productForm as any).show_in_mobile ?? true}
                  onChange={e => setProductForm(prev => ({ ...prev, show_in_mobile: e.target.checked }))}
                  className="accent-maroon"
                />
                Show this product in the mobile app
              </label>
              {productError && <p className="text-red-500 text-sm">{productError}</p>}
              <button type="submit" className="w-full bg-maroon text-white font-bold py-2.5 rounded hover:bg-maroon-light transition-colors mt-2">
                Add Product
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editProductModal?.open && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl shrink-0">
              <h3 className="font-bold text-maroon text-lg">Edit Product</h3>
              <button onClick={() => setEditProductModal(null)}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleEditProduct} className="p-5 space-y-3 overflow-y-auto flex-1">
              {[
                { label: "Product Name", key: "name", type: "text" },
                { label: "SKU Code", key: "sku", type: "text" },
                { label: "Unit (e.g. kg, pcs, ltr)", key: "unit", type: "text" },
                { label: "Purchase Cost (₹)", key: "unit_purchase_cost", type: "number" },
                { label: "Selling Price (₹)", key: "price", type: "number" },
                { label: "Current Stock Qty", key: "current_stock_qty", type: "number" },
                { label: "Safety Low Threshold", key: "safety_low_threshold", type: "number" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-gray-600 uppercase">{f.label}</label>
                  <input type={f.type} value={(editProductForm as any)[f.key]}
                    onChange={e => setEditProductForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    step={(f.key === "current_stock_qty" || f.key === "safety_low_threshold") ? quantityStep(editProductForm.unit) : undefined}
                    inputMode={(f.key === "current_stock_qty" || f.key === "safety_low_threshold") && isDecimalQuantityUnit(editProductForm.unit) ? "decimal" : undefined}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Product Image (optional)</label>
                <div className="mt-1 flex items-center gap-3">
                  {editProductForm.image
                    ? <img src={editProductForm.image} alt="preview" className="w-16 h-16 rounded-lg object-cover border border-gray-200 shrink-0" />
                    : <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300 shrink-0"><Package size={22} /></div>
                  }
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded text-center transition-colors">
                      Upload Image
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) resizeImage(f, url => setEditProductForm(prev => ({ ...prev, image: url }))); }} />
                    </label>
                    <input type="text" placeholder="Or paste image URL"
                      value={editProductForm.image.startsWith("data:") ? "" : editProductForm.image}
                      onChange={e => setEditProductForm(prev => ({ ...prev, image: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-maroon" />
                  </div>
                  {editProductForm.image && <button type="button" onClick={() => setEditProductForm(prev => ({ ...prev, image: "" }))} className="text-gray-400 hover:text-red-500 shrink-0"><X size={16} /></button>}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                <input
                  type="checkbox"
                  checked={(editProductForm as any).show_in_mobile ?? true}
                  onChange={e => setEditProductForm(prev => ({ ...prev, show_in_mobile: e.target.checked }))}
                  className="accent-maroon"
                />
                Show this product in the mobile app
              </label>
              {editProductError && <p className="text-red-500 text-sm">{editProductError}</p>}
              <button type="submit" className="w-full bg-maroon text-white font-bold py-2.5 rounded hover:bg-maroon-light transition-colors mt-2">
                Save Changes
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            <Trash2 size={40} className="text-red-500 mx-auto mb-3" />
            <h3 className="font-bold text-gray-800 text-lg mb-2">Delete Category?</h3>
            <p className="text-gray-500 text-sm mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
