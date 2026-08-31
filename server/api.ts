import { roleAuthMiddleware, createSession, destroySession, checkRateLimit, resetRateLimit, getSession, buildSessionCookie, clearSessionCookie, extractSessionToken } from "./middleware.js";
import { Router } from "express";
import { db, supabase, dbSelect, dbInsert, dbUpdate, dbDelete } from "./db.js";
import { broadcast } from "./ws.js";
import bcrypt from "bcryptjs";
import { createHmac } from "crypto";

const router = Router();
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

if (process.env.NODE_ENV === "production") {
  const missing = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}/;

// Input sanitization helper
function sanitize(val: any): string {
  if (typeof val !== "string") return "";
  if (val.startsWith("data:")) return val;
  return val.replace(/[<>"'`;]/g, "").trim().slice(0, 500);
}

const DECIMAL_UNITS = new Set(["gm", "kg", "g", "gram", "grams", "ltr", "l", "liter", "litre"]);

function normalizeUnit(unit: any): string {
  return sanitize(unit || "pcs").toLowerCase() || "pcs";
}

function isDecimalQuantityUnit(unit: any): boolean {
  return DECIMAL_UNITS.has(normalizeUnit(unit));
}

function roundMoney(value: any): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(2));
}

function roundQuantity(value: any, unit: any): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return isDecimalQuantityUnit(unit) ? Number(amount.toFixed(3)) : Math.round(amount);
}

function isMobileVisibilityRequest(req: any): boolean {
  const mobile = String(req.query?.mobile ?? req.headers?.["x-mobile-client"] ?? "").toLowerCase();
  return mobile === "1" || mobile === "true" || mobile === "yes";
}

