import React, { useState, useRef, useEffect } from "react";
import { User, Camera, Lock, CheckCircle2, AlertCircle, Pencil, X, Trash2 } from "lucide-react";
import { apiFetch } from "../../lib/apiFetch";

export default function AdminProfile() {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState<"photo" | "name" | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const role = localStorage.getItem("adminRole") || "";
  const employeeId = localStorage.getItem("employeeId") || "";
  const isAdmin = role === "Admin";

  useEffect(() => {
    if (isAdmin) {
      apiFetch("/api/settings").then(r => r.json()).then((s: any) => {
        const name = s.adminName || "Super Admin";
        setDisplayName(name); setNameInput(name);
        localStorage.setItem("adminName", name);
        setAvatar(s.adminAvatar || null);
        window.dispatchEvent(new Event("avatarChanged"));
      }).catch(() => {
        const n = localStorage.getItem("adminName") || "Super Admin";
        setDisplayName(n); setNameInput(n);
      });
    } else {
      // Employee: fetch own name + avatar from DB via /auth/me
      apiFetch("/api/auth/me").then(r => r.json()).then((me: any) => {
        const name = me.name || localStorage.getItem("adminName") || "";
        setDisplayName(name);
        localStorage.setItem("adminName", name);
        const av = me.avatar || null;
        setAvatar(av);
        if (av) localStorage.setItem("adminAvatar", av);
        else localStorage.removeItem("adminAvatar");
        window.dispatchEvent(new Event("avatarChanged"));
      }).catch(() => {
        setDisplayName(localStorage.getItem("adminName") || "");
        setAvatar(localStorage.getItem("adminAvatar") || null);
      });
    }
  }, []);

  // ── Delete avatar ───────────────────────────────────────────────────────────
  const handleDeleteAvatar = async () => {
    setAvatar(null);
    localStorage.removeItem("adminAvatar");
    window.dispatchEvent(new Event("avatarChanged"));
    const endpoint = isAdmin ? "/api/auth/update-avatar" : `/api/employees/${employeeId}`;
    await apiFetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: null }),
    });
    setSaveSuccess("photo");
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const canvas = document.createElement("canvas");
    const img = new Image();
    img.onload = async () => {
      const MAX = 200;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      canvas.width  = img.width  * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.7);
      setAvatar(base64);
      localStorage.setItem("adminAvatar", base64);
      window.dispatchEvent(new Event("avatarChanged"));
      const endpoint = isAdmin ? "/api/auth/update-avatar" : `/api/employees/${employeeId}`;
      const res = await apiFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: base64 }),
      });
      if (res.ok) { setSaveSuccess("photo"); setTimeout(() => setSaveSuccess(null), 3000); }
    };
    img.src = URL.createObjectURL(file);
  };

  // ── Rename ──────────────────────────────────────────────────────────────────
  const handleSaveName = async () => {
    setNameError("");
    const trimmed = nameInput.trim();
    if (!trimmed) { setNameError("Name cannot be empty."); return; }
    if (!/^[A-Za-z\s]+$/.test(trimmed)) { setNameError("Name must contain alphabetic characters only."); return; }
    if (!isAdmin && employeeId) {
      const res = await apiFetch(`/api/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, full_name: trimmed }),
      });
      if (!res.ok) { setNameError("Failed to save. Try again."); return; }
    } else if (isAdmin) {
      await apiFetch("/api/auth/update-avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
    }
    setDisplayName(trimmed);
    localStorage.setItem("adminName", trimmed);
    window.dispatchEvent(new Event("avatarChanged"));
    setEditingName(false);
    setSaveSuccess("name");
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);
    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}/;
    if (!currentPassword) { setPasswordError("Please enter current password."); return; }
    if (!newPassword.match(passRegex)) { setPasswordError("Min 8 chars, upper/lowercase, number, special character."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match."); return; }
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_pass: currentPassword, new_pass: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setPasswordError(data.error || "Failed to update password."); return; }
      setPasswordSuccess(true);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch {
      setPasswordError("Server error. Please try again.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-serif text-maroon font-bold mb-6">Profile Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ── Profile Card ── */}
        <div className="md:col-span-1">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center text-center">

            {/* Avatar */}
            <div className="relative mb-4 group">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-cream-light bg-gray-50 flex items-center justify-center shadow-inner relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                {avatar
                  ? <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                  : <User size={48} className="text-gray-300" />
                }
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera size={24} className="text-white mb-1" />
                  <span className="text-white text-xs font-semibold">Change Photo</span>
                </div>
              </div>
              {avatar && (
                <button onClick={handleDeleteAvatar}
                  className="absolute bottom-0 right-0 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-md border-2 border-white"
                  title="Remove photo">
                  <Trash2 size={13} />
                </button>
              )}
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
            </div>
            {saveSuccess === "photo" && (
              <div className="flex items-center gap-1 text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-xs font-semibold mb-2">
                <CheckCircle2 size={13} /> Photo saved!
              </div>
            )}

            {/* Name — editable for Admin only, read-only for Employee */}
            {!isAdmin ? (
              <h2 className="text-xl font-bold text-gray-800 mb-1">{displayName}</h2>
            ) : editingName ? (
              <div className="w-full mb-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => { setNameInput(e.target.value); setNameError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") { setEditingName(false); setNameInput(displayName); } }}
                  className="w-full border border-maroon rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-maroon"
                  autoFocus
                />
                {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
                <div className="flex gap-2 mt-2 justify-center">
                  <button onClick={handleSaveName} className="bg-maroon text-white text-xs px-3 py-1 rounded font-semibold hover:bg-maroon-light">Save</button>
                  <button onClick={() => { setEditingName(false); setNameInput(displayName); setNameError(""); }}
                    className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded font-semibold hover:bg-gray-200">
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-gray-800">{displayName}</h2>
                <button onClick={() => { setEditingName(true); setNameInput(displayName); }}
                  className="text-gray-400 hover:text-maroon transition-colors" title="Rename">
                  <Pencil size={14} />
                </button>
              </div>
            )}

            <p className="text-sm text-gray-500 mb-3">{isAdmin ? "admin@papriwale.com" : `Role: ${role}`}</p>
            <div className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-full ${isAdmin ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
              {isAdmin ? "Full Access" : role}
            </div>

            {saveSuccess === "name" && (
              <div className="flex items-center gap-1 text-green-600 text-xs font-semibold mt-3">
                <CheckCircle2 size={13} /> Name updated!
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="md:col-span-2">
          {isAdmin ? (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                <Lock className="text-maroon" />
                <h2 className="text-xl font-bold text-gray-800">Change Password</h2>
              </div>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Current Password</label>
                  <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:border-maroon focus:ring-1 focus:ring-maroon"
                    placeholder="Enter current password" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:border-maroon focus:ring-1 focus:ring-maroon"
                    placeholder="Enter new password" />
                  <p className="text-xs text-gray-500 mt-1">Min 8 chars, upper/lowercase, number, special character.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm New Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:outline-none focus:border-maroon focus:ring-1 focus:ring-maroon"
                    placeholder="Confirm new password" />
                </div>
                {passwordError && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm font-semibold">
                    <AlertCircle size={16} /> {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg text-sm font-semibold">
                    <CheckCircle2 size={16} /> Password successfully updated!
                  </div>
                )}
                <button type="submit" className="bg-maroon hover:bg-maroon-light text-white font-bold py-2.5 px-6 rounded-lg transition-colors">
                  Update Password
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                <User className="text-maroon" />
                <h2 className="text-xl font-bold text-gray-800">Your Profile</h2>
              </div>
              <p className="text-sm text-gray-500">You can update your display name and profile photo using the card on the left.</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500 font-semibold">Employee ID</span><span className="font-mono text-gray-700">{employeeId || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-500 font-semibold">Role</span><span className="font-semibold text-blue-700">{role}</span></div>
                <div className="flex justify-between"><span className="text-gray-500 font-semibold">Display Name</span><span className="text-gray-700">{displayName}</span></div>
              </div>
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                <Lock size={13} /> Password changes are managed by Admin only.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
