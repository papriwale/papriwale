import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { CartProvider } from "./hooks/useCart";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuthSession } from "./hooks/useAuthSession";

const AdminLayout = React.lazy(() => import("./components/AdminLayout"));
const MobileLayout = React.lazy(() => import("./components/MobileLayout"));
const AdminLogin = React.lazy(() => import("./pages/admin/Login"));
const AdminDashboard = React.lazy(() => import("./pages/admin/Dashboard"));
const POS = React.lazy(() => import("./pages/admin/POS"));
const Inventory = React.lazy(() => import("./pages/admin/Inventory"));
const AdminOrders = React.lazy(() => import("./pages/admin/Orders"));
const AdminCategories = React.lazy(() => import("./pages/admin/Categories"));
const AdminEmployee = React.lazy(() => import("./pages/admin/Employee"));
const AdminReport = React.lazy(() => import("./pages/admin/Report"));
const DealerExpenses = React.lazy(() => import("./pages/admin/Dealer"));
const AdminReviews = React.lazy(() => import("./pages/admin/Reviews"));
const AdminGallery = React.lazy(() => import("./pages/admin/Gallery"));
const AdminSettings = React.lazy(() => import("./pages/admin/Settings"));
const AdminProfile = React.lazy(() => import("./pages/admin/Profile"));
const SplashLogin = React.lazy(() => import("./pages/mobile/SplashLogin"));
const Home = React.lazy(() => import("./pages/mobile/Home"));
const Cart = React.lazy(() => import("./pages/mobile/Cart"));
const Checkout = React.lazy(() => import("./pages/mobile/Checkout"));
const Categories = React.lazy(() => import("./pages/mobile/Categories"));
const ProductList = React.lazy(() => import("./pages/mobile/ProductList"));
const ProductDetail = React.lazy(() => import("./pages/mobile/ProductDetail"));
const Orders = React.lazy(() => import("./pages/mobile/Orders"));
const Profile = React.lazy(() => import("./pages/mobile/Profile"));
const Feedback = React.lazy(() => import("./pages/mobile/Feedback"));
const Wishlist = React.lazy(() => import("./pages/mobile/Wishlist"));
const AboutUs = React.lazy(() => import("./pages/mobile/AboutUs"));
const Gallery = React.lazy(() => import("./pages/mobile/Gallery"));
const Bestsellers = React.lazy(() => import("./pages/mobile/Bestsellers"));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream text-maroon">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-gold border-t-transparent animate-spin" />
        <p className="font-semibold">Loading screen...</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { status, session } = useAuthSession();
  if (status === "loading") return null;
  if (!session || session.role === "Customer") return <Navigate to="/admin/login" replace />;
  return children;
}

function RequireMobileAuth({ children }: { children: React.ReactElement }) {
  const { status, session } = useAuthSession();
  const [isDesktop, setIsDesktop] = React.useState(window.innerWidth >= 768);
  React.useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  if (status === "loading") return null;
  if (isDesktop) return <Navigate to="/admin/login" replace />;
  if (session?.role === "Customer") return children;
  return <Navigate to="/login" replace />;
}

function RoleHomeRedirect() {
  const { status, session } = useAuthSession();
  if (status === "loading") return null;
  const role = session?.role || "";
  if (role === "Admin") return <Navigate to="/admin/dashboard" replace />;
  const rolePerms: Record<string, string> = session?.permissions || {};
  const moduleRouteMap: [string, string][] = [
    ["POS Billing", "/admin/pos"],
    ["Orders", "/admin/orders"],
    ["Inventory", "/admin/inventory"],
    ["Financial Reports", "/admin/dealer"],
    ["Settings", "/admin/settings"],
  ];
  const first = moduleRouteMap.find(([mod]) => (rolePerms[mod] ?? "Hidden") !== "Hidden");
  return <Navigate to={first ? first[1] : "/admin/pos"} replace />;
}