function isBcryptHash(value: unknown): value is string {
  return typeof value === "string" && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

type VariantPayload = {
  variant_id?: string;
  size_label: string;
  variant_price_modifier: number;
};

function normalizeVariantPayload(variants: any[], basePrice: number): VariantPayload[] {
  if (!Array.isArray(variants)) return [];
  return variants
    .map((variant, index) => {
      const sizeLabel = sanitize(variant?.size_label ?? variant?.sizeLabel ?? variant?.label ?? "");
      const rawPrice = Number(
        variant?.variant_price ??
        variant?.price ??
        variant?.final_price ??
        variant?.finalPrice
      );
      const rawModifier = Number(
        variant?.variant_price_modifier ??
        variant?.price_modifier ??
        variant?.modifier
      );
      const modifier = Number.isFinite(rawModifier) && rawModifier > 0
        ? rawModifier
        : (basePrice > 0 && Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice / basePrice : 0);

      return {
        variant_id: sanitize(variant?.variant_id || `VAR-${Date.now()}-${index + 1}`),
        size_label: sizeLabel,
        variant_price_modifier: modifier,
      };
    })
    .filter((variant) => variant.size_label && Number.isFinite(variant.variant_price_modifier) && variant.variant_price_modifier > 0);
}

async function getCustomerProfile(customerId: string) {
  if (!customerId) return null;
  if (supabase) {
    try {
      const { data } = await supabase.from("guest_customers").select("*").eq("id", customerId).maybeSingle();
      if (data) return data;
    } catch {}
  }
  return (db.guest_customers || []).find((customer: any) => customer.id === customerId) || null;
}

async function getEmployeeProfile(employeeId: string) {
  if (!employeeId) return null;
  const employees = await dbSelect("employees", db.employees);
  return employees.find((employee: any) => employee.id === employeeId) || null;
}

async function syncProductVariants(productId: string, variants: any[] | undefined, basePrice: number): Promise<void> {
  const normalized = normalizeVariantPayload(variants || [], basePrice);

  if (!db.product_variants) db.product_variants = [];
  db.product_variants = db.product_variants.filter((variant: any) => variant.product_id !== productId);

  if (normalized.length > 0) {
    const localRows = normalized.map((variant) => ({
      ...variant,
      product_id: productId,
    }));
    db.product_variants.push(...localRows);

    if (supabase) {
      try {
        await supabase.from("product_variants").delete().eq("product_id", productId);
        const { error } = await supabase.from("product_variants").insert(localRows);
        if (error) console.error("[product-variants] Supabase insert failed:", error.message);
      } catch (error: any) {
        console.error("[product-variants] Supabase sync failed:", error?.message || error);
      }
    }
    return;
  }

  if (supabase) {
    try {
      const { error } = await supabase.from("product_variants").delete().eq("product_id", productId);
      if (error) console.error("[product-variants] Supabase delete failed:", error.message);
    } catch (error: any) {
      console.error("[product-variants] Supabase delete failed:", error?.message || error);
    }
  }
}

// Guest login — mobile customers enter phone only, auto-registered as new customer
router.post("/auth/guest-login", roleAuthMiddleware, async (req, res) => {
  const phone = (req.body.phone ?? "").trim();
  if (!phone || !/^\d{10}$/.test(phone)) return res.status(400).json({ error: "Valid 10-digit phone required" });

  if (!db.guest_customers) db.guest_customers = [];

  let customer: any = null;
  let isNew = false;

  if (supabase) {
    // Always fetch from Supabase — source of truth for name + avatar
    const { data, error } = await supabase.from("guest_customers").select("*").eq("phone", phone).maybeSingle();
    if (error) console.error("[guest-login] Supabase lookup error:", error.message);

    if (data) {
      // Returning customer — sync to memory
      customer = data;
      const idx = db.guest_customers.findIndex((c: any) => c.id === data.id);
      if (idx >= 0) db.guest_customers[idx] = data; else db.guest_customers.push(data);
    } else {
      // New customer — insert into Supabase
      isNew = true;
      const newCust = { id: `CUST-${Date.now()}`, name: "Customer", phone, avatar: null, created_at: new Date().toISOString() };
      const { data: inserted, error: insertErr } = await supabase.from("guest_customers").insert(newCust).select().single();
      if (insertErr) {
        console.error("[guest-login] Insert failed:", insertErr.message);
        // Conflict: phone already exists — re-fetch
        const { data: refetched } = await supabase.from("guest_customers").select("*").eq("phone", phone).maybeSingle();
        customer = refetched || newCust;
        if (refetched) isNew = false;
      } else {
        customer = inserted || newCust;
      }
      const idx = db.guest_customers.findIndex((c: any) => c.id === customer.id);
      if (idx >= 0) db.guest_customers[idx] = customer; else db.guest_customers.push(customer);
    }
  } else {
    // No Supabase — use in-memory
    customer = db.guest_customers.find((c: any) => c.phone === phone) || null;
    if (!customer) {
      isNew = true;
      customer = { id: `CUST-${Date.now()}`, name: "Customer", phone, avatar: null, created_at: new Date().toISOString() };
      db.guest_customers.push(customer);
    }
  }

  const token = await createSession("Customer", customer.name, customer.id);
  res.setHeader("Set-Cookie", buildSessionCookie(token));
  res.json({ success: true, customer_id: customer.id, name: customer.name, avatar: customer.avatar || null, phone, is_new: isNew });
});

// Update guest customer name and/or avatar — persists across logins
router.patch("/auth/guest-profile", roleAuthMiddleware, async (req, res) => {
  const token = extractSessionToken(req);
  const session = token ? await getSession(token) : null;
  const { customer_id, name, avatar } = req.body;

  if (!session || session.role !== "Customer" || !session.employeeId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!customer_id || customer_id !== session.employeeId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!customer_id) return res.status(400).json({ error: "customer_id required" });
  if (!db.guest_customers) db.guest_customers = [];

  const patch: any = {};
  if (name !== undefined)   patch.name   = sanitize(name);
  if (avatar !== undefined) patch.avatar = avatar;
  if (Object.keys(patch).length === 0) return res.json({ success: true });

  // Update in-memory (if present)
  const mem = db.guest_customers.find((c: any) => c.id === customer_id);
  if (mem) Object.assign(mem, patch);

  // Always update Supabase — this is the source of truth
  if (supabase) {
    const { error } = await supabase.from("guest_customers").update(patch).eq("id", customer_id);
    if (error) {
      console.error("[guest-profile] Supabase update failed:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }
  res.json({ success: true });
});

router.post("/auth/forbidden-alert", (req, res) => {
  const { path, role } = req.body;
  broadcast({ type: "FORBIDDEN_ACCESS_ATTEMPT", payload: { path, role, timestamp: new Date().toISOString() } });
  res.json({ ok: true });
});

router.post("/auth/logout", roleAuthMiddleware, async (req, res) => {
  const token = extractSessionToken(req);
  if (token) {
    await destroySession(token);
    const logoutTime = new Date().toISOString();
    if (supabase) {
      try {
        await supabase
          .from("employee_sessions")
          .update({ logout_time: logoutTime })
          .eq("session_token", token)
          .is("logout_time", null);
      } catch {}
    }
    if (db.employee_sessions) {
      const s = db.employee_sessions.find((s: any) => s.session_token === token && !s.logout_time);
      if (s) s.logout_time = logoutTime;
    }
  }
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.json({ success: true });
});

// ─── Self-profile endpoint (any authenticated employee) ─────────────────────
router.get("/auth/me", roleAuthMiddleware, async (req: any, res) => {
  const token = extractSessionToken(req);
  if (!token) return res.status(401).json({ error: "No token" });
  const session = await getSession(token);
  if (!session) return res.status(401).json({ error: "Invalid session" });
  if (session.role === "Customer") {
    const customer = await getCustomerProfile(session.employeeId || "");
    if (!customer) {
      return res.status(404).json({ error: "Customer session no longer exists" });
    }
    return res.json({
      role: "Customer",
      name: customer.name || "Customer",
      avatar: customer.avatar || null,
      customer_id: customer.id,
      phone: customer.phone || "",
    });
  }

  if (session.role === "Admin") {
    return res.json({
      role: "Admin",
      name: db.settings?.adminName || session.name || "Super Admin",
      avatar: db.settings?.adminAvatar || null,
    });
  }

  const emp = await getEmployeeProfile(session.employeeId || "");
  if (!emp) {
    return res.json({
      role: session.role,
      name: session.name || "",
      avatar: null,
      employee_id: session.employeeId || "",
      permissions: db.settings?.permissions?.[session.role] || {},
    });
  }

  res.json({
    role: session.role,
    name: emp.name || emp.full_name || session.name || "",
    avatar: emp.avatar || null,
    employee_id: emp.id,
    permissions: db.settings?.permissions?.[session.role] || {},
  });
});

// ─── Apply auth middleware ────────────────────────────────────────────────────
router.use(roleAuthMiddleware);

// ─── Health ───────────────────────────────────────────────────────────────────
router.get("/health", (_req, res) => res.json({ status: "ok", supabase: !!supabase }));

router.post("/client-error", (req, res) => {
  const payload = req.body || {};
  const message = sanitize(payload.message || "Unknown client error");
  const route = sanitize(payload.route || "");
  const userAgent = sanitize(payload.userAgent || "");
  const stack = sanitize(payload.stack || "");
  const componentStack = sanitize(payload.componentStack || "");
  const timestamp = sanitize(payload.timestamp || new Date().toISOString());

  console.error("[client-error]", {
    message,
    route,
    userAgent,
    timestamp,
    stack: stack.slice(0, 2000),
    componentStack: componentStack.slice(0, 2000),
  });

  res.json({ ok: true });
});

// ─── Admin / Employee Auth ──────────────────────────────────────────────────
router.post("/auth/login", roleAuthMiddleware, async (req, res) => {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";

  const { allowed } = checkRateLimit(ip);
  if (!allowed) {
    return res.status(429).json({ error: "Too many failed attempts. Please try again later." });
  }

  const { username, password, role } = req.body;
  const u = (username ?? "").trim();
  const p = (password ?? "").trim();

  if (role === "Admin" && u === "admin") {
    if (!db.adminPasswordHash) {
      return res.status(401).json({ error: "Admin password not set. Please set it first." });
    }

    const isMatch = await bcrypt.compare(p, db.adminPasswordHash);
    if (isMatch) {
      resetRateLimit(ip);
      const token = await createSession("Admin", "Super Admin");
      res.setHeader("Set-Cookie", buildSessionCookie(token));
      return res.json({
        success: true,
        role: "Admin",
        name: db.settings?.adminName || "Super Admin",
        avatar: db.settings?.adminAvatar || null,
      });
    }
  }

  if (role === "Employee") {
    const employees = await dbSelect("employees", db.employees);
    const emp = employees.find((e: any) => e.login_id?.toLowerCase() === u.toLowerCase());
    const storedPassword = emp?.login_password ?? "";
    const passwordMatches = emp
      ? (isBcryptHash(storedPassword) ? await bcrypt.compare(p, storedPassword) : storedPassword === p)
      : false;
    if (emp && passwordMatches) {
      if (!isBcryptHash(storedPassword)) {
        const upgradedHash = await bcrypt.hash(p, 12);
        const localEmp = db.employees.find((e: any) => e.id === emp.id);
        if (localEmp) localEmp.login_password = upgradedHash;
        if (supabase) {
          await supabase.from("employees").update({ login_password: upgradedHash }).eq("id", emp.id);
        }
      }
      resetRateLimit(ip);
      const token = await createSession(emp.designation_tag, emp.name, emp.id);
      if (!db.employee_sessions) db.employee_sessions = [];
      const sess = {
        id: crypto.randomUUID(),
        employee_id: emp.id,
        login_time: new Date().toISOString(),
        logout_time: null,
        session_token: token,
      };
      await dbInsert("employee_sessions", sess, db.employee_sessions);
      res.setHeader("Set-Cookie", buildSessionCookie(token));
      return res.json({
        success: true,
        role: emp.designation_tag,
        name: emp.name,
        employee_id: emp.id,
        avatar: emp.avatar || null,
        permissions: db.settings?.permissions?.[emp.designation_tag] || {},
      });
    }
  }

  res.status(401).json({ error: "Invalid credentials" });
});

router.post("/auth/set-password", roleAuthMiddleware, async (req, res) => {
  if (db.adminPasswordHash) {
    return res.status(403).json({ error: "Password already set. Use change-password instead." });
  }

  const { new_pass } = req.body;
  if (!new_pass || !PASSWORD_REGEX.test(new_pass)) {
    return res.status(400).json({
      error: "Password must be 8+ chars with upper, lower, number and special character.",
    });
  }

  db.adminPasswordHash = await bcrypt.hash(new_pass, 12);
  if (supabase) {
    await supabase.from("settings").upsert({
      id: 1,
      value: { ...db.settings, adminPasswordHash: db.adminPasswordHash },
    });
  }

  res.json({ success: true });
});

// ─── Products ────────────────────────────────────────────────────────────────
router.get("/products", async (req, res) => {
  const products = await dbSelect("products", db.products);
  if (isMobileVisibilityRequest(req)) {
    return res.json(products.filter((p: any) => p.show_in_mobile !== false));
  }
  res.json(products);
});

router.get("/products/:id", async (req, res) => {
  const products = await dbSelect("products", db.products);
  const product = products.find((p: any) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Not found" });
  if (isMobileVisibilityRequest(req) && product.show_in_mobile === false) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json(product);
});

router.post("/products", async (req, res) => {
  const session = (req as any).session;
  const { name, category, price, sku, unit, current_stock_qty, unit_purchase_cost, safety_low_threshold, image, description, variants } = req.body;
  if (!name || !category) return res.status(400).json({ error: "name and category are required" });
  const normalizedUnit = normalizeUnit(unit || "pcs");
  const newProduct = {
    id: `PRD-${Date.now()}`,
    name: sanitize(name),
    category: sanitize(category),
    price: roundMoney(price),
    sku: sanitize(sku || ""),
    unit: normalizedUnit,
    image: sanitize(image || ""),
    description: sanitize(description || ""),
    unit_purchase_cost: roundMoney(unit_purchase_cost),
    safety_low_threshold: roundQuantity(safety_low_threshold, normalizedUnit) || 5,
    current_stock_qty: roundQuantity(current_stock_qty, normalizedUnit),
    show_in_mobile: req.body.show_in_mobile !== undefined ? Boolean(req.body.show_in_mobile) : true,
  };
  const saved = await dbInsert("products", newProduct, db.products);
  await dbInsert("inventory_log", {
    id: crypto.randomUUID(),
    type: "STOCK_IN",
    product_id: saved.id,
    product_name: saved.name,
    qty: saved.current_stock_qty,
    reason: "Initial Stock",
    operator: session?.name || "Admin",
    timestamp: new Date().toISOString(),
  }, db.inventory_log);
  await syncProductVariants(saved.id, normalizedUnit === "pcs" ? [] : variants, Number(saved.price) || Number(newProduct.price) || 0);
  res.json(saved);
});

router.delete("/products/:id", async (req, res) => {
  await dbDelete("products", req.params.id);
  const idx = db.products.findIndex((p: any) => p.id === req.params.id);
  if (idx !== -1) db.products.splice(idx, 1);
  await syncProductVariants(req.params.id, [], 0);
  res.json({ success: true });
});

router.patch("/products/:id", async (req, res) => {
  const existing = db.products.find((p: any) => p.id === req.params.id);
  const effectiveUnit = normalizeUnit(req.body.unit ?? existing?.unit ?? "pcs");
  const patch = {
    ...req.body,
    ...(req.body.price !== undefined ? { price: roundMoney(req.body.price) } : {}),
    ...(req.body.unit_purchase_cost !== undefined ? { unit_purchase_cost: roundMoney(req.body.unit_purchase_cost) } : {}),
    ...(req.body.current_stock_qty !== undefined ? { current_stock_qty: roundQuantity(req.body.current_stock_qty, effectiveUnit) } : {}),
    ...(req.body.safety_low_threshold !== undefined ? { safety_low_threshold: roundQuantity(req.body.safety_low_threshold, effectiveUnit) } : {}),
    ...(req.body.unit !== undefined ? { unit: effectiveUnit } : {}),
    ...(req.body.show_in_mobile !== undefined ? { show_in_mobile: Boolean(req.body.show_in_mobile) } : {}),
  };
  const updated = await dbUpdate("products", req.params.id, patch);
  const local = db.products.find((p: any) => p.id === req.params.id);
  if (local) Object.assign(local, patch);
  if (Object.prototype.hasOwnProperty.call(req.body, "variants") || Object.prototype.hasOwnProperty.call(req.body, "unit")) {
    await syncProductVariants(
      req.params.id,
      effectiveUnit === "pcs" ? [] : req.body.variants,
      Number(req.body.price ?? updated?.price ?? local?.price ?? 0)
    );
  }
  res.json(updated);
});

// ─── Stock adjustments ───────────────────────────────────────────────────────
router.post("/products/:id/stock", async (req, res) => {
  const session = (req as any).session;
  const products = await dbSelect("products", db.products);
  const product = products.find((p: any) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Not found" });

  const { type, qty, reason } = req.body;
  const amount = roundQuantity(qty, product.unit);
  const nextQty = roundQuantity(product.current_stock_qty + (type === "in" ? amount : -amount), product.unit);

  if (type === "out" && nextQty < 0)
    return res.status(400).json({ error: "Stock cannot go below zero" });

  const newQty = Math.max(0, nextQty);
  await dbUpdate("products", product.id, { current_stock_qty: newQty });

  const local = db.products.find((p: any) => p.id === product.id);
  if (local) local.current_stock_qty = newQty;

  await dbInsert("inventory_log", {
    id: crypto.randomUUID(),
    type: type === "in" ? "STOCK_IN" : "STOCK_OUT",
    product_id: product.id,
    product_name: product.name,
    qty: amount,
    reason: reason || "",
    operator: session?.name || "Admin",
    timestamp: new Date().toISOString(),
  }, db.inventory_log);

  broadcast({ type: "STOCK_UPDATED", payload: { product_id: product.id } });
  if (newQty === 0) {
    const prod = db.products.find((p: any) => p.id === product.id);
    if (!prod?.muted) broadcast({ type: "INVENTORY_DEPLETED", payload: { product_id: product.id, product_name: product.name, sku_code: product.sku, remaining_qty: 0 } });
  } else if (newQty > 0 && newQty <= product.safety_low_threshold) {
    const prod = db.products.find((p: any) => p.id === product.id);
    if (!prod?.muted) broadcast({ type: "LOW_STOCK_ALERT", payload: { product_id: product.id, product_name: product.name, sku_code: product.sku, remaining_qty: newQty } });
  }

  res.json({ ...product, current_stock_qty: newQty });
});

// ─── Inventory log ───────────────────────────────────────────────────────────
router.get("/inventory-log", async (_req, res) => {
  res.json(await dbSelect("inventory_log", db.inventory_log));
});

function hasRazorpayConfig(): boolean {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return false;
  if (process.env.NODE_ENV === "production" && RAZORPAY_KEY_ID.startsWith("rzp_test_")) return false;
  return true;
}

async function readRazorpayError(response: Response): Promise<{ message: string; raw: string; data: any }> {
  const raw = await response.text();
  try {
    const data = raw ? JSON.parse(raw) : null;
    return {
      message: data?.error?.description || data?.error?.message || data?.message || `Razorpay request failed with status ${response.status}`,
      raw,
      data,
    };
  } catch {
    return {
      message: raw || `Razorpay request failed with status ${response.status}`,
      raw,
      data: null,
    };
  }
}

function findOrderProduct(products: any[], item: any) {
  const productId = String(item?.product_id || item?.productId || item?.id || "").trim();
  if (productId) {
    const byId = products.find((p: any) => String(p.id || "").trim() === productId);
    if (byId) return byId;
  }

  const targetName = String(item?.name || "").trim().toLowerCase();
  if (!targetName) return null;

  const targetUnit = String(item?.unit || "").trim().toLowerCase();
  const nameMatches = products.filter((p: any) => String(p.name || "").trim().toLowerCase() === targetName);

  if (targetUnit) {
    const unitMatch = nameMatches.find((p: any) => String(p.unit || "").trim().toLowerCase() === targetUnit);
    if (unitMatch) return unitMatch;
  }

  if (nameMatches.length === 1) return nameMatches[0];
  return null;
}

async function validateOrderStock(items: any[], isVoid: boolean): Promise<{ products: any[]; insufficientItems: string[] }> {
  const products = await dbSelect("products", db.products);
  const insufficientItems: string[] = [];

  for (const item of (isVoid ? [] : items || [])) {
    const product = findOrderProduct(products, item);
    const qty = roundQuantity(item.qty, product?.unit);
    if (!qty || qty <= 0) continue;
    if (!product) continue;
    if (product.current_stock_qty < qty) {
      insufficientItems.push(`${product.name} (available: ${product.current_stock_qty}, requested: ${qty})`);
    }
  }

  return { products, insufficientItems };
}

function getVariantForItem(productVariants: any[], item: any) {
  const target = String(item?.size || item?.size_label || "").trim().toLowerCase();
  if (!target) return null;
  return productVariants.find((variant: any) => String(variant.size_label || "").trim().toLowerCase() === target) || null;
}

function estimateStoredItemTotal(item: any): number {
  const qty = Number(item?.qty || 0);
  if (!Number.isFinite(qty) || qty <= 0) return 0;

  const rawLineTotal = Number(item?.line_total ?? item?.total ?? item?.amount);
  if (Number.isFinite(rawLineTotal) && rawLineTotal > 0) {
    return Number(rawLineTotal.toFixed(2));
  }

  const unitPrice = Number(item?.price);
  if (Number.isFinite(unitPrice) && unitPrice > 0) {
    return Number((unitPrice * qty).toFixed(2));
  }

  return 0;
}

function computeTrustedItemTotal(product: any, item: any, productVariants: any[] = []): number {
  const qty = roundQuantity(item?.qty || 0, product?.unit || item?.unit);
  if (!qty || qty <= 0) return 0;

  const storedLineTotal = estimateStoredItemTotal(item);
  if (storedLineTotal > 0) return storedLineTotal;

  const variant = getVariantForItem(productVariants, item);
  const variantMultiplier = Number(variant?.variant_price_modifier || 1) || 1;
  const basePrice = Number(product?.price || 0);
  const unitPrice = basePrice * variantMultiplier;

  // Fallback only when the stored bill item does not contain a usable price.
  return Number((unitPrice * qty).toFixed(2));
}

async function computeTrustedOrderTotal(items: any[]): Promise<{ total: number; products: any[]; productVariants: any[] }> {
  const products = await dbSelect("products", db.products);
  const productVariants = await dbSelect("product_variants", db.product_variants || []);
  let total = 0;

  for (const item of items || []) {
    const product = findOrderProduct(products, item);
    if (!product) continue;
    const matchingVariants = productVariants.filter((v: any) => v.product_id === product.id);
    total += computeTrustedItemTotal(product, item, matchingVariants);
  }

  return { total: Number(total.toFixed(2)), products, productVariants };
}

function estimateStoredBillTotal(items: any[]): number {
  return Number((items || []).reduce((sum, item) => sum + estimateStoredItemTotal(item), 0).toFixed(2));
}

function normalizeBillGrandTotal(order: any): number {
  const stored = Number(order?.grand_total || 0);
  if (Number.isFinite(stored) && stored > 0) return Number(stored.toFixed(2));
  return estimateStoredBillTotal(order?.items || []);
}

type BalanceType = "cash" | "account";

function resolveBalanceType(paymentMethod?: any, paymentMode?: any): BalanceType | null {
  const raw = String(paymentMethod || paymentMode || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("cash")) return "cash";
  if (["upi", "card", "online", "razorpay", "bank", "wallet"].some(token => raw.includes(token))) return "account";
  return null;
}

async function adjustSettingsBalance(type: BalanceType, delta: number): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) return;

  const nextSettings = { ...db.settings };
  if (type === "cash") {
    nextSettings.cashBalance = Number(nextSettings.cashBalance || 0) + delta;
  } else {
    nextSettings.accountBalance = Number(nextSettings.accountBalance || 0) + delta;
  }

  db.settings = nextSettings;
  if (supabase) {
    await supabase.from("settings").upsert({ id: 1, value: db.settings });
  }
}

async function applyOrderBalanceEffect(order: any, direction: 1 | -1): Promise<void> {
  const balanceType = resolveBalanceType(order?.payment_method, order?.payment_mode);
  const amount = Number(order?.grand_total || 0);
  if (!balanceType || !Number.isFinite(amount) || amount <= 0) return;
  await adjustSettingsBalance(balanceType, direction * amount);
}

async function restoreOrderStock(items: any[], products: any[], session: any, orderId: string): Promise<void> {
  for (const item of items || []) {
    const product = findOrderProduct(products, item);
    if (!product) continue;

    const qty = roundQuantity(item.qty, product.unit);
    if (!qty || qty <= 0) continue;

    let newQty: number;

    if (supabase) {
      const { data, error } = await supabase.from("products").select("current_stock_qty").eq("id", product.id).single();
      if (error) {
        console.error("[orders] Failed to read product stock before restore:", error.message);
        continue;
      }
      const currentQty = Number(data?.current_stock_qty ?? product.current_stock_qty);
      newQty = roundQuantity(currentQty + qty, product.unit);
      const { error: updateError } = await supabase.from("products").update({ current_stock_qty: newQty }).eq("id", product.id);
      if (updateError) {
        console.error("[orders] Failed to restore product stock in Supabase:", updateError.message);
        continue;
      }
    } else {
      newQty = roundQuantity(Number(product.current_stock_qty) + qty, product.unit);
      await dbUpdate("products", product.id, { current_stock_qty: newQty });
    }

    const local = db.products.find((p: any) => p.id === product.id);
    if (local) local.current_stock_qty = newQty;

    await dbInsert("inventory_log", {
      id: crypto.randomUUID(),
      type: "STOCK_IN",
      product_id: product.id,
      product_name: product.name,
      qty,
      reason: `Deleted bill ${orderId}`,
      operator: session?.name || "System",
      timestamp: new Date().toISOString(),
    }, db.inventory_log);

    broadcast({ type: "STOCK_UPDATED", payload: { product_id: product.id } });
  }
}

function clampMoney(value: any): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Number(amount.toFixed(2));
}

async function computeTrustedOrderFinancials(reqBody: any): Promise<{
  subtotal: number;
  discountApplied: number;
  taxCollected: number;
  extraneousCharges: number;
  grandTotal: number;
}> {
  const items = Array.isArray(reqBody?.items) ? reqBody.items : [];
  const { total: subtotal } = await computeTrustedOrderTotal(items);
  const discountApplied = Math.min(clampMoney(reqBody?.discount_applied), subtotal);
  const extraneousCharges = clampMoney(reqBody?.extraneous_charges);
  const grandTotal = Number(Math.max(0, subtotal - discountApplied + extraneousCharges).toFixed(2));
  const taxCollected = clampMoney(reqBody?.tax_collected);

  return {
    subtotal,
    discountApplied,
    taxCollected,
    extraneousCharges,
    grandTotal,
  };
}

async function persistOrder(reqBody: any, session?: any) {
  const isVoid = reqBody.order_status === "Void";
  const { products, insufficientItems } = await validateOrderStock(reqBody.items || [], isVoid);

  if (insufficientItems.length > 0) {
    const error: any = new Error("Insufficient stock");
    error.status = 400;
    error.items = insufficientItems;
    throw error;
  }

  const ts = Date.now();
  const paymentMethod = reqBody.payment_method || reqBody.payment_mode || null;
  const paymentMode = reqBody.payment_mode || reqBody.payment_method || null;
  const financials = await computeTrustedOrderFinancials(reqBody);
  const newOrder = {
    id: `INV-${new Date().getFullYear()}-${ts.toString().slice(-6)}`,
    order_source: reqBody.order_source || null,
    order_status: reqBody.order_status || "Paid",
    payment_mode: paymentMode,
    payment_method: paymentMethod,
    items: reqBody.items || [],
    grand_total: financials.grandTotal,
    discount_applied: financials.discountApplied,
    tax_collected: financials.taxCollected,
    extraneous_charges: financials.extraneousCharges,
    other_charges_desc: reqBody.other_charges_desc || null,
    created_by: reqBody.created_by || null,
    customer_id: reqBody.customer_id || null,
    customer_phone: reqBody.customer_phone || null,
    table_id: reqBody.table_id || null,
    payment_reference: reqBody.payment_reference || null,
    gateway_order_id: reqBody.gateway_order_id || null,
    gateway_signature: reqBody.gateway_signature || null,
    timestamp: new Date().toISOString(),
  };
  const saved = await dbInsert("orders", newOrder, db.orders);

  for (const item of (isVoid ? [] : (saved.items || []))) {
    const qty = roundQuantity(item.qty, findOrderProduct(products, item)?.unit);
    if (!qty || qty <= 0) continue;

    const product = findOrderProduct(products, item);
    if (!product) continue;

    let newQty: number;

    if (supabase) {
      const { data, error } = await supabase.rpc("decrement_stock", {
        p_id: product.id,
        p_qty: qty,
      });
      if (error) {
        const fresh = await supabase.from("products").select("current_stock_qty").eq("id", product.id).single();
        const currentQty = Number(fresh.data?.current_stock_qty ?? product.current_stock_qty);
        newQty = roundQuantity(Math.max(0, currentQty - qty), product.unit);
        await supabase.from("products").update({ current_stock_qty: newQty }).eq("id", product.id);
      } else {
        newQty = roundQuantity(Number(data) ?? Math.max(0, product.current_stock_qty - qty), product.unit);
      }
    } else {
      newQty = roundQuantity(Math.max(0, Number(product.current_stock_qty) - qty), product.unit);
      await dbUpdate("products", product.id, { current_stock_qty: newQty });
    }

    const local = db.products.find((p: any) => p.id === product.id);
    if (local) local.current_stock_qty = newQty;

    await dbInsert("inventory_log", {
      id: crypto.randomUUID(),
      type: "STOCK_OUT",
      product_id: product.id,
      product_name: product.name,
      qty,
      reason: `Order ${saved.id}`,
      operator: session?.name || "Customer",
      timestamp: new Date().toISOString(),
    }, db.inventory_log);

    broadcast({ type: "STOCK_UPDATED", payload: { product_id: product.id } });
    if (newQty === 0) {
      if (!local?.muted) broadcast({ type: "INVENTORY_DEPLETED", payload: { product_id: product.id, product_name: product.name, sku_code: product.sku, remaining_qty: 0 } });
    } else if (newQty <= product.safety_low_threshold) {
      if (!local?.muted) broadcast({ type: "LOW_STOCK_ALERT", payload: { product_id: product.id, product_name: product.name, sku_code: product.sku, remaining_qty: newQty } });
    }
  }

  if (saved.order_status === "Paid") {
    try {
      await applyOrderBalanceEffect(saved, 1);
    } catch (error: any) {
      console.error("[orders] Failed to apply sale balance effect:", error?.message || error);
    }
  }

  if (saved.order_source !== "Direct POS") {
    broadcast({ type: "INBOUND_QR_ORDER", payload: { order_id: saved.id, table_number: saved.table_id || "Delivery", bill_amount: saved.grand_total } });
  }

  return saved;
}

// ─── Orders ──────────────────────────────────────────────────────────────────
router.get("/orders", async (req, res) => {
  const all = await dbSelect("orders", db.orders);
  const sorted = all
    .map((order: any) => ({ ...order, grand_total: normalizeBillGrandTotal(order) }))
    .sort((a: any, b: any) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime());
  const customer_id = String(req.query.customer_id || "");
  const customer_phone = String(req.query.customer_phone || "");
  const session = (req as any).session;

  if (session?.role === "Customer") {
    const ownCustomerId = String(session.employeeId || "");
    const filtered = sorted.filter((o: any) => {
      if (ownCustomerId && o.customer_id === ownCustomerId) return true;
      if (customer_phone && o.customer_phone === customer_phone && (!customer_id || customer_id === ownCustomerId)) return true;
      return false;
    });
    return res.json(filtered);
  }

  const filtered = sorted.filter((o: any) => {
    if (customer_id && o.customer_id === customer_id) return true;
    if (customer_phone && o.customer_phone === customer_phone) return true;
    return false;
  });
  res.json(customer_id || customer_phone ? filtered : sorted);
});

router.post("/orders", async (req, res) => {
  const session = (req as any).session;
  try {
    const saved = await persistOrder(req.body, session);
    return res.json(saved);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      error: error.message || "Failed to place order.",
      ...(error.items ? { items: error.items } : {}),
    });
  }
});

router.post("/payments/razorpay/order", async (req, res) => {
  if (!hasRazorpayConfig()) {
    return res.status(500).json({ error: "Razorpay is not configured on the server." });
  }

  const draftOrder = req.body || {};
  const items = Array.isArray(draftOrder.items) ? draftOrder.items : [];
  if (items.length === 0) {
    return res.status(400).json({ error: "At least one item is required." });
  }

  const financials = await computeTrustedOrderFinancials(draftOrder);
  if (!financials.grandTotal || financials.grandTotal <= 0) {
    return res.status(400).json({ error: "A valid order total is required." });
  }

  const isVoid = draftOrder.order_status === "Void";
  const { insufficientItems } = await validateOrderStock(items, isVoid);
  if (insufficientItems.length > 0) {
    return res.status(400).json({ error: "Insufficient stock", items: insufficientItems });
  }

  const receipt = `qr_${Date.now()}`;
  const amount = Math.round(financials.grandTotal * 100);
  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

  try {
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt,
        payment_capture: 1,
        notes: {
          table_id: draftOrder.table_id || "Counter",
          customer_id: draftOrder.customer_id || "",
          order_source: draftOrder.order_source || "QR Table Menu",
        },
      }),
    });

    const data = response.ok ? await response.json() : await readRazorpayError(response);
    if (!response.ok) {
      console.error("Razorpay order creation failed", {
        status: response.status,
        message: data.message,
        raw: data.raw,
      });
      return res.status(502).json({ error: data.message || "Failed to create Razorpay order." });
    }

    res.json({
      keyId: RAZORPAY_KEY_ID,
      razorpayOrderId: data.id,
      amount: data.amount,
      currency: data.currency,
      name: "Shri Badrinarayan Papriwale",
      description: "Mobile Menu Order",
    });
  } catch {
    console.error("Razorpay order creation threw unexpectedly");
    res.status(502).json({ error: "Unable to reach Razorpay right now. Please try again." });
  }
});

