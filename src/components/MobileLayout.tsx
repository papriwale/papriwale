import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, Grid, ShoppingBag, User, Menu, X, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import { useCart } from "../hooks/useCart";

export default function MobileLayout() {
  const location = useLocation();
  const { items } = useCart();
  const cartCount = items.length;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [avatar, setAvatar] = useState<string | null>(
    localStorage.getItem("customerAvatar") || localStorage.getItem("adminAvatar")
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tableId = params.get("table_id");
    if (tableId) sessionStorage.setItem("qr_table_id", tableId);

    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    const handleProfileUpdate = () => setAvatar(
      localStorage.getItem("customerAvatar") || localStorage.getItem("adminAvatar")
    );

    window.addEventListener("resize", handleResize);
    window.addEventListener("customerProfileUpdated", handleProfileUpdate);
    window.addEventListener("avatarChanged", handleProfileUpdate);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("customerProfileUpdated", handleProfileUpdate);
      window.removeEventListener("avatarChanged", handleProfileUpdate);
    };
  }, []);

  if (isDesktop) return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="text-center">
        <p className="text-gray-500 text-lg font-semibold">Please open on a mobile device</p>
        <p className="text-gray-400 text-sm mt-1">or use browser mobile view (F12)</p>
      </div>
    </div>
  );

  return (
    <div className="mobile-portal flex flex-col w-full max-w-md mx-auto bg-cream-light font-sans relative shadow-2xl sm:border-x sm:border-gray-200" style={{ height: '100dvh' }}>

      {/* Top Header */}
      <header className="bg-maroon text-cream flex items-center justify-between p-4 shrink-0 z-20" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <button onClick={() => setSidebarOpen(true)} className="p-1"><Menu size={24} /></button>
        <img src="/Logo.png" alt="Logo" className="w-12 h-12 object-contain absolute left-1/2 -translate-x-1/2" />
        <Link to="/profile" className="p-1">
          {avatar
            ? <img src={avatar} alt="Profile" className="w-6 h-6 rounded-full object-cover border border-gold/50" />
            : <User size={20} />}
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-cream-light" style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center shrink-0 z-20" style={{ height: 'calc(64px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {[
          { name: "Home",       path: "/",           icon: Home },
          { name: "Categories", path: "/categories", icon: Grid },
          { name: "Cart",       path: "/cart",        icon: ShoppingBag, badge: cartCount },
          { name: "Orders",     path: "/orders",      icon: FileText },
          { name: "Profile",    path: "/profile",     icon: User },
        ].map((item) => {
          const isActive = location.pathname === item.path;
          const badge = (item as any).badge;
          return (
            <Link key={item.name} to={item.path} className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors relative ${isActive ? "text-maroon" : "text-gray-400 hover:text-maroon-light"}`}>
              <div className="relative">
                <item.icon size={20} className={isActive ? "fill-maroon/10" : ""} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-maroon text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sidebar */}
      {sidebarOpen && (
        <div className="absolute inset-0 z-50 flex">
          <div className="absolute inset-0 bg-maroon/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-4/5 max-w-[300px] h-full bg-cream-light flex flex-col shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="p-6 text-center border-b border-maroon-light" style={{
              backgroundColor: "#6b1d2a",
              backgroundImage: `url('/cover%20pattern.png')`,
              backgroundRepeat: "repeat",
              backgroundSize: "200px",
              backgroundBlendMode: "soft-light",
            }}>
              <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 text-cream/70 hover:text-white"><X size={24} /></button>
              <div className="w-24 h-24 rounded-full border-2 border-gold mx-auto mb-3 overflow-hidden bg-white">
                <img src="/Logo.png" alt="Logo" className="w-full h-full object-contain p-1" />
              </div>
              <p className="text-[10px] text-cream/70 mt-2 uppercase tracking-widest">SWEETS | NAMKEEN | BAKERY</p>
            </div>
            <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
              {[
                { label: "Home",       to: "/" },
                { label: "Categories", to: "/categories" },
                { label: "Feedback",   to: "/feedback" },
                { label: "About Us",   to: "/about-us" },
                { label: "Wishlist",   to: "/wishlist" },
                { label: "Orders",     to: "/orders" },
              ].map(link => (
                <Link key={link.label} to={link.to} onClick={() => setSidebarOpen(false)} className="block px-4 py-3 text-maroon font-medium hover:bg-maroon/5 rounded-md transition-colors">
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="p-4 text-center text-xs text-maroon/50 border-t border-maroon/10">© 2026 Papriwale.</div>
          </div>
        </div>
      )}
    </div>
  );
}