function PermissionGuard({ module, children }: { module: string; children: React.ReactElement }) {
  const location = useLocation();
  const { status, session } = useAuthSession();
  if (status === "loading") return null;
  const role = session?.role || "";
  if (role === "Admin") return children;
  if (!session) return <Navigate to="/admin/login" replace />;

  if (module === "__admin_only__") {
    const rolePerms: Record<string, string> = session?.permissions || {};
    const moduleRouteMap: [string, string][] = [
      ["POS Billing", "/admin/pos"],
      ["Orders", "/admin/orders"],
      ["Inventory", "/admin/inventory"],
      ["Financial Reports", "/admin/dealer"],
      ["Settings", "/admin/settings"],
    ];
    const first = moduleRouteMap.find(([mod]) => (rolePerms[mod] ?? "Hidden") !== "Hidden");
    return <Navigate to={first ? first[1] : "/admin/pos"} replace />;
  }

  const rolePerms: Record<string, string> = session?.permissions || {};
  const access = rolePerms[module] ?? "Hidden";

  if (access === "Hidden") {
    fetch("/api/auth/forbidden-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: location.pathname, role }),
    }).catch(() => {});
    const moduleRouteMap: [string, string][] = [
      ["POS Billing", "/admin/pos"],
      ["Orders", "/admin/orders"],
      ["Inventory", "/admin/inventory"],
      ["Financial Reports", "/admin/dealer"],
      ["Settings", "/admin/settings"],
    ];
    const first = moduleRouteMap.find(([mod]) => (rolePerms[mod] ?? "Hidden") !== "Hidden");
    return <Navigate to={first ? first[1] : "/admin/pos"} replace />;
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <React.Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
              <Route index element={<RoleHomeRedirect />} />
              <Route path="dashboard" element={<PermissionGuard module="__admin_only__"><ErrorBoundary><AdminDashboard /></ErrorBoundary></PermissionGuard>} />
              <Route path="pos" element={<PermissionGuard module="POS Billing"><ErrorBoundary><POS /></ErrorBoundary></PermissionGuard>} />
              <Route path="inventory" element={<PermissionGuard module="Inventory"><ErrorBoundary><Inventory /></ErrorBoundary></PermissionGuard>} />
              <Route path="orders" element={<PermissionGuard module="Orders"><ErrorBoundary><AdminOrders /></ErrorBoundary></PermissionGuard>} />
              <Route path="categories" element={<PermissionGuard module="Inventory"><ErrorBoundary><AdminCategories /></ErrorBoundary></PermissionGuard>} />
              <Route path="employee" element={<PermissionGuard module="Employees"><ErrorBoundary><AdminEmployee /></ErrorBoundary></PermissionGuard>} />
              <Route path="report" element={<PermissionGuard module="Financial Reports"><ErrorBoundary><AdminReport /></ErrorBoundary></PermissionGuard>} />
              <Route path="dealer" element={<PermissionGuard module="Financial Reports"><ErrorBoundary><DealerExpenses /></ErrorBoundary></PermissionGuard>} />
              <Route path="reviews" element={<PermissionGuard module="__admin_only__"><ErrorBoundary><AdminReviews /></ErrorBoundary></PermissionGuard>} />
              <Route path="gallery" element={<PermissionGuard module="__admin_only__"><ErrorBoundary><AdminGallery /></ErrorBoundary></PermissionGuard>} />
              <Route path="settings" element={<PermissionGuard module="Settings"><ErrorBoundary><AdminSettings /></ErrorBoundary></PermissionGuard>} />
              <Route path="profile" element={<PermissionGuard module="__admin_only__"><ErrorBoundary><AdminProfile /></ErrorBoundary></PermissionGuard>} />
            </Route>

            <Route path="/login" element={<SplashLogin />} />
            <Route path="/" element={<RequireMobileAuth><CartProvider><MobileLayout /></CartProvider></RequireMobileAuth>}>
              <Route index element={<Home />} />
              <Route path="bestsellers" element={<Bestsellers />} />
              <Route path="categories" element={<Categories />} />
              <Route path="category/:id" element={<ProductList />} />
              <Route path="product/:id" element={<ProductDetail />} />
              <Route path="cart" element={<Cart />} />
              <Route path="checkout" element={<Checkout />} />
              <Route path="orders" element={<Orders />} />
              <Route path="profile" element={<Profile />} />
              <Route path="feedback" element={<Feedback />} />
              <Route path="wishlist" element={<Wishlist />} />
              <Route path="about-us" element={<AboutUs />} />
              <Route path="gallery" element={<Gallery />} />
            </Route>
          </Routes>
        </React.Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
