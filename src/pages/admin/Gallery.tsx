import React, { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "../../lib/apiFetch";

export default function AdminGallery() {
  const [photos, setPhotos] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", url: "" });
  const [error, setError] = useState("");

  const fetch_ = () =>
    apiFetch("/api/gallery").then(r => r.json()).then(d => setPhotos(Array.isArray(d) ? d : []));

  useEffect(() => { fetch_(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim() || !form.url.trim()) { setError("Both title and URL are required."); return; }
    await apiFetch("/api/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowModal(false);
    setForm({ title: "", url: "" });
    fetch_();
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/gallery/${id}`, { method: "DELETE" });
    fetch_();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-serif text-xl text-maroon font-bold">Gallery Management</h3>
          <button onClick={() => { setShowModal(true); setError(""); setForm({ title: "", url: "" }); }}
            className="bg-maroon hover:bg-maroon-light text-white px-4 py-2 rounded text-sm font-semibold flex items-center gap-2">
            <Plus size={16} /> Add Photo
          </button>
        </div>

        {photos.length === 0 ? (
          <p className="text-center text-gray-400 py-12 italic">No gallery photos yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map(photo => (
              <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-gray-50">
                <img src={photo.url} alt={photo.title} className="w-full h-36 object-cover"
                  onError={e => { (e.target as HTMLImageElement).src = "/cover.png"; }} />
                <div className="p-2">
                  <p className="text-xs font-semibold text-gray-700 truncate">{photo.title}</p>
                </div>
                <button onClick={() => handleDelete(photo.id)}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl">
              <h3 className="font-bold text-maroon text-lg">Add Gallery Photo</h3>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Title</label>
                <input type="text" required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Image URL</label>
                <input type="url" required value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
                  placeholder="https://..." className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              {form.url && (
                <img src={form.url} alt="preview" className="w-full h-32 object-cover rounded border border-gray-200"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" className="w-full bg-maroon text-white font-bold py-2.5 rounded hover:bg-maroon-light transition-colors mt-2">
                Add Photo
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