router.post("/payments/razorpay/verify", async (req, res) => {
  if (!hasRazorpayConfig()) {
    return res.status(500).json({ error: "Razorpay is not configured on the server." });
  }

  const session = (req as any).session;
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    orderData,
  } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderData) {
    return res.status(400).json({ error: "Missing Razorpay verification details." });
  }

  const expectedSignature = createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: "Razorpay signature verification failed." });
  }

  const items = Array.isArray(orderData?.items) ? orderData.items : [];
  const financials = await computeTrustedOrderFinancials(orderData);
  if (!items.length || !financials.grandTotal || financials.grandTotal <= 0) {
    return res.status(400).json({ error: "Unable to calculate trusted order total." });
  }
  const allOrders = await dbSelect("orders", db.orders);
  const existingOrder = allOrders.find((o: any) => o.payment_reference === razorpay_payment_id);
  if (existingOrder) return res.json(existingOrder);

  try {
    const saved = await persistOrder({
      ...orderData,
      grand_total: financials.grandTotal,
      discount_applied: financials.discountApplied,
      tax_collected: financials.taxCollected,
      extraneous_charges: financials.extraneousCharges,
      order_status: "Paid",
      payment_method: "razorpay",
      payment_mode: "Razorpay",
      payment_reference: razorpay_payment_id,
      gateway_order_id: razorpay_order_id,
      gateway_signature: razorpay_signature,
    }, session);
    res.json(saved);
  } catch (error: any) {
    console.error("Razorpay verification failed", {
      message: error?.message,
      status: error?.status,
      items: error?.items,
    });
    res.status(error.status || 500).json({
      error: error.message || "Failed to finalize Razorpay order.",
      ...(error.items ? { items: error.items } : {}),
    });
  }
});

