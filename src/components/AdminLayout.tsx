import { Outlet, Link, useLocation, Navigate, useNavigate } from "react-router-dom";
import {
  Search, Bell, Settings, User, ShoppingCart, Package, List,
  Users, FileText, Star, AlertTriangle, X, ExternalLink, LayoutDashboard, Printer,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "../lib/apiFetch";
import { usePrinter } from "../hooks/usePrinter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  title: string;
  description: string;
  notif_type: "info" | "warning" | "error";
  read: boolean;
  created_at: string;
}

interface DealerInvoiceModal {
  dealer_id: string;
  dealer_name: string;
  amount_due: string;
  expiry_date: string;
}

interface SearchResults {
  products: any[];
  dealers: any[];
  employees: any[];
}

interface PrintableOrderItem {
  name: string;
  size?: string;
  unit?: string;
  qty: number;
  price: number;
}

interface PrintableOrder {
  id: string;
  timestamp?: string;
  table_id?: string;
  created_by?: string;
  payment_method?: string;
  payment_mode?: string;
  items?: PrintableOrderItem[];
  grand_total?: number;
  discount_applied?: number;
  tax_collected?: number;
  extraneous_charges?: number;
}

// ─── Nav items (static, defined outside component) ───────────────────────────

const ALL_NAV_ITEMS = [
  { name: "Dashboard",          path: "/admin/dashboard",  icon: LayoutDashboard, module: null },
  { name: "POS Billing",        path: "/admin/pos",        icon: ShoppingCart,    module: "POS Billing" },
  { name: "Orders",             path: "/admin/orders",     icon: ShoppingCart,    module: "Orders" },
  { name: "Products Inventory", path: "/admin/inventory",  icon: Package,         module: "Inventory" },
  { name: "Categories",         path: "/admin/categories", icon: List,            module: "Inventory" },
  { name: "Dealer & Expenses",  path: "/admin/dealer",     icon: FileText,        module: "Financial Reports" },
  { name: "Employee",           path: "/admin/employee",   icon: Users,           module: "Employees" },
  { name: "Report",             path: "/admin/report",     icon: FileText,        module: "Financial Reports" },
  { name: "Reviews",            path: "/admin/reviews",    icon: Star,            module: null },
  { name: "Settings",           path: "/admin/settings",   icon: Settings,        module: "Settings" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminLayout() {
  const location  = useLocation();
  const navigate  = useNavigate();

  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searchBlocked, setSearchBlocked] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobile,      setIsMobile]      = useState(window.innerWidth < 768);
  const [isOffline,     setIsOffline]     = useState(!navigator.onLine);

  const [showNotifs,    setShowNotifs]    = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [badgeFlash,    setBadgeFlash]    = useState(false);

  const [avatar,             setAvatar]             = useState<string | null>(null);
  const [inventoryDepleted,  setInventoryDepleted]  = useState(false);
  const [dealerInvoiceModal, setDealerInvoiceModal] = useState<DealerInvoiceModal | null>(null);
  const [qrOrderMap,         setQrOrderMap]         = useState<Record<string, any>>({});

  const notifRef  = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const { printReceipt } = usePrinter();

  // ── Load avatar from server (never from localStorage) ──────────────────
  const fetchAvatar = () => {
    const r = localStorage.getItem("adminRole") || "";
    const empId = localStorage.getItem("employeeId") || "";
    if (r === "Admin") {
      apiFetch("/api/settings").then(res => res.json()).then((s: any) => {
        setAvatar(s.adminAvatar || null);
        if (s.adminName) localStorage.setItem("adminName", s.adminName);
      }).catch(() => {});
    } else if (empId) {
      apiFetch("/api/auth/me").then(res => res.json()).then((me: any) => {
        setAvatar(me.avatar || null);
        if (me.avatar) localStorage.setItem("adminAvatar", me.avatar);
        else localStorage.removeItem("adminAvatar");
      }).catch(() => {
        setAvatar(localStorage.getItem("adminAvatar") || null);
      });
    }
  };

  // If browser restores this page from bfcache after logout, force reload to login
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        const role = localStorage.getItem("adminRole");
        if (!role) window.location.replace("/admin/login");
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => { fetchAvatar(); }, []);

  // ── Load notifications on mount ──────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/notifications")
      .then(r => r.json())
      .then((data: Notification[]) => {
        if (Array.isArray(data)) {
          setNotifications(data);
          setUnreadCount(data.filter(n => !n.read).length);
        }
      })
      .catch(() => {});
  }, []);

  // ── Global event listeners + WebSocket ───────────────────────────────────
  useEffect(() => {
    const onResize       = () => setIsMobile(window.innerWidth < 768);
    const onOffline      = () => setIsOffline(true);
    const onOnline       = () => setIsOffline(false);
    const onAvatarChange = () => fetchAvatar();

    window.addEventListener("resize",        onResize);
    window.addEventListener("offline",       onOffline);
    window.addEventListener("online",        onOnline);
    window.addEventListener("avatarChanged", onAvatarChange);

    const onOutsideClick = (e: MouseEvent) => {
      if (notifRef.current  && !notifRef.current.contains(e.target  as Node)) setShowNotifs(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchResults(null);
    };
    document.addEventListener("mousedown", onOutsideClick);

    const initAudio = () => {
      if (!audioRef.current) {
        audioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      }
      window.removeEventListener("click", initAudio);
    };
    window.addEventListener("click", initAudio);

    // WebSocket with auto-reconnect
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const addNotif = (title: string, description: string, notif_type: Notification["notif_type"]) => {
      const n: Notification = { id: Math.random().toString(), title, description, notif_type, read: false, created_at: new Date().toISOString() };
      setNotifications(prev => [n, ...prev]);
      setUnreadCount(prev => prev + 1);
      setBadgeFlash(true);
      setTimeout(() => setBadgeFlash(false), 700);
    };

    const connectWS = () => {
      if (destroyed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);

      ws.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);
          if (type === "INBOUND_QR_ORDER") {
            const nid = Math.random().toString();
            const n: Notification = { id: nid, title: `New QR Order #${payload.order_id}`, description: `Table ${payload.table_number} • ₹${payload.bill_amount}`, notif_type: "info", read: false, created_at: new Date().toISOString() };
            setNotifications(prev => [n, ...prev]);
            setUnreadCount(prev => prev + 1);
            setBadgeFlash(true);
            setTimeout(() => setBadgeFlash(false), 700);
            setQrOrderMap(prev => ({ ...prev, [nid]: payload }));
            audioRef.current?.play().catch(() => {});
          }
          if (type === "INVENTORY_DEPLETED") {
            setInventoryDepleted(true);
            addNotif(`🚫 Out of Stock: ${payload.product_name}`, `${payload.product_name} has reached zero stock.`, "error");
          }
          if (type === "LOW_STOCK_ALERT") {
            addNotif(`⚠️ Low Stock: ${payload.product_name}`, `Only ${payload.remaining_qty} units left.`, "warning");
          }
          if (type === "DEALER_INVOICE_DUE") {
            setDealerInvoiceModal({ dealer_id: payload.dealer_id, dealer_name: payload.dealer_name, amount_due: payload.amount_due, expiry_date: payload.expiry_date });
          }
          if (type === "PAYMENT_DUE_SOON") {
            addNotif(`⏰ Payment Due Soon: ${payload.material_name}`, `₹${payload.amount} due on ${payload.due_date} — Dealer: ${payload.dealer_name}`, "warning");
          }
          if (type === "PAYMENT_OVERDUE") {
            addNotif(`🚨 Payment Overdue: ${payload.material_name}`, `₹${payload.amount} was due on ${payload.due_date} — Dealer: ${payload.dealer_name}`, "error");
          }
          if (type === "NEW_REVIEW") {
            window.dispatchEvent(new Event("new-review"));
          }
          if (type === "STOCK_UPDATED") {
            window.dispatchEvent(new Event("stock-updated"));
          }
        } catch {}
      };

      ws.onclose = () => { if (!destroyed) reconnectTimer = setTimeout(connectWS, 3000); };
      ws.onerror = () => ws.close();
    };

    connectWS();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      window.removeEventListener("resize",        onResize);
      window.removeEventListener("offline",       onOffline);
      window.removeEventListener("online",        onOnline);
      window.removeEventListener("avatarChanged", onAvatarChange);
      window.removeEventListener("click",         initAudio);
      document.removeEventListener("mousedown",   onOutsideClick);
    };
  }, []);

  // ── Debounced omni-search ─────────────────────────────────────────────────
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) setSearchResults(await res.json());
      } catch { setIsOffline(true); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── RBAC helpers ──────────────────────────────────────────────────────────
  const role        = localStorage.getItem("adminRole") || "";
  const permissions = JSON.parse(localStorage.getItem("accessPermissions") || "{}") as Record<string, Record<string, string>>;
  const rolePerms   = permissions[role] || {};
  const canSee      = (module: string) => role === "Admin" || (rolePerms[module] ?? "Hidden") !== "Hidden";

  const goTo = (path: string, requiredModule: string | null) => {
    if (requiredModule && !canSee(requiredModule)) {
      setSearchBlocked(requiredModule);
      setTimeout(() => setSearchBlocked(null), 3000);
      return;
    }
    setSearchQuery("");
    setSearchResults(null);
    navigate(path);
  };

  const handleBellClick = () => {
    const opening = !showNotifs;
    setShowNotifs(opening);
    if (opening) {
      setUnreadCount(0);
      apiFetch("/api/notifications/read-all", { method: "PATCH" }).catch(() => {});
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    ["adminRole","adminName","sessionToken","employeeId","adminAvatar","accessPermissions"].forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();
    window.location.replace("/admin/login");
  };

  const handleClearNotifs = () => {
    apiFetch("/api/notifications", { method: "DELETE" }).catch(() => {});
    setNotifications([]);
    setUnreadCount(0);
    setQrOrderMap({});
  };

  if (isLoggingOut) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-cream-light text-maroon">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-maroon border-t-transparent animate-spin" />
          <p className="font-semibold">Signing out...</p>
        </div>
      </div>
    );
  }

  const printQrOrderFallback = useCallback((order: PrintableOrder) => {
    const w = window.open("", "", "width=400,height=600");
    if (!w) return;
    const items = Array.isArray(order.items) ? order.items : [];
    const subtotal = items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.qty) || 0)), 0);
    const discount = Number(order.discount_applied || 0);
    const taxes = Number(order.tax_collected || 0);
    const otherCharges = Number(order.extraneous_charges || 0);
    const grandTotal = Number(order.grand_total || 0);
    w.document.write(`<html><head><title>Order ${order.id}</title><style>
      body{font-family:monospace;padding:16px;font-size:13px}
      h2{text-align:center;margin:0 0 4px}p{margin:2px 0;text-align:center}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      td{padding:3px 0}hr{border:none;border-top:1px dashed #000;margin:8px 0}
      .right{text-align:right}.bold{font-weight:bold}
    </style></head><body>
      <h2>SHRI BADRINARAYAN</h2><p>Papriwale</p><hr/>
      <p>Order: <b>${order.id}</b></p>
      <p>Table: ${order.table_id || "Delivery"} | ${order.timestamp ? new Date(order.timestamp).toLocaleString() : "—"}</p><hr/>
      <table>${items.map((i: any) => `<tr><td>${i.name}${i.size ? ` (${i.size})` : ""}</td><td>x${i.qty}</td><td class="right">₹${(Number(i.price) * Number(i.qty)).toFixed(2)}</td></tr>`).join("")}</table><hr/>
      <p class="bold">Subtotal: ₹${subtotal.toFixed(2)}</p>
      ${discount > 0 ? `<p>Discount: -₹${discount.toFixed(2)}</p>` : ""}
      ${otherCharges > 0 ? `<p>Other Charges: ₹${otherCharges.toFixed(2)}</p>` : ""}
      <p>Tax (GST): ₹${taxes.toFixed(2)}</p><hr/>
      <p class="bold">Grand Total: ₹${grandTotal.toFixed(2)}</p>
      <p>Payment: ${order.payment_method || order.payment_mode || "—"}</p><hr/>
      <p>Thank you!</p>
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 300);
  }, []);

  const printQrOrder = useCallback(async (orderId: string) => {
    const res = await apiFetch("/api/orders");
    const all = await res.json();
    const order = (Array.isArray(all) ? all : []).find((o: PrintableOrder) => o.id === orderId);
    if (!order) return;

    const items = Array.isArray(order.items) ? order.items : [];
    const subtotal = items.reduce((sum, item) => {
      return sum + ((Number(item.price) || 0) * (Number(item.qty) || 0));
    }, 0);

    const result = await printReceipt({
      invoiceNo: order.id,
      cashier: order.created_by || "Customer",
      paymentMode: order.payment_method || order.payment_mode || "—",
      items,
      subtotal,
      discountTotal: Number(order.discount_applied || 0),
      taxes: Number(order.tax_collected || 0),
      grandTotal: Number(order.grand_total || 0),
      otherCharges: Number(order.extraneous_charges || 0),
    });

    if (result.fallback) printQrOrderFallback(order);
  }, [printQrOrderFallback, printReceipt]);

  if (isMobile) return (
    <div className="flex items-center justify-center h-screen bg-gray-100 p-6">
      <div className="text-center">
        <p className="text-gray-600 font-semibold">Admin portal is not available on mobile.</p>
        <p className="text-gray-400 text-sm mt-1">Please use a desktop or laptop browser.</p>
      </div>
    </div>
  );

  const isEmployee = role !== "Admin";
  const navItems = ALL_NAV_ITEMS.filter(item => {
    if (item.module === null) return role === "Admin";
    return canSee(item.module);
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-full bg-cream">

      {/* Sidebar */}
      <aside className="w-64 bg-maroon text-cream-light flex flex-col fixed h-full z-10">
        <div className="p-6 text-center border-b border-maroon-light select-none">
          <div className="w-20 h-20 rounded-full border-2 border-gold mx-auto mb-3 flex items-center justify-center bg-cream-light overflow-hidden">
            <img src="/Logo.png" alt="Logo" className="w-full h-full object-contain p-1" />
          </div>
          <h1 className="font-serif text-lg text-gold font-bold leading-tight">SHRI BADRINARAYAN</h1>
          <p className="text-xs tracking-widest uppercase mt-1">Papriwale</p>
          <p className="text-[10px] text-cream/70 mt-1">SWEETS | NAMKEEN | BAKERY</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 select-none">
          {navItems.map(item => (
            <Link
              key={item.name}
              to={item.path}
              onClick={() => { if (item.path === "/admin/inventory") setInventoryDepleted(false); }}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors relative ${
                location.pathname === item.path
                  ? "bg-gold text-maroon font-semibold"
                  : "hover:bg-maroon-light text-cream/90"
              }`}
            >
              <item.icon size={18} />
              {item.name}
              {item.path === "/admin/inventory" && inventoryDepleted && (
                <span className="ml-auto flex items-center gap-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                  <AlertTriangle size={9} /> DEPLETED
                </span>
              )}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 ml-64 flex flex-col h-full overflow-hidden">

        {/* Header */}
        <header
          style={{ position: "fixed", top: 0, left: "256px", width: "calc(100vw - 256px)", zIndex: 9999 }}
          className="h-16 bg-cream border-b border-gold/20 flex items-center justify-between px-6"
        >
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-2xl text-maroon font-semibold capitalize">
              {location.pathname.split("/").pop()?.replace("-", " ") || "Dashboard"}
            </h2>
          </div>

          <div className="flex items-center gap-6">



            {/* Bell — admin only */}
            {!isEmployee && (
            <div className="relative" ref={notifRef}>
              <button
                onClick={handleBellClick}
                className="relative w-10 h-10 flex items-center justify-center text-maroon hover:text-gold transition-colors focus:outline-none"
              >
                <Bell size={24} />
                {unreadCount > 0 && (
                  <span className={`absolute top-0.5 right-0.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${badgeFlash ? "badge-flash" : ""}`}>
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 top-full mt-3 w-80 bg-white border border-gray-100 rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-bold text-gray-800">Notifications</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">No notifications</div>
                    ) : notifications.map(notif => {
                      const qrPayload = qrOrderMap[notif.id];
                      return (
                        <div key={notif.id} className="p-3 border-b border-gray-50 hover:bg-gray-50">
                          <p className={`text-sm font-semibold ${
                            notif.notif_type === "error"   ? "text-red-600"   :
                            notif.notif_type === "warning" ? "text-amber-600" : "text-gray-800"
                          }`}>{notif.title}</p>
                          <p className="text-xs text-gray-600">{notif.description}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-gray-400">{new Date(notif.created_at).toLocaleString()}</span>
                            {qrPayload && (
                              <button
                                onClick={() => printQrOrder(qrPayload.order_id)}
                                className="flex items-center gap-1 text-[11px] font-semibold text-maroon hover:text-maroon-light bg-maroon/10 hover:bg-maroon/20 px-2 py-0.5 rounded transition-colors"
                              >
                                <Printer size={11} /> Print
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-2 text-center border-t border-gray-100 bg-gray-50">
                    <button onClick={handleClearNotifs} className="text-xs font-semibold text-maroon hover:text-maroon-light">
                      Clear all
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Settings — admin only */}
            {!isEmployee && canSee("Settings") && (
              <Link to="/admin/settings" className="w-10 h-10 flex items-center justify-center text-maroon hover:text-gold transition-colors">
                <Settings size={24} />
              </Link>
            )}

            {/* User menu */}
            <div className="relative group">
              <div className="flex items-center gap-2 border-l border-gray-300 pl-4 cursor-pointer">
                <div className="text-right">
                  <p className="text-sm font-semibold text-maroon">{localStorage.getItem("adminName") || "Super Admin"}</p>
                  <p className="text-[10px] text-gray-500 uppercase">{localStorage.getItem("adminRole") || "Admin"}</p>
                </div>
                <div className="w-10 h-10 bg-maroon rounded-full flex items-center justify-center text-gold overflow-hidden">
                  {avatar ? <img src={avatar} alt="Admin" className="w-full h-full object-cover" /> : <User size={20} />}
                </div>
              </div>
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-100 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                {!isEmployee && (
                  <Link to="/admin/profile" className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-maroon border-b border-gray-50 font-medium">
                    Profile Settings
                  </Link>
                )}
                <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 font-medium">
                  Logout
                </button>
              </div>
            </div>

          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-white relative mt-16">
          <Outlet />
        </main>
      </div>

      {/* Dealer Invoice Due Modal */}
      {dealerInvoiceModal && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border-2 border-amber-400">
            <div className="bg-amber-400 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle size={24} className="text-amber-900" />
                <h3 className="font-serif text-xl font-bold text-amber-900">DEALER INVOICE DUE</h3>
              </div>
              <button onClick={() => setDealerInvoiceModal(null)} className="text-amber-900 hover:text-amber-700">
                <X size={22} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Dealer</span>
                  <span className="font-bold text-gray-900 text-lg">{dealerInvoiceModal.dealer_name}</span>
                </div>
                <div className="flex justify-between items-center border-t border-amber-200 pt-3">
                  <span className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Amount Due</span>
                  <span className="font-bold text-red-600 text-2xl">₹{dealerInvoiceModal.amount_due}</span>
                </div>
                <div className="flex justify-between items-center border-t border-amber-200 pt-3">
                  <span className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Due Date</span>
                  <span className="font-bold text-amber-700 text-lg">{dealerInvoiceModal.expiry_date}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Link
                  to="/admin/dealer"
                  onClick={() => setDealerInvoiceModal(null)}
                  className="flex items-center justify-center gap-2 bg-maroon text-white font-bold py-3 rounded-xl hover:bg-maroon-light transition-colors text-sm"
                >
                  <ExternalLink size={16} /> View Dealer
                </Link>
                <button
                  onClick={() => setDealerInvoiceModal(null)}
                  className="bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors text-sm"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
