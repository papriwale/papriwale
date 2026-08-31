import { useNavigate } from "react-router-dom";
import { ChevronLeft, User, LogOut, Camera, Edit2, Check, Trash2 } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";

export default function Profile() {
  const navigate = useNavigate();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [name, setName] = useState("Customer");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine session type once on mount
  const isCustomer = !!localStorage.getItem("customerRole");
  const isAdmin    = !isCustomer && !!localStorage.getItem("adminRole");

  useEffect(() => {
    if (isCustomer) {
      setName(localStorage.getItem("customerName") || "Customer");
      setRole(localStorage.getItem("customerRole") || "");
      setPhone(localStorage.getItem("employeePhone") || "");
      const av = localStorage.getItem("customerAvatar");
      if (av) setAvatar(av);
      setIsNewCustomer(localStorage.getItem("isNewCustomer") === "true");
    } else if (isAdmin) {
      setName(localStorage.getItem("adminName") || "Admin");
      setRole(localStorage.getItem("adminRole") || "");
      const av = localStorage.getItem("adminAvatar");
      if (av) setAvatar(av);
    }
  }, []);

  const persistCustomerProfile = async (updatedName?: string, updatedAvatar?: string | null) => {
    const customerId = localStorage.getItem("customerId");
    if (!customerId) return;
    try {
      const res = await fetch("/api/auth/guest-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          ...(updatedName !== undefined ? { name: updatedName } : {}),
          ...(updatedAvatar !== undefined ? { avatar: updatedAvatar } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[customer-profile] save failed:", res.status, err);
      }
    } catch (e) {
      console.error("[customer-profile] network error:", e);
    }
  };

  const handleDeleteAvatar = async () => {
    setAvatar(null);
    if (isCustomer) {
      localStorage.removeItem("customerAvatar");
      await persistCustomerProfile(undefined, null);
      window.dispatchEvent(new Event("customerProfileUpdated"));
    } else if (isAdmin) {
      window.dispatchEvent(new Event("avatarChanged"));
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      const SIZE = 200;
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d")!;
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(url);
      const b64 = canvas.toDataURL("image/jpeg", 0.7);
      setAvatar(b64);
      if (isCustomer) {
        localStorage.setItem("customerAvatar", b64);
        await persistCustomerProfile(undefined, b64);
        window.dispatchEvent(new Event("customerProfileUpdated"));
      } else if (isAdmin) {
        // Save to server only — no localStorage (avoids QuotaExceededError)
        await fetch("/api/auth/update-avatar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatar: b64 }),
        });
        window.dispatchEvent(new Event("avatarChanged"));
      }
    };
    img.src = url;
  };

  const handleNameSave = () => {
    const trimmed = tempName.trim();
    if (trimmed) {
      setName(trimmed);
      if (isCustomer) {
        localStorage.setItem("customerName", trimmed);
        persistCustomerProfile(trimmed, undefined);
        window.dispatchEvent(new Event("customerProfileUpdated"));
      } else if (isAdmin) {
        localStorage.setItem("adminName", trimmed);
        window.dispatchEvent(new Event("avatarChanged"));
      }
    }
    setIsEditingName(false);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    if (isCustomer) {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      ["customerRole","customerName","customerToken","customerId","customerPhone","customerAvatar","employeePhone","isNewCustomer","orderHistory"].forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
      window.dispatchEvent(new Event("customerProfileUpdated"));
      window.location.replace("/login");
    } else if (isAdmin) {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      ["adminRole","adminName","sessionToken","employeeId","adminAvatar","accessPermissions"].forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
      window.location.replace("/admin/login");
    }
  };

  if (isLoggingOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-light text-maroon">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-maroon border-t-transparent animate-spin" />
          <p className="font-semibold">Signing out...</p>
        </div>
      </div>
    );
  }

  const roleBadge = () => {
    if (isCustomer) {
      if (isNewCustomer) return <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-2 uppercase tracking-wider">🎉 New Customer</span>;
      return <span className="bg-maroon/10 text-maroon text-xs font-bold px-3 py-1 rounded-full mb-2 uppercase tracking-wider">Returning Customer</span>;
    }
    if (role) return <span className="bg-maroon/10 text-maroon text-xs font-bold px-3 py-1 rounded-full mb-2 uppercase tracking-wider">{role}</span>;
    return null;
  };

  return (
    <div className="flex flex-col min-h-full bg-cream-light pb-24">
      <div className="bg-white p-4 flex items-center border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="mr-4 text-maroon"><ChevronLeft size={24} /></button>
        <h2 className="font-serif text-xl text-gold font-bold uppercase tracking-wider">PROFILE</h2>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col items-center">
          <div className="relative mb-4">
            <div className="w-24 h-24 bg-maroon rounded-full flex items-center justify-center text-gold border-4 border-cream-light shadow-inner overflow-hidden">
              {avatar ? <img src={avatar} alt="Profile" className="w-full h-full object-cover" /> : <User size={48} />}
            </div>
            <button onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 bg-gold text-white p-2 rounded-full shadow-md border-2 border-white">
              <Camera size={16} />
            </button>
            {avatar && (
              <button onClick={handleDeleteAvatar}
                className="absolute bottom-0 left-0 bg-red-500 text-white p-2 rounded-full shadow-md border-2 border-white">
                <Trash2 size={14} />
              </button>
            )}
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
          </div>

          {isEditingName ? (
            <div className="flex items-center gap-2 mb-2 w-full max-w-[200px]">
              <input type="text" value={tempName} onChange={e => setTempName(e.target.value)}
                className="w-full border-b-2 border-maroon focus:outline-none text-center font-bold text-lg text-gray-800 bg-transparent py-1"
                autoFocus />
              <button onClick={handleNameSave} className="text-green-600 p-1 bg-green-50 rounded-full">
                <Check size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-bold text-xl text-gray-800">{name}</h3>
              <button onClick={() => { setTempName(name); setIsEditingName(true); }} className="text-gray-400 p-1">
                <Edit2 size={16} />
              </button>
            </div>
          )}

          {roleBadge()}

          {phone && (
            <p className="text-gray-500 text-sm mb-4">+91 {phone.slice(0,5)} {phone.slice(5)}</p>
          )}

          <button onClick={handleLogout}
            className="w-full bg-red-50 text-red-600 font-bold py-3 rounded-xl hover:bg-red-100 transition-colors border border-red-100 flex items-center justify-center gap-2 mt-2">
            <LogOut size={20} /> Logout
          </button>
        </div>

      </div>
    </div>
  );
}
