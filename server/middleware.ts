import { Request, Response, NextFunction } from "express";
import { db, supabase } from "./db.js";
import { broadcast } from "./ws.js";
import crypto from "crypto";

const isDev = process.env.NODE_ENV !== "production";

// ─── Session interface ────────────────────────────────────────────────────────
export interface Session {
  role: string;
  employeeId?: string;
  name: string;
  createdAt: number;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_COOKIE_NAME = "papriwale_session";

// In-memory fallback (used only when Supabase is unavailable)
export const sessionStore = new Map<string, Session>();

function getCookieValue(cookieHeader: string | undefined, name: string): string {
  if (!cookieHeader) return "";
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("=") || "");
  }
  return "";
}

export function extractSessionTokenFromCookie(cookieHeader: string | undefined): string {
  return getCookieValue(cookieHeader, SESSION_COOKIE_NAME);
}

export function extractSessionToken(req: Request): string {
  return extractSessionTokenFromCookie(req.header("cookie"));
}

export function buildSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "Secure; " : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; ${secure}Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "Secure; " : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; ${secure}Max-Age=0`;
}

export async function createSession(role: string, name: string, employeeId?: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const session: Session = { role, name, employeeId, createdAt: Date.now() };
  if (supabase) {
    const { error } = await supabase.from("sessions").insert({
      token,
      role,
      name,
      employee_id: employeeId || null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    });
    if (error && isDev) console.warn("[createSession] Supabase insert failed (sessions table may not exist):", error.message);
  }
  sessionStore.set(token, session);
  return token;
}

export async function destroySession(token: string): Promise<void> {
  sessionStore.delete(token);
  if (supabase) {
    try { await supabase.from("sessions").delete().eq("token", token); } catch {}
  }
}

export async function getSession(token: string): Promise<Session | null> {
  // Try in-memory first (fast path)
  const mem = sessionStore.get(token);
  if (mem) {
    if (Date.now() - mem.createdAt > SESSION_TTL_MS) {
      sessionStore.delete(token);
      if (supabase) try { await supabase.from("sessions").delete().eq("token", token); } catch {}
      return null;
    }
    // Sliding window — refresh both memory and Supabase expires_at
    mem.createdAt = Date.now();
    if (supabase) try {
      await supabase.from("sessions").update({ expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString() }).eq("token", token);
    } catch {}
    return mem;
  }
  // Fallback: check Supabase (handles server restarts)
  if (supabase) {
    try {
      const { data, error } = await supabase.from("sessions").select("*").eq("token", token).maybeSingle();
      // If sessions table doesn't exist yet, treat as no session (don't crash)
      if (error) {
        if (isDev) console.warn("[getSession] Supabase error:", error.message);
        return null;
      }
      if (!data) return null;
      if (new Date(data.expires_at).getTime() < Date.now()) {
        try { await supabase.from("sessions").delete().eq("token", token); } catch {}
        return null;
      }
      const session: Session = { role: data.role, name: data.name, employeeId: data.employee_id, createdAt: new Date(data.created_at).getTime() };
      sessionStore.set(token, session);
      return session;
    } catch { return null; }
  }
  return null;
}

export function checkRateLimit(_ip: string): { allowed: boolean } { return { allowed: true }; }
export function resetRateLimit(_ip: string): void {}

// ─── Public paths that skip auth ─────────────────────────────────────────────
// Mobile QR portal posts orders and reads products/categories without a session.
const PUBLIC_PATHS = new Set([
  "/health",
  "/auth/login",
  "/auth/set-password",
  "/auth/guest-login",
  "/auth/me",
]);

// Paths that are fully public (mobile menu portal — no admin session required)
function isPublicMobilePath(path: string): boolean {
  // GET requests to products, categories, product-variants are public (menu browsing)
  return (
    path.startsWith("/products") ||
    path.startsWith("/categories") ||
    path.startsWith("/product-variants") ||
    path.startsWith("/banners")
  );
}

// ─── Module derivation from request path ─────────────────────────────────────
function deriveModule(path: string, method: string): string {
  // Inventory-specific write operations and the audit log
  if (path.includes("inventory-log"))                          return "Inventory";
  if (path.includes("/stock"))                                 return "Inventory";
  // Product reads are needed by POS — only writes (add/delete) are Inventory-gated
  if (path.match(/^\/products\/[^/]+$/) && ["DELETE"].includes(method)) return "Inventory";
  if (path === "/products" && method === "POST")               return "Inventory";
  if (path.includes("products") || path.includes("product-variants")) return "POS Billing";
  if (path.includes("categories"))                             return "Inventory";
  if (path.includes("orders") || path.includes("deleted-bills")) return "Orders";
  if (path.includes("expenses") || path.includes("dealers"))   return "Financial Reports";
  if (path.includes("employees") || path.includes("attendance") || path.includes("employee-sessions")) return "Employees";
  if (path.includes("settings"))                               return "Settings";
  if (path.includes("raw-material-purchases") || path.includes("notifications")) return "Financial Reports";
  return "POS Billing";
}

function isCustomerAllowedPath(path: string, method: string): boolean {
  if (method === "GET" && (
    path.startsWith("/products") ||
    path.startsWith("/categories") ||
    path.startsWith("/product-variants") ||
    path.startsWith("/banners") ||
    path === "/orders" ||
    path === "/reviews" ||
    path === "/search" ||
    path === "/auth/me"
  )) return true;

  if (method === "POST" && (
    path === "/orders" ||
    path === "/reviews" ||
    path === "/auth/logout"
  )) return true;

  if (method === "PATCH" && path === "/auth/guest-profile") return true;

  return false;
}

// ─── Middleware ───────────────────────────────────────────────────────────────
export async function roleAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const cleanPath = req.path.replace(/^\/api/, "");

  // Always public — no token needed
  if (PUBLIC_PATHS.has(cleanPath) || PUBLIC_PATHS.has(req.path)) return next();
  if (req.path === "/auth/forbidden-alert" || cleanPath === "/auth/forbidden-alert") return next();
  if (req.method === "GET" && isPublicMobilePath(req.path)) return next();
  // Allow order creation from both mobile (no token) and authenticated employees (POS billing)
  if (req.method === "POST" && req.path === "/orders") return next();
  if (req.path === "/reviews" && req.method === "POST") return next();

  const token = extractSessionToken(req);
  const session = token ? await getSession(token) : null;

  if (!session) return res.status(401).json({ error: "Unauthorized: invalid or expired session." });

  (req as any).session = session;
  const { role } = session;

  if (role === "Admin") return next();

  if (role === "Customer") {
    if (isCustomerAllowedPath(req.path, req.method)) return next();
    return res.status(403).json({ error: "403 Forbidden: Customer session cannot access this module." });
  }

  // Allow employees to update their own profile (avatar/name) regardless of module permissions
  if (
    req.method === "PATCH" &&
    req.path === `/employees/${session.employeeId}`
  ) return next();



  const permissions: Record<string, Record<string, string>> = (db.settings as any)?.permissions?.[role] || {};
  const pathModule = deriveModule(req.path, req.method);
  const access = (permissions as any)[pathModule] ?? "Hidden";

  // Employees can always read their own deleted bills (server scopes by employeeId)
  if (req.method === "GET" && req.path === "/deleted-bills") return next();
  // Employees can always post to deleted-bills (void/abandoned carts)
  if (req.method === "POST" && req.path === "/deleted-bills") return next();
  // Employees can always delete their own bills (recorded in deleted_bills with their id)
  if (req.method === "DELETE" && req.path.match(/^\/orders\/[^/]+$/) && session.employeeId) return next();

  if (access === "Hidden") {
    broadcast({ type: "FORBIDDEN_ACCESS_ATTEMPT", payload: { path: req.path, role, timestamp: new Date().toISOString() } });
    return res.status(403).json({ error: "403 Forbidden: Module access is hidden." });
  }
  if (access === "Read-Only" && ["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    return res.status(403).json({ error: "403 Forbidden: Read-Only access cannot modify data." });
  }
  next();
}
