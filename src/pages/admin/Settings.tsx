import React from "react";
import { useState, useEffect, useRef } from "react";
import { Shield, Bell, Save, CheckCircle2, Plus, Trash2, Users, Image, X, Edit2 } from "lucide-react";
import { apiFetch } from "../../lib/apiFetch";

const MODULES = ["POS Billing", "Orders", "Inventory", "Financial Reports", "Settings"];
const ACCESS_LEVELS = ["Full Access", "Read-Only", "Hidden"];
const DEFAULT_PERMS = { "POS Billing": "Full Access", Orders: "Read-Only", Inventory: "Hidden", "Financial Reports": "Hidden", Settings: "Hidden" };

type PermMatrix = Record<string, Record<string, string>>;

export default function AdminSettings() {
  const [permissions, setPermissions] = useState<PermMatrix>({});
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [dailyReport, setDailyReport] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Banner state
  const [banners, setBanners] = useState<any[]>([]);
  const [bannerForm, setBannerForm] = useState({ label: "", sub: "", image: "" });
  const [bannerPreview, setBannerPreview] = useState("");
  const [editBanner, setEditBanner] = useState<any | null>(null);
  const [editBannerForm, setEditBannerForm] = useState({ label: "", sub: "", image: "" });
  const [editBannerPreview, setEditBannerPreview] = useState("");
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const editBannerFileRef = useRef<HTMLInputElement>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  const fetchBanners = () => apiFetch("/api/banners").then(r => r.json()).then(d => {
    const list = Array.isArray(d) ? d : [];
    setBanners(list);
    setPreviewIndex(0);
  });

  // Role management state
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleError, setNewRoleError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setPreviewIndex(i => (i + 1) % banners.length), 3000);
    return () => clearInterval(t);
  }, [banners.length]);

  useEffect(() => {
    fetchBanners();
    apiFetch("/api/settings").then(r => r.json()).then(data => {
      const perms = data.permissions || {};
      setPermissions(perms);
      setLowStockAlerts(data.lowStockAlerts ?? true);
      setDailyReport(data.dailyReportSummary ?? false);
      localStorage.setItem("accessPermissions", JSON.stringify(perms));
      setLoading(false);
    });
  }, []);

  const roles = Object.keys(permissions);

  const handlePermChange = (role: string, module: string, value: string) => {
    setPermissions(prev => ({ ...prev, [role]: { ...(prev[role] || {}), [module]: value } }));
  };

  const handleAddRole = () => {
    setNewRoleError("");
    const name = newRoleName.trim();
    if (!name) { setNewRoleError("Role name cannot be empty."); return; }
    if (!/^[A-Za-z\s]+$/.test(name)) { setNewRoleError("Role name must be alphabetic only."); return; }
    if (permissions[name]) { setNewRoleError(`Role "${name}" already exists.`); return; }
    setPermissions(prev => ({ ...prev, [name]: { ...DEFAULT_PERMS } }));
    setNewRoleName("");
  };

  const handleDeleteRole = (role: string) => {
    setPermissions(prev => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
    setDeleteConfirm(null);
  };

  const handleSave = async () => {
    await apiFetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions, lowStockAlerts, dailyReportSummary: dailyReport }),
    });
    localStorage.setItem("accessPermissions", JSON.stringify(permissions));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const toBase64 = (file: File): Promise<string> => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const handleAddBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerForm.image) return;
    await apiFetch("/api/banners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bannerForm) });
    setBannerForm({ label: "", sub: "", image: "" });
    setBannerPreview("");
    fetchBanners();
  };

  const handleDeleteBanner = async (id: string) => {
    await apiFetch(`/api/banners/${id}`, { method: "DELETE" });
    fetchBanners();
  };

  const handleEditBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBanner) return;
    await apiFetch(`/api/banners/${editBanner.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editBannerForm) });
    setEditBanner(null);
    fetchBanners();
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Loading settings...</div>;

  return (
    <div className="max-w-5xl space-y-6">

      {/* ── Banner Carousel Management ──────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <Image className="text-maroon" size={20} />
          <h3 className="font-serif text-lg text-maroon font-bold">Banner Carousel</h3>
          <span className="ml-auto text-xs text-gray-400">{banners.length} banner{banners.length !== 1 ? "s" : ""} active</span>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-sm text-gray-500">Changes reflect instantly on the mobile portal homepage carousel.</p>

          {/* Live carousel preview */}
          {banners.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase">Live Preview</p>
              <div className="relative h-44 rounded-2xl overflow-hidden shadow-md bg-gray-100">
                {banners.map((b, i) => (
                  <div key={b.id} className="absolute inset-0 transition-opacity duration-700"
                    style={{ opacity: i === previewIndex ? 1 : 0 }}>
                    <img src={b.image} alt={b.label} className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <div className="absolute bottom-4 left-4">
                      <p className="text-white font-bold text-base leading-tight">{b.label || "(no label)"}</p>
                      <p className="text-white/75 text-xs mt-0.5">{b.sub}</p>
                    </div>
                  </div>
                ))}
                {/* Prev / Next */}
                <button onClick={() => setPreviewIndex(i => (i - 1 + banners.length) % banners.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <button onClick={() => setPreviewIndex(i => (i + 1) % banners.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                {/* Dots */}
                <div className="absolute bottom-3 right-4 flex gap-1.5">
                  {banners.map((_, i) => (
                    <button key={i} onClick={() => setPreviewIndex(i)}
                      className={`rounded-full transition-all duration-300 ${i === previewIndex ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/50"}`} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Banner cards — edit / delete */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">Manage Banners</p>
            {banners.length === 0 && <p className="text-sm text-gray-400 italic">No banners yet. Add one below.</p>}
            {banners.map((b, idx) => (
              <div key={b.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-2">
                <img src={b.image} alt={b.label} className="w-16 h-12 object-cover rounded-lg shrink-0 border border-gray-200"
                  onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-800 truncate">{b.label || <span className="text-gray-400 italic">No label</span>}</p>
                  <p className="text-xs text-gray-400 truncate">{b.sub || "—"}</p>
                </div>
                <span className="text-[10px] text-gray-400 shrink-0">#{idx + 1}</span>
                <button onClick={() => { setEditBanner(b); setEditBannerForm({ label: b.label || "", sub: b.sub || "", image: b.image }); setEditBannerPreview(b.image); setPreviewIndex(idx); }}
                  className="text-blue-500 hover:text-blue-700 p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0"><Edit2 size={15} /></button>
                <button onClick={() => { handleDeleteBanner(b.id); setPreviewIndex(0); }}
                  className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>

          {/* Add new banner form */}
          <form onSubmit={handleAddBanner} className="border border-dashed border-maroon/30 rounded-xl p-4 space-y-3 bg-maroon/5">
            <p className="text-xs font-semibold text-maroon uppercase">+ Add New Banner</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-semibold">Label</label>
                <input type="text" placeholder="e.g. Premium Sweets" value={bannerForm.label}
                  onChange={e => setBannerForm(p => ({ ...p, label: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon bg-white" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-semibold">Subtitle</label>
                <input type="text" placeholder="e.g. Handcrafted with love" value={bannerForm.sub}
                  onChange={e => setBannerForm(p => ({ ...p, sub: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon bg-white" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase font-semibold">Image</label>
              <div className="flex gap-2 mt-1 items-center">
                <input type="url" placeholder="Paste image URL..." value={bannerForm.image.startsWith("data:") ? "" : bannerForm.image}
                  onChange={e => { setBannerForm(p => ({ ...p, image: e.target.value })); setBannerPreview(e.target.value); }}
                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-maroon bg-white" />
                <span className="text-xs text-gray-400">or</span>
                <button type="button" onClick={() => bannerFileRef.current?.click()}
                  className="text-xs bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded font-semibold whitespace-nowrap">Upload File</button>
                <input ref={bannerFileRef} type="file" accept="image/*" className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const b64 = await toBase64(f);
                    setBannerForm(p => ({ ...p, image: b64 }));
                    setBannerPreview(b64);
                    e.target.value = "";
                  }} />
              </div>
              {bannerPreview && (
                <div className="mt-2 relative">
                  <img src={bannerPreview} alt="preview" className="h-28 w-full object-cover rounded-lg border border-gray-200"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <button type="button" onClick={() => { setBannerForm(p => ({ ...p, image: "" })); setBannerPreview(""); }}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 hover:bg-black/70"><X size={12} /></button>
                </div>
              )}
            </div>
            <button type="submit" disabled={!bannerForm.image}
              className="bg-maroon text-white px-4 py-2 rounded text-sm font-semibold hover:bg-maroon-light transition-colors flex items-center gap-1 disabled:opacity-50">
              <Plus size={15} /> Add Banner
            </button>
          </form>
        </div>
      </div>

      {/* Edit Banner Modal */}
      {editBanner && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl">
              <h3 className="font-bold text-maroon text-lg">Edit Banner</h3>
              <button onClick={() => setEditBanner(null)}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleEditBanner} className="p-5 space-y-3">
              {/* Current image preview */}
              <div className="relative h-32 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                <img src={editBannerPreview || editBannerForm.image} alt="current"
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-2 left-3">
                  <p className="text-white font-bold text-sm">{editBannerForm.label || "(no label)"}</p>
                  <p className="text-white/70 text-xs">{editBannerForm.sub}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-semibold">Label</label>
                  <input type="text" value={editBannerForm.label} onChange={e => setEditBannerForm(p => ({ ...p, label: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-semibold">Subtitle</label>
                  <input type="text" value={editBannerForm.sub} onChange={e => setEditBannerForm(p => ({ ...p, sub: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-semibold">Change Image</label>
                <div className="flex gap-2 mt-1 items-center">
                  <input type="url" placeholder="Paste new image URL..." value={editBannerForm.image.startsWith("data:") ? "" : editBannerForm.image}
                    onChange={e => { setEditBannerForm(p => ({ ...p, image: e.target.value })); setEditBannerPreview(e.target.value); }}
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-maroon" />
                  <span className="text-xs text-gray-400">or</span>
                  <button type="button" onClick={() => editBannerFileRef.current?.click()}
                    className="text-xs bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded font-semibold whitespace-nowrap">Upload</button>
                  <input ref={editBannerFileRef} type="file" accept="image/*" className="hidden"
                    onChange={async e => {
                      const f = e.target.files?.[0]; if (!f) return;
                      const b64 = await toBase64(f);
                      setEditBannerForm(p => ({ ...p, image: b64 }));
                      setEditBannerPreview(b64);
                      e.target.value = "";
                    }} />
                </div>
              </div>
              <button type="submit" disabled={!editBannerForm.image}
                className="w-full bg-maroon text-white font-bold py-2.5 rounded hover:bg-maroon-light transition-colors disabled:opacity-50">Save Changes</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Role Management ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <Users className="text-maroon" size={20} />
          <h3 className="font-serif text-lg text-maroon font-bold">Role Management</h3>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-500 mb-4">
            Create custom employee roles. Each new role starts with default permissions — adjust them in the Access Control Matrix below, then click <strong>Save Settings</strong>.
          </p>

          {/* Existing roles */}
          <div className="flex flex-wrap gap-2 mb-5">
            {roles.map(role => (
              <div key={role} className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5 text-sm font-semibold text-gray-700">
                <span>{role}</span>
                {deleteConfirm === role ? (
                  <span className="flex items-center gap-1 ml-1">
                    <button onClick={() => handleDeleteRole(role)}
                      className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold hover:bg-red-700">
                      Confirm
                    </button>
                    <button onClick={() => setDeleteConfirm(null)}
                      className="text-[10px] bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded font-bold hover:bg-gray-400">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setDeleteConfirm(role)}
                    className="ml-1 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            {roles.length === 0 && <p className="text-sm text-gray-400 italic">No roles defined yet.</p>}
          </div>

          {/* Add new role */}
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <input
                type="text"
                placeholder="New role name (e.g. Supervisor)"
                value={newRoleName}
                onChange={e => { setNewRoleName(e.target.value); setNewRoleError(""); }}
                onKeyDown={e => e.key === "Enter" && handleAddRole()}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-maroon"
              />
              {newRoleError && <p className="text-red-500 text-xs mt-1">{newRoleError}</p>}
            </div>
            <button onClick={handleAddRole}
              className="bg-maroon text-white px-4 py-2 rounded text-sm font-semibold hover:bg-maroon-light transition-colors flex items-center gap-1 whitespace-nowrap">
              <Plus size={15} /> Add Role
            </button>
          </div>
        </div>
      </div>

      {/* ── Access Control Matrix ────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <Shield className="text-maroon" size={20} />
          <h3 className="font-serif text-lg text-maroon font-bold">Access Control Matrix</h3>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-500 mb-4">
            Configure module permissions per role. <strong>Hidden</strong> routes return 403 and alert Admin.
          </p>
          {roles.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-6">Add a role above to configure permissions.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border border-gray-200 rounded">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase">
                  <tr>
                    <th className="py-3 px-4">Module</th>
                    {roles.map(r => <th key={r} className="py-3 px-4 text-center">{r}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {MODULES.map(mod => (
                    <tr key={mod} className="hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium text-gray-800">{mod}</td>
                      {roles.map(role => {
                        const val = permissions[role]?.[mod] || "Full Access";
                        return (
                          <td key={role} className="py-3 px-4 text-center">
                            <select
                              value={val}
                              onChange={e => handlePermChange(role, mod, e.target.value)}
                              className={`border rounded text-xs py-1 px-2 ${
                                val === "Hidden"    ? "border-red-300 bg-red-50 text-red-700" :
                                val === "Read-Only" ? "border-yellow-300 bg-yellow-50 text-yellow-700" :
                                "border-green-300 bg-green-50 text-green-700"
                              }`}
                            >
                              {ACCESS_LEVELS.map(l => <option key={l}>{l}</option>)}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Employees accessing hidden routes trigger a 403 alert to the Admin notification panel.
          </p>
        </div>
      </div>

      {/* ── Notification Routing ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <Bell className="text-maroon" size={20} />
          <h3 className="font-serif text-lg text-maroon font-bold">Notification Routing</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div>
              <p className="font-bold text-gray-800">Low Stock Alerts</p>
              <p className="text-xs text-gray-500">Push notification when inventory drops below safety threshold.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={lowStockAlerts} onChange={e => setLowStockAlerts(e.target.checked)} />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-800">Daily Report Summary</p>
              <p className="text-xs text-gray-500">Automated WhatsApp summary to Admin at 10:00 PM daily.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={dailyReport} onChange={e => setDailyReport(e.target.checked)} />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4">
        {saved && (
          <span className="flex items-center gap-2 text-green-600 text-sm font-semibold">
            <CheckCircle2 size={16} /> Settings saved successfully!
          </span>
        )}
        <button onClick={handleSave} className="bg-maroon text-white font-bold py-3 px-8 rounded shadow-md hover:bg-maroon-light transition-colors flex items-center gap-2">
          <Save size={18} /> Save Settings
        </button>
      </div>
    </div>
  );
}