router.patch("/orders/:id", async (req, res) => {
  const orders = await dbSelect("orders", db.orders);
  const order = orders.find((o: any) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Not found" });

  await dbUpdate("orders", req.params.id, req.body);
  const local = db.orders.find((o: any) => o.id === req.params.id);
  if (local) Object.assign(local, req.body);

  broadcast({ type: "TABLE_STATE_CHANGE", payload: { table_id: order.table_id, new_status_flag: req.body.order_status } });
  res.json({ ...order, ...req.body });
});

router.delete("/orders/:id", async (req, res) => {
  const session = (req as any).session;
  const orders = await dbSelect("orders", db.orders);
  const products = await dbSelect("products", db.products);
  let order = orders.find((o: any) => o.id === req.params.id);
  // Fallback: fetch directly from Supabase in case in-memory is stale
  if (!order && supabase) {
    const { data } = await supabase.from("orders").select("*").eq("id", req.params.id).maybeSingle();
    if (data) order = data;
  }
  if (!order) return res.status(404).json({ error: "Not found" });

  if (!db.deleted_bills) db.deleted_bills = [];
  const deletedRow = {
    id: order.id,
    order_source: order.order_source || null,
    order_status: order.order_status || null,
    payment_mode: order.payment_mode || null,
    items: order.items || null,
    grand_total: normalizeBillGrandTotal(order),
    discount_applied: order.discount_applied || 0,
    tax_collected: order.tax_collected || 0,
    extraneous_charges: order.extraneous_charges || 0,
    other_charges_desc: order.other_charges_desc || null,
    created_by: order.created_by || null,
    timestamp: order.timestamp || null,
    deleted_by: session?.name || "Unknown",
    deleted_by_id: session?.employeeId || null,
    deleted_at: new Date().toISOString(),
  };
  const insertResult = await dbInsert("deleted_bills", deletedRow, db.deleted_bills);

  await restoreOrderStock(order.items || [], products, session, order.id);
  if (String(order.order_status || "").toLowerCase() === "paid") {
    try {
      await applyOrderBalanceEffect(order, -1);
    } catch (error: any) {
      console.error("[orders] Failed to reverse sale balance effect:", error?.message || error);
    }
  }
  await dbDelete("orders", req.params.id);
  const idx = db.orders.findIndex((o: any) => o.id === req.params.id);
  if (idx !== -1) db.orders.splice(idx, 1);
  res.json({ success: true });
});

// ─── Deleted Bills ────────────────────────────────────────────────────────────
router.post("/deleted-bills", async (req: any, res) => {
  if (!db.deleted_bills) db.deleted_bills = [];
  const session = req.session;
  const { items, other_charges_desc, payment_mode, created_by } = req.body;
  const financials = await computeTrustedOrderFinancials(req.body);
  const row = {
    id: `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
    order_source: "Direct POS",
    order_status: "Void",
    payment_mode: payment_mode || null,
    items: items || [],
    grand_total: financials.grandTotal,
    discount_applied: financials.discountApplied,
    tax_collected: financials.taxCollected,
    extraneous_charges: financials.extraneousCharges,
    other_charges_desc: other_charges_desc || null,
    created_by: created_by || null,
    timestamp: new Date().toISOString(),
    deleted_by: session?.name || created_by || "Unknown",
    deleted_by_id: session?.employeeId || null,
    deleted_at: new Date().toISOString(),
  };
  const saved = await dbInsert("deleted_bills", row, db.deleted_bills);
  res.json(saved);
});

router.get("/deleted-bills", async (req: any, res) => {
  if (!db.deleted_bills) db.deleted_bills = [];
  const all = await dbSelect("deleted_bills", db.deleted_bills);
  const sorted = all
    .map((bill: any) => ({ ...bill, grand_total: normalizeBillGrandTotal(bill) }))
    .sort((a: any, b: any) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
  const session = req.session;
  // Employees only see their own deleted bills; Admin sees all
  if (session?.employeeId) {
    return res.json(sorted.filter((b: any) => b.deleted_by_id === session.employeeId));
  }
  res.json(sorted);
});

// ─── Void (soft-delete) an order ─────────────────────────────────────────────
router.patch("/orders/:id/void", async (req, res) => {
  const session = (req as any).session;
  const orders = await dbSelect("orders", db.orders);
  const order = orders.find((o: any) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Not found" });
  if (String(order.order_status || "").toLowerCase() === "paid") {
    try {
      await applyOrderBalanceEffect(order, -1);
    } catch (error: any) {
      console.error("[orders] Failed to reverse balance on void:", error?.message || error);
    }
  }
  const patch = { order_status: "Void", voided_by: session?.name || "Unknown", voided_at: new Date().toISOString() };
  await dbUpdate("orders", req.params.id, patch);
  const local = db.orders.find((o: any) => o.id === req.params.id);
  if (local) Object.assign(local, patch);
  res.json({ success: true });
});

// ─── Omni-Search ─────────────────────────────────────────────────────────────
router.get("/search", async (req, res) => {
  const query = req.query.q?.toString().toLowerCase() || "";
  if (query.length < 2) return res.json({ products: [], dealers: [], employees: [] });
  const mobileOnly = isMobileVisibilityRequest(req);

  const [products, dealers, employees] = await Promise.all([
    dbSelect("products", db.products),
    dbSelect("dealers", db.dealers),
    dbSelect("employees", db.employees),
  ]);

  res.json({
    products:  products.filter((p: any) => (mobileOnly ? p.show_in_mobile !== false : true) && (p.name?.toLowerCase().includes(query) || p.sku?.toLowerCase().includes(query) || p.id?.toLowerCase().includes(query))),
    dealers:   dealers.filter((d: any) => d.name?.toLowerCase().includes(query) || d.gstin?.toLowerCase().includes(query)),
    employees: employees.filter((e: any) => e.name?.toLowerCase().includes(query) || e.full_name?.toLowerCase().includes(query) || e.id?.toLowerCase().includes(query)),
  });
});

// ─── Dealers ─────────────────────────────────────────────────────────────────
router.get("/dealers", async (_req, res) => {
  res.json(await dbSelect("dealers", db.dealers));
});

router.post("/dealers", async (req, res) => {
  const { name, address, gstin, phone } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "name and phone are required" });
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) return res.status(400).json({ error: "Invalid GSTIN format" });
  res.json(await dbInsert("dealers", {
    id: crypto.randomUUID(),
    name: sanitize(name),
    address: sanitize(address || ""),
    gstin: sanitize(gstin),
    phone: sanitize(phone),
  }, db.dealers));
});

router.delete("/dealers/:id", async (req, res) => {
  await dbDelete("dealers", req.params.id);
  const idx = db.dealers.findIndex((d: any) => d.id === req.params.id);
  if (idx !== -1) db.dealers.splice(idx, 1);
  res.json({ success: true });
});

router.post("/dealers/:id/invoice-due", async (req, res) => {
  const dealers = await dbSelect("dealers", db.dealers);
  const dealer = dealers.find((d: any) => d.id === req.params.id);
  if (!dealer) return res.status(404).json({ error: "Not found" });

  const { amount_due, expiry_date } = req.body;
  broadcast({ type: "DEALER_INVOICE_DUE", payload: { dealer_id: dealer.id, dealer_name: dealer.name, amount_due, expiry_date } });
  res.json({ ok: true });
});

// ─── Expenses ────────────────────────────────────────────────────────────────
router.get("/expenses", async (_req, res) => {
  res.json(await dbSelect("expenses", db.expenses));
});

router.post("/expenses", async (req, res) => {
  const { expense_code, amount, dealer_id, description } = req.body;
  const validCodes = ["EXP_RAW_MATERIAL", "EXP_SALARY_DRAW", "EXP_MISC_OPERATIONAL"];
  if (!expense_code || !validCodes.includes(expense_code)) return res.status(400).json({ error: "Invalid expense_code" });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Valid amount required" });
  res.json(await dbInsert("expenses", {
    id: crypto.randomUUID(),
    expense_code,
    amount: Number(amount),
    dealer_id: dealer_id || null,
    description: sanitize(description || ""),
    expense_date: new Date().toISOString(),
  }, db.expenses));
});

router.patch("/expenses/:id", async (req, res) => {
  const all = await dbSelect("expenses", db.expenses);
  if (!all.find((e: any) => e.id === req.params.id)) return res.status(404).json({ error: "Not found" });
  const patch: any = {};
  if (req.body.amount !== undefined)      patch.amount      = Number(req.body.amount);
  if (req.body.description !== undefined) patch.description = sanitize(req.body.description);
  if (req.body.dealer_id !== undefined)   patch.dealer_id   = req.body.dealer_id || null;
  if (req.body.expense_code !== undefined) patch.expense_code = req.body.expense_code;
  const updated = await dbUpdate("expenses", req.params.id, patch);
  const local = db.expenses.find((e: any) => e.id === req.params.id);
  if (local) Object.assign(local, patch);
  res.json(updated);
});

router.delete("/expenses/:id", async (req, res) => {
  await dbDelete("expenses", req.params.id);
  const idx = db.expenses.findIndex((e: any) => e.id === req.params.id);
  if (idx !== -1) db.expenses.splice(idx, 1);
  res.json({ success: true });
});

// ─── Employees ───────────────────────────────────────────────────────────────
router.get("/employees", async (_req, res) => {
  res.json(await dbSelect("employees", db.employees));
});

router.post("/employees", async (req, res) => {
  const { full_name, name, designation_tag, phone_number, salary_type_flag, base_compensation_rate, joining_date, last_working_date, avatar } = req.body;
  if (!designation_tag || !joining_date) return res.status(400).json({ error: "designation_tag and joining_date are required" });
  if (phone_number && !/^\d{10}$/.test(phone_number)) return res.status(400).json({ error: "Phone must be 10 digits" });

  // Auto-generate login_id and login_password
  const existingEmps = await dbSelect("employees", db.employees);
  const empNumber = String(existingEmps.length + 1).padStart(3, "0");
  const login_id = `EMP${empNumber}`;
  const rawName = (name || full_name || "").trim();
  const firstName = rawName.split(" ")[0] || "Emp";
  const generatedPassword = `${firstName}@${empNumber}`;
  const login_password = await bcrypt.hash(generatedPassword, 12);

  const saved = await dbInsert("employees", {
    id: `EMP-${Date.now()}`,
    name: rawName,
    full_name: rawName,
    designation_tag: sanitize(designation_tag),
    phone_number: phone_number || null,
    salary_type_flag: ["Monthly", "Daily"].includes(salary_type_flag) ? salary_type_flag : "Monthly",
    base_compensation_rate: Number(base_compensation_rate) || 0,
    joining_date,
    last_working_date: last_working_date || null,
    avatar: avatar || null,
    login_id,
    login_password,
  }, db.employees);
  res.json({ ...saved, login_id, login_password: generatedPassword });
});

router.delete("/employees/:id", async (req, res) => {
  await dbDelete("employees", req.params.id);
  const idx = db.employees.findIndex((e: any) => e.id === req.params.id);
  if (idx !== -1) db.employees.splice(idx, 1);
  res.json({ success: true });
});

router.patch("/employees/:id", async (req, res) => {
  const { name, full_name, avatar, login_id, login_password, designation_tag, phone_number, salary_type_flag, base_compensation_rate, joining_date, last_working_date } = req.body;
  const patch: Record<string, any> = {};
  if (name !== undefined)                    patch.name                   = name;
  if (full_name !== undefined)               patch.full_name              = full_name;
  if (avatar !== undefined)                  patch.avatar                 = avatar;
  if (login_id !== undefined)                patch.login_id               = login_id.trim();
  if (login_password !== undefined) {
    const nextPassword = login_password.trim();
    patch.login_password = isBcryptHash(nextPassword) ? nextPassword : await bcrypt.hash(nextPassword, 12);
  }
  if (designation_tag !== undefined)         patch.designation_tag        = sanitize(designation_tag);
  if (phone_number !== undefined)            patch.phone_number           = phone_number || null;
  if (salary_type_flag !== undefined)        patch.salary_type_flag       = salary_type_flag;
  if (base_compensation_rate !== undefined)  patch.base_compensation_rate = Number(base_compensation_rate);
  if (joining_date !== undefined)            patch.joining_date           = joining_date;
  if (last_working_date !== undefined)       patch.last_working_date      = last_working_date || null;

  const local = db.employees.find((e: any) => e.id === req.params.id);
  if (local) Object.assign(local, patch);
  if (supabase) {
    const { data, error } = await supabase.from("employees").update(patch).eq("id", req.params.id).select();
    if (error) { return res.status(500).json({ error: error.message }); }
    if (!data || data.length === 0) { console.warn("[employees PATCH] No rows updated — id not found in Supabase:", req.params.id); }
  }
  res.json({ id: req.params.id, ...patch });
});

// ─── Attendance ──────────────────────────────────────────────────────────────
router.get("/attendance", async (req, res) => {
  const date = req.query.date?.toString();
  const all = await dbSelect("attendance", db.attendance);
  res.json(date ? all.filter((a: any) => a.calendar_date === date) : all);
});

router.post("/attendance", async (req, res) => {
  const { employee_id, calendar_date, status_flag } = req.body;

  if (supabase) {
    const { data: existing } = await supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employee_id)
      .eq("calendar_date", calendar_date)
      .single();

    if (existing) {
      const { data } = await supabase.from("attendance").update({ status_flag }).eq("id", existing.id).select().single();
      return res.json(data);
    }
  } else {
    const existing = db.attendance.find((a: any) => a.employee_id === employee_id && a.calendar_date === calendar_date);
    if (existing) { existing.status_flag = status_flag; return res.json(existing); }
  }

  res.json(await dbInsert("attendance", { id: crypto.randomUUID(), employee_id, calendar_date, status_flag }, db.attendance));
});

// ─── Settings ────────────────────────────────────────────────────────────────
router.get("/settings", async (_req, res) => {
  if (supabase) {
    const { data } = await supabase.from("settings").select("*").eq("id", 1).single();
    if (data) return res.json(data.value ?? db.settings);
  }
  res.json(db.settings);
});

router.post("/settings", async (req, res) => {
  db.settings = { ...db.settings, ...req.body };
  if (supabase) await supabase.from("settings").upsert({ id: 1, value: db.settings });
  res.json(db.settings);
});

// ─── Admin avatar / name persist ─────────────────────────────────────────────
router.patch("/auth/update-avatar", async (req, res) => {
  const { avatar, name } = req.body;
  const patch: any = {};
  if (avatar !== undefined) patch.adminAvatar = avatar;  // null clears it
  if (name   !== undefined) patch.adminName   = sanitize(name);
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "avatar or name required" });
  db.settings = { ...db.settings, ...patch };
  if (supabase) {
    const { error } = await supabase.from("settings").upsert({ id: 1, value: db.settings });
    if (error) { console.error("[update-avatar] Supabase upsert failed:", error.message); return res.status(500).json({ error: error.message }); }
  }
  res.json({ success: true });
});

// ─── Change password ──────────────────────────────────────────────────────────
router.post("/auth/change-password", async (req, res) => {
  const { current_pass, new_pass } = req.body;
  if (!current_pass || !new_pass) return res.status(400).json({ error: "Missing fields" });
  if (!PASSWORD_REGEX.test(new_pass)) return res.status(400).json({ error: "Password does not meet complexity requirements" });
  if (!db.adminPasswordHash) return res.status(400).json({ error: "No password set yet." });

  const isMatch = await bcrypt.compare(current_pass, db.adminPasswordHash);
  if (!isMatch) return res.status(401).json({ error: "Current password is incorrect" });

  db.adminPasswordHash = await bcrypt.hash(new_pass, 12);
  if (supabase)
    await supabase.from("settings").upsert({ id: 1, value: { ...db.settings, adminPasswordHash: db.adminPasswordHash } });

  res.json({ success: true });
});

// ─── Balance top-up ──────────────────────────────────────────────────────────
router.post("/settings/balance", async (req, res) => {
  const { type, amount } = req.body; // type: "cash" | "account"
  if (!type || !amount || Number(amount) <= 0) return res.status(400).json({ error: "type and positive amount required" });
  if (type === "cash") {
    db.settings = { ...db.settings, cashBalance: Number(db.settings?.cashBalance || 0) + Number(amount) };
  } else if (type === "account") {
    db.settings = { ...db.settings, accountBalance: Number(db.settings?.accountBalance || 0) + Number(amount) };
  } else {
    return res.status(400).json({ error: "type must be cash or account" });
  }
  if (supabase) await supabase.from("settings").upsert({ id: 1, value: db.settings });
  res.json({ cashBalance: db.settings.cashBalance, accountBalance: db.settings.accountBalance });
});

// ─── Raw Material Due-Soon Alerts ───────────────────────────────────────────
router.get("/raw-material-purchases/due-alerts", async (_req, res) => {
  if (!db.raw_material_purchases) db.raw_material_purchases = [];
  const all = await dbSelect("raw_material_purchases", db.raw_material_purchases);
  const today = new Date().toISOString().split("T")[0];
  const twoDaysLater = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const dealers = await dbSelect("dealers", db.dealers);

  const dueSoon = all.filter((r: any) => !r.is_paid && r.due_date && r.due_date >= today && r.due_date <= twoDaysLater);
  const overdue = all.filter((r: any) => !r.is_paid && r.due_date && r.due_date < today);

  // Broadcast WebSocket notifications for due-soon
  for (const r of dueSoon) {
    const dealer = dealers.find((d: any) => d.id === r.dealer_id);
    broadcast({
      type: "PAYMENT_DUE_SOON",
      payload: {
        purchase_id: r.id,
        material_name: r.material_name,
        dealer_name: dealer?.name || "Unknown Dealer",
        amount: (r.qty * r.rate_per_unit).toFixed(2),
        due_date: r.due_date,
      },
    });
  }

  // Broadcast for overdue
  for (const r of overdue) {
    const dealer = dealers.find((d: any) => d.id === r.dealer_id);
    broadcast({
      type: "PAYMENT_OVERDUE",
      payload: {
        purchase_id: r.id,
        material_name: r.material_name,
        dealer_name: dealer?.name || "Unknown Dealer",
        amount: (r.qty * r.rate_per_unit).toFixed(2),
        due_date: r.due_date,
      },
    });
  }

  res.json({ dueSoon: dueSoon.length, overdue: overdue.length });
});

// ─── Raw Material Purchases ───────────────────────────────────────────────────
router.get("/raw-material-purchases", async (_req, res) => {
  if (!db.raw_material_purchases) db.raw_material_purchases = [];
  res.json(await dbSelect("raw_material_purchases", db.raw_material_purchases));
});

router.post("/raw-material-purchases", async (req, res) => {
  if (!db.raw_material_purchases) db.raw_material_purchases = [];
  const dueDate = req.body.due_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // If already paid at creation, deduct from the chosen balance
  if (req.body.is_paid === true) {
    const amount = Number(req.body.qty) * Number(req.body.rate_per_unit);
    const method = req.body.payment_method; // "cash" | "online"
    if (method === "cash") {
      const current = Number(db.settings?.cashBalance || 0);
      if (current < amount) return res.status(400).json({ error: `Insufficient cash balance (₹${current.toFixed(2)} available)` });
      db.settings = { ...db.settings, cashBalance: current - amount };
    } else if (method === "online") {
      const current = Number(db.settings?.accountBalance || 0);
      if (current < amount) return res.status(400).json({ error: `Insufficient account balance (₹${current.toFixed(2)} available)` });
      db.settings = { ...db.settings, accountBalance: current - amount };
    }
    if (supabase) await supabase.from("settings").upsert({ id: 1, value: db.settings });
  }

  res.json(await dbInsert("raw_material_purchases", {
    id: crypto.randomUUID(),
    ...req.body,
    due_date: dueDate,
    is_paid: req.body.is_paid ?? false,
    purchase_date: new Date().toISOString(),
  }, db.raw_material_purchases));
});

router.patch("/raw-material-purchases/:id", async (req, res) => {
  if (!db.raw_material_purchases) db.raw_material_purchases = [];
  const all = await dbSelect("raw_material_purchases", db.raw_material_purchases);
  const purchase = all.find((r: any) => r.id === req.params.id);
  if (!purchase) return res.status(404).json({ error: "Not found" });

  const patch: any = {};
  const method = req.body.payment_method; // "cash" | "online"

  // Full payment
  if (req.body.is_paid === true && !purchase.is_paid) {
    const amount = Number(purchase.qty) * Number(purchase.rate_per_unit) - Number(purchase.amount_paid || 0);
    if (method === "cash") {
      const current = Number(db.settings?.cashBalance || 0);
      if (current < amount) return res.status(400).json({ error: `Insufficient cash balance (₹${current.toFixed(2)} available)` });
      db.settings = { ...db.settings, cashBalance: current - amount };
    } else if (method === "online") {
      const current = Number(db.settings?.accountBalance || 0);
      if (current < amount) return res.status(400).json({ error: `Insufficient account balance (₹${current.toFixed(2)} available)` });
      db.settings = { ...db.settings, accountBalance: current - amount };
    }
    if (supabase) await supabase.from("settings").upsert({ id: 1, value: db.settings });
    patch.is_paid = true;
    patch.amount_paid = Number(purchase.qty) * Number(purchase.rate_per_unit);
    patch.payment_method = method;
  }
  // Partial payment
  else if (req.body.partial_payment !== undefined) {
    const partial = Number(req.body.partial_payment);
    const total = Number(purchase.qty) * Number(purchase.rate_per_unit);
    const alreadyPaid = Number(purchase.amount_paid || 0);
    const newPaid = alreadyPaid + partial;
    if (partial <= 0) return res.status(400).json({ error: "Partial amount must be positive" });
    if (newPaid > total) return res.status(400).json({ error: "Payment exceeds total amount" });
    if (method === "cash") {
      const current = Number(db.settings?.cashBalance || 0);
      if (current < partial) return res.status(400).json({ error: `Insufficient cash balance (₹${current.toFixed(2)} available)` });
      db.settings = { ...db.settings, cashBalance: current - partial };
    } else if (method === "online") {
      const current = Number(db.settings?.accountBalance || 0);
      if (current < partial) return res.status(400).json({ error: `Insufficient account balance (₹${current.toFixed(2)} available)` });
      db.settings = { ...db.settings, accountBalance: current - partial };
    }
    if (supabase) await supabase.from("settings").upsert({ id: 1, value: db.settings });
    patch.amount_paid = newPaid;
    patch.payment_method = method;
    if (newPaid >= total) patch.is_paid = true;
  }

  const updated = await dbUpdate("raw_material_purchases", req.params.id, patch);
  const local = db.raw_material_purchases.find((r: any) => r.id === req.params.id);
  if (local) Object.assign(local, patch);
  res.json(updated);
});

// ─── Employee Sessions ────────────────────────────────────────────────────────
router.get("/employee-sessions", async (_req, res) => {
  if (!db.employee_sessions) db.employee_sessions = [];
  const all = await dbSelect("employee_sessions", db.employee_sessions);
  res.json(all.sort((a: any, b: any) => new Date(b.login_time).getTime() - new Date(a.login_time).getTime()));
});

// ─── Reviews ─────────────────────────────────────────────────────────────────
router.get("/reviews", async (_req, res) => {
  if (!db.reviews) db.reviews = [];
  const all = await dbSelect("reviews", db.reviews);
  res.json(all.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
});

router.post("/reviews", async (req, res) => {
  if (!db.reviews) db.reviews = [];
  const { author, rating, text } = req.body;
  if (!author || !rating || !text)
    return res.status(400).json({ error: "author, rating and text are required" });
  const r = Number(rating);
  if (r < 1 || r > 5) return res.status(400).json({ error: "rating must be between 1 and 5" });

  const saved = await dbInsert("reviews", {
    id: crypto.randomUUID(),
    author: sanitize(author),
    rating: r,
    text: sanitize(text),
    created_at: new Date().toISOString(),
  }, db.reviews);
  broadcast({ type: "NEW_REVIEW", payload: { author: saved.author, rating: saved.rating } });
  res.json(saved);
});

router.delete("/reviews/:id", async (req, res) => {
  const token = extractSessionToken(req);
  const session = token ? await getSession(token) : null;
  if (!session || (session.role !== "Admin" && !session.employeeId)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!db.reviews) db.reviews = [];
  await dbDelete("reviews", req.params.id);
  const idx = db.reviews.findIndex((r: any) => r.id === req.params.id);
  if (idx !== -1) db.reviews.splice(idx, 1);
  res.json({ success: true });
});

// ─── Gallery ──────────────────────────────────────────────────────────────────
router.get("/gallery", async (_req, res) => {
  if (!db.gallery) db.gallery = [];
  res.json(await dbSelect("gallery", db.gallery));
});

router.post("/gallery", async (req, res) => {
  if (!db.gallery) db.gallery = [];
  const { title, url } = req.body;
  if (!title || !url) return res.status(400).json({ error: "title and url are required" });
  res.json(await dbInsert("gallery", { id: crypto.randomUUID(), title, url }, db.gallery));
});

router.delete("/gallery/:id", async (req, res) => {
  if (!db.gallery) db.gallery = [];
  await dbDelete("gallery", req.params.id);
  const idx = db.gallery.findIndex((g: any) => g.id === req.params.id);
  if (idx !== -1) db.gallery.splice(idx, 1);
  res.json({ success: true });
});

// ─── Product Variants ────────────────────────────────────────────────────────
router.get("/product-variants", async (req, res) => {
  const { product_id } = req.query;
  const all = await dbSelect("product_variants", db.product_variants);
  res.json(product_id ? all.filter((v: any) => v.product_id === product_id) : all);
});

// ─── Banners ─────────────────────────────────────────────────────────────────
router.get("/banners", async (_req, res) => {
  if (!db.banners) db.banners = [];
  res.json(await dbSelect("banners", db.banners));
});

router.post("/banners", async (req, res) => {
  if (!db.banners) db.banners = [];
  const { image, label, sub } = req.body;
  if (!image) return res.status(400).json({ error: "image is required" });
  res.json(await dbInsert("banners", { id: crypto.randomUUID(), image: sanitize(image), label: sanitize(label || ""), sub: sanitize(sub || "") }, db.banners));
});

router.delete("/banners/:id", async (req, res) => {
  if (!db.banners) db.banners = [];
  await dbDelete("banners", req.params.id);
  const idx = db.banners.findIndex((b: any) => b.id === req.params.id);
  if (idx !== -1) db.banners.splice(idx, 1);
  res.json({ success: true });
});

router.patch("/banners/:id", async (req, res) => {
  if (!db.banners) db.banners = [];
  const patch: any = {};
  if (req.body.image !== undefined) patch.image = sanitize(req.body.image);
  if (req.body.label !== undefined) patch.label = sanitize(req.body.label);
  if (req.body.sub   !== undefined) patch.sub   = sanitize(req.body.sub);
  const updated = await dbUpdate("banners", req.params.id, patch);
  const local = db.banners.find((b: any) => b.id === req.params.id);
  if (local) Object.assign(local, patch);
  res.json(updated);
});

// ─── Categories ──────────────────────────────────────────────────────────────
router.get("/categories", async (_req, res) => {
  res.json(await dbSelect("categories", db.categories));
});

router.post("/categories", async (req, res) => {
  const { name, image } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  res.json(await dbInsert("categories", { id: `cat-${Date.now()}`, name: sanitize(name), image: sanitize(image || "") }, db.categories));
});

router.put("/categories/:id", async (req, res) => {
  const updated = await dbUpdate("categories", req.params.id, req.body);
  const local = db.categories.find((c: any) => c.id === req.params.id);
  if (local) Object.assign(local, req.body);
  res.json(updated);
});

router.delete("/categories/:id", async (req, res) => {
  await dbDelete("categories", req.params.id);
  const idx = db.categories.findIndex((c: any) => c.id === req.params.id);
  if (idx !== -1) db.categories.splice(idx, 1);
  res.json({ success: true });
});

// ─── Notifications ───────────────────────────────────────────────────────────
router.get("/notifications", async (_req, res) => {
  if (!db.notifications) db.notifications = [];
  const all = await dbSelect("notifications", db.notifications);
  res.json(all.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
});

router.patch("/notifications/read-all", async (_req, res) => {
  if (!db.notifications) db.notifications = [];
  if (supabase) await supabase.from("notifications").update({ read: true }).eq("read", false);
  db.notifications.forEach((n: any) => { n.read = true; });
  res.json({ success: true });
});

router.delete("/notifications", async (_req, res) => {
  if (!db.notifications) db.notifications = [];
  if (supabase) await supabase.from("notifications").delete().neq("id", "");
  db.notifications = [];
  res.json({ success: true });
});

// ─── Analytics ───────────────────────────────────────────────────────────────
router.get("/analytics", async (_req, res) => {
  // Use IST (UTC+5:30) for "today" so metrics match India time
  const istOffset = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(Date.now() + istOffset);
  const today = nowIST.toISOString().split("T")[0]; // YYYY-MM-DD in IST

  const [allOrders, allProducts] = await Promise.all([
    dbSelect("orders", db.orders),
    dbSelect("products", db.products),
  ]);

  // Match orders whose IST date equals today
  const todayOrders = allOrders.filter((o: any) => {
    if (!o.timestamp) return false;
    const orderIST = new Date(new Date(o.timestamp).getTime() + istOffset);
    return orderIST.toISOString().startsWith(today);
  });
  const paidOrders = todayOrders.filter((o: any) => o.order_status === "Paid");

  res.json({
    totalRevenue:  paidOrders.reduce((s: number, o: any) => s + Number(o.grand_total), 0),
    totalSales:    paidOrders.length,
    totalOrders:   todayOrders.length,
    totalProducts: allProducts.length,
    lowStock:      allProducts.filter((p: any) => p.current_stock_qty > 0 && p.current_stock_qty <= p.safety_low_threshold).length,
    outOfStock:    allProducts.filter((p: any) => p.current_stock_qty === 0).length,
  });
});

export default router;
