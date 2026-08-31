import React, { useState, useEffect } from "react";
import { Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../../hooks/useAuthSession";

export default function SplashLogin() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { status, session, refreshAuth } = useAuthSession();

  useEffect(() => {
    if (status !== "authenticated" || !session) return;
    if (session.role === "Customer") navigate("/", { replace: true });
    else navigate("/admin/login", { replace: true });
  }, [navigate, session, status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (phone.length !== 10) { setError("Enter a valid 10-digit phone number."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/guest-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError("Something went wrong. Please try again."); return; }
      ["adminRole","adminName","sessionToken","employeeId","adminAvatar","accessPermissions"].forEach(k => localStorage.removeItem(k));
      localStorage.setItem("customerRole", "Customer");
      localStorage.setItem("customerName", data.name || "Customer");
      localStorage.setItem("customerPhone", phone);
      localStorage.setItem("employeePhone", phone);
      localStorage.setItem("customerId", data.customer_id);
      localStorage.setItem("isNewCustomer", data.is_new ? "true" : "false");
      if (data.avatar) localStorage.setItem("customerAvatar", data.avatar);
      else localStorage.removeItem("customerAvatar");
      window.dispatchEvent(new Event("customerProfileUpdated"));
      await refreshAuth();
      navigate("/");
    } catch { setError("Server error. Please try again."); }
    finally { setLoading(false); }
  };

  return (
    <div className="mobile-portal flex flex-col h-screen w-full max-w-md mx-auto bg-maroon relative shadow-2xl sm:border-x sm:border-gray-200" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="absolute inset-0" style={{
        backgroundImage: `url('/cover%20pattern.png')`,
        backgroundRepeat: "repeat",
        backgroundSize: "250px",
        backgroundBlendMode: "soft-light",
        opacity: 4.0,
      }}></div>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-6">
        <div className="w-32 h-32 rounded-full border-4 border-gold mb-4 flex items-center justify-center bg-white overflow-hidden shadow-xl">
          <img src="/Logo.png" alt="Logo" className="w-full h-full object-contain p-1" />
        </div>
        <h1 className="font-serif text-3xl font-bold mb-1 tracking-wider" style={{ color: '#FFD700', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>SHRI BADRINARAYAN</h1>
        <p className="text-sm tracking-[0.3em] uppercase mb-4 font-semibold text-gold">Papriwale</p>
        <p className="text-[10px] tracking-widest text-white/80 mb-6">SWEETS | NAMKEEN | BAKERY</p>
        <p className="text-lg font-light italic text-white/90">"Managing Sweetness, Digitally"</p>
      </div>

      {/* Login Sheet */}
      <div className="bg-cream-light rounded-t-3xl p-8 pb-12 relative z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
        <h2 className="text-2xl font-bold text-maroon mb-1">Customer Login</h2>
        <p className="text-gray-500 mb-6 text-sm">Enter your phone number to start ordering</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="tel" maxLength={10} placeholder="10-digit phone number" required value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
              className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-maroon text-base font-medium tracking-wider shadow-sm"
            />
          </div>
          {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}
          <button type="submit" disabled={loading || phone.length < 10}
            className="w-full bg-maroon text-cream font-bold py-4 rounded-xl hover:bg-maroon-light transition-colors shadow-md text-lg disabled:opacity-60">
            {loading ? "Please wait..." : "Continue →"}
          </button>
        </form>

        <div className="text-center mt-4">
          <p className="text-gray-400 text-xs">Enter your number to continue ordering</p>
        </div>
        <p className="text-center text-gray-400 text-[10px] mt-4 uppercase tracking-wider">
          © 2026 Papriwale. All Rights Reserved.
        </p>
      </div>
    </div>
  );
}
