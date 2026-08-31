import React, { useState, useEffect } from "react";
import { User, Lock, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../../hooks/useAuthSession";

export default function AdminLogin() {
  const [role, setRole] = useState<"Admin" | "Employee">("Admin");
  const navigate = useNavigate();
  const { status, session } = useAuthSession();

  // Block back navigation to authenticated pages
  useEffect(() => {
    const block = () => window.history.pushState(null, "", "/admin/login");
    block();
    window.addEventListener("popstate", block);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.history.pushState(null, "", "/admin/login");
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", block);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
  useEffect(() => {
    if (status !== "authenticated" || !session || session.role === "Customer") return;
    const dest = session.role === "Admin" ? "/admin/dashboard" : "/admin";
    navigate(dest, { replace: true });
  }, [navigate, session, status]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [firstTimeSetup, setFirstTimeSetup] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [setupMsg, setSetupMsg] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupMsg("");
    if (newPass !== confirmPass) { setSetupMsg("Passwords do not match."); return; }
    const res = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_pass: newPass }),
    });
    const data = await res.json();
    if (!res.ok) { setSetupMsg(data.error); return; }
    setFirstTimeSetup(false);
    setSetupMsg("");
    setError("Password set! Please log in.");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.includes("password not set") || data.error?.includes("not configured")) {
          setFirstTimeSetup(true);
          setLoading(false);
          return;
        }
        setError(data.error || "Invalid credentials"); return;
      }
      localStorage.setItem("adminRole",    data.role);
      localStorage.setItem("adminName",    data.name);
      if (data.employee_id) localStorage.setItem("employeeId", data.employee_id);
      if (data.avatar)      localStorage.setItem("adminAvatar", data.avatar);
      if (data.permissions) localStorage.setItem("accessPermissions", JSON.stringify({ [data.role]: data.permissions }));

      // Clear all history entries so back button can't return to previous session's pages
      const dest = data.role === "Admin" ? "/admin/dashboard" : (() => {
        const perms: Record<string, string> = data.permissions || {};
        const moduleRouteMap: [string, string][] = [
          ["POS Billing",       "/admin/pos"],
          ["Orders",            "/admin/orders"],
          ["Inventory",         "/admin/inventory"],
          ["Financial Reports", "/admin/dealer"],
          ["Employees",         "/admin/employee"],
          ["Settings",          "/admin/settings"],
        ];
        const first = moduleRouteMap.find(([mod]) => (perms[mod] ?? "Hidden") !== "Hidden");
        return first ? first[1] : "/admin/pos";
      })();
      window.location.replace(dest);
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full font-sans">

      {/* First-time password setup modal */}
      {firstTimeSetup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="font-bold text-maroon text-lg mb-1">Set Admin Password</h3>
            <p className="text-sm text-gray-500 mb-4">No password has been configured yet. Set one to continue.</p>
            <form onSubmit={handleSetPassword} className="space-y-3">
              <input type="password" placeholder="New password" value={newPass} onChange={e => setNewPass(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-maroon" required />
              <input type="password" placeholder="Confirm password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-maroon" required />
              <p className="text-xs text-gray-400">Min 8 chars, must include uppercase, lowercase, number and special character.</p>
              {setupMsg && <p className="text-red-500 text-sm">{setupMsg}</p>}
              <button type="submit" className="w-full bg-maroon text-white font-bold py-2.5 rounded hover:bg-maroon-light transition-colors">Set Password</button>
            </form>
          </div>
        </div>
      )}

      {/* Left Panel */}
      <div className="hidden lg:flex w-1/2 flex-col relative overflow-hidden bg-maroon"
        style={{
          backgroundImage: `url('/cover%20pattern.png')`,
          backgroundRepeat: "repeat",
          backgroundSize: "800px",
          backgroundBlendMode: "overlay",
        }}
      >
        {/* Top: logo + tagline + heading — centered */}
        <div className="relative z-10 flex flex-col items-center text-center pt-6 px-10">
          <img src="/Logo.png" alt="Papriwale Logo" className="w-28 h-28 object-contain mb-3" />
          <p className="text-white/70 text-xs tracking-widest uppercase font-semibold mb-4">
            SWEETS | NAMKEEN | BAKERY
          </p>
          <h1 className="font-serif text-4xl font-bold text-white leading-snug">
            Managing Sweetness,
          </h1>
          <h1 className="font-serif text-4xl font-bold text-gold leading-snug mb-0">
            Digitally
          </h1>
        </div>
        {/* Bottom: food cover image */}
        <img
          src="/cover.png"
          alt="Cover"
          className="absolute left-0 right-0 bottom-0 w-full z-0"
          style={{ objectFit: "fill", maxHeight: "100%" }}
        />
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 bg-[#fffdf7] flex flex-col justify-center items-center p-8 relative">
        <div className="w-full max-w-md">
          <h2 className="text-3xl font-bold text-gray-800 mb-1 text-center">Welcome Back !</h2>
          <p className="text-gray-400 mb-8 text-center">Login to continue</p>

          <div className="flex bg-[#f5f0e8] p-1 rounded-md mb-8">
            <button
              className={`flex-1 py-2 rounded-sm text-sm font-semibold transition-colors ${role === "Admin" ? "bg-maroon shadow text-white" : "bg-[#fffdf7] text-maroon/60 hover:text-maroon"}`}
              onClick={() => { setRole("Admin"); setError(""); setShowPass(false); }}
            >
              Admin
            </button>
            <button
              className={`flex-1 py-2 rounded-sm text-sm font-semibold transition-colors ${role === "Employee" ? "bg-maroon shadow text-white" : "bg-[#fffdf7] text-maroon/60 hover:text-maroon"}`}
              onClick={() => { setRole("Employee"); setError(""); setShowPass(false); }}
            >
              Employee
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder={role === "Employee" ? "Login ID" : "Username"}
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:border-maroon focus:ring-1 focus:ring-maroon"
                required
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type={showPass ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-md focus:outline-none focus:border-maroon focus:ring-1 focus:ring-maroon"
                required
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-maroon">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-semibold ${error.includes("set!") ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-maroon text-white font-semibold py-3 rounded-md hover:bg-maroon-light transition-colors shadow-md disabled:opacity-60"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

        </div>

        <p className="absolute bottom-6 text-gray-400 text-xs">
          © 2026 Papriwale. All Rights Reserved.
        </p>
      </div>

    </div>
  );
}
