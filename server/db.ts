import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production";
const isDev = !isProduction;
const missingProdEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((key) => !process.env[key]);

if (isProduction && missingProdEnv.length > 0) {
  throw new Error(`Missing required production environment variables: ${missingProdEnv.join(", ")}`);
}

let supabase: SupabaseClient | null = null;

if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  if (isDev) console.log("✅ Supabase connected.");
} else {
  if (isDev) console.warn("⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — using in-memory store.");
}

export { supabase };

export const db: any = {
  products: [],
  product_variants: [
    { variant_id: "v1", product_id: "p1", size_label: "250g", variant_price_modifier: 0.25 },
    { variant_id: "v2", product_id: "p1", size_label: "500g", variant_price_modifier: 0.5 },
    { variant_id: "v3", product_id: "p1", size_label: "1kg", variant_price_modifier: 1.0 },
    { variant_id: "v4", product_id: "p3", size_label: "500g", variant_price_modifier: 0.5 },
    { variant_id: "v5", product_id: "p3", size_label: "1kg", variant_price_modifier: 1.0 },
  ],
  dealers: [
    { id: "d1", name: "Amul Distributors", address: "Main Road, Buxar", gstin: "10AAAAA1234A1Z1", phone: "9876543210" },
  ],
  expenses: [],
  employees: [
    { id: "e1", name: "Ramesh Kumar", designation_tag: "Cashier", phone_number: "9876500001", salary_type_flag: "Monthly", base_compensation_rate: 15000, joining_date: "2024-01-15" },
    { id: "e2", name: "Suresh Yadav", designation_tag: "Chef", phone_number: "9876500002", salary_type_flag: "Monthly", base_compensation_rate: 18000, joining_date: "2024-02-01" },
    { id: "e3", name: "Priya Sharma", designation_tag: "Manager", phone_number: "9876500003", salary_type_flag: "Monthly", base_compensation_rate: 25000, joining_date: "2024-01-01" },
  ],
  attendance: [],
  orders: [],
  inventory_log: [] as any[],
  guest_customers: [] as any[],
  employee_sessions: [] as any[],
  raw_material_purchases: [] as any[],
  notifications: [] as any[],
  adminPasswordHash: "",
  settings: {
    cashBalance: 0,
    accountBalance: 0,
    permissions: {
      Cashier: { "POS Billing": "Full Access", Orders: "Read-Only", Inventory: "Hidden", "Financial Reports": "Hidden", Settings: "Hidden", Employees: "Hidden" },
      Chef: { "POS Billing": "Hidden", Orders: "Full Access", Inventory: "Read-Only", "Financial Reports": "Hidden", Settings: "Hidden", Employees: "Hidden" },
      Manager: { "POS Billing": "Full Access", Orders: "Full Access", Inventory: "Full Access", "Financial Reports": "Read-Only", Settings: "Hidden", Employees: "Read-Only" },
    },
    lowStockAlerts: true,
    dailyReportSummary: false,
  },
  categories: [
    { id: "c1", name: "Sweets", image: "https://images.unsplash.com/photo-1626804475297-4160ebba5270?auto=format&fit=crop&q=80&w=400" },
    { id: "c2", name: "Namkeen", image: "https://images.unsplash.com/photo-1605337298642-e931139edaf1?auto=format&fit=crop&q=80&w=400" },
    { id: "c3", name: "Bakery", image: "https://images.unsplash.com/photo-1621236378699-8597ffc34082?auto=format&fit=crop&q=80&w=400" },
    { id: "c4", name: "Beverages", image: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&q=80&w=400" },
    { id: "c5", name: "Snacks", image: "https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?auto=format&fit=crop&q=80&w=400" },
  ],
  reviews: [
    { id: "r1", author: "Rahul S.", rating: 5, text: "The best Kaju Katli in town. Have been a customer for 10 years!", created_at: "2024-01-10T10:00:00Z" },
    { id: "r2", author: "Priya M.", rating: 4, text: "Very fast delivery, samosas were still warm.", created_at: "2024-02-14T12:00:00Z" },
    { id: "r3", author: "Amit K.", rating: 5, text: "Love the new digital ordering system. Soan Papdi is amazing.", created_at: "2024-03-05T09:30:00Z" },
  ],
  gallery: [
    { id: "g1", title: "Premium Assorted Sweets", url: "https://images.pexels.com/photos/1028714/pexels-photo-1028714.jpeg?auto=compress&cs=tinysrgb&w=600" },
    { id: "g2", title: "Fresh Jalebi", url: "https://images.pexels.com/photos/9609847/pexels-photo-9609847.jpeg?auto=compress&cs=tinysrgb&w=600" },
    { id: "g3", title: "Samosa & Namkeen", url: "https://images.pexels.com/photos/4449068/pexels-photo-4449068.jpeg?auto=compress&cs=tinysrgb&w=600" },
    { id: "g4", title: "Gulab Jamun", url: "https://images.pexels.com/photos/14477896/pexels-photo-14477896.jpeg?auto=compress&cs=tinysrgb&w=600" },
    { id: "g5", title: "Bakery Delights", url: "https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?auto=compress&cs=tinysrgb&w=600" },
  ],
  banners: [] as any[],
  deleted_bills: [] as any[],
};

export async function bootstrapDb() {
  if (!supabase) return;

  try {
    const { data } = await supabase.from("settings").select("value").eq("id", 1).single();
    if (data?.value) {
      Object.assign(db.settings, data.value);
      if (data.value.adminPasswordHash) {
        db.adminPasswordHash = data.value.adminPasswordHash;
        if (isDev) console.log("✅ Admin password hash loaded from Supabase.");
      } else {
        if (isDev) console.warn("⚠️  No adminPasswordHash found in Supabase settings.");
      }
    }
  } catch {
    if (isDev) console.warn("⚠️  Could not load settings from Supabase.");
  }

  try {
    const { data } = await supabase.from("guest_customers").select("*");
    db.guest_customers = Array.isArray(data) ? data : [];
    if (db.guest_customers.length > 0) {
      if (isDev) console.log(`✅ Loaded ${db.guest_customers.length} guest customers from Supabase.`);
    }
  } catch {
    db.guest_customers = [];
    if (isDev) console.warn("⚠️  Could not load guest_customers from Supabase.");
  }

  try {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .gt("expires_at", new Date().toISOString());
    if (error) {
      if (isDev) console.warn("⚠️  sessions table not found — run the CREATE TABLE SQL in Supabase. Sessions will be in-memory only.");
    } else if (data) {
      const { sessionStore } = await import("./middleware.js");
      for (const row of data) {
        sessionStore.set(row.token, {
          role: row.role,
          name: row.name,
          employeeId: row.employee_id,
          createdAt: new Date(row.created_at).getTime(),
        });
      }
      if (isDev) console.log(`✅ Restored ${data.length} active sessions from Supabase.`);
    }
  } catch {
    if (isDev) console.warn("⚠️  Could not load sessions from Supabase.");
  }
}

export async function dbSelect(table: string, fallback: any[], query?: Record<string, any>) {
  if (!supabase) return fallback;
  let q = supabase.from(table).select("*");
  if (query) Object.entries(query).forEach(([k, v]) => { q = (q as any).eq(k, v); });
  const { data, error } = await q;
  if (error) {
    console.error(`Supabase SELECT ${table}:`, error.message);
    return fallback;
  }
  return data ?? fallback;
}

export async function dbInsert(table: string, row: any, fallbackArr: any[]) {
  if (!supabase) {
    fallbackArr.unshift ? fallbackArr.unshift(row) : fallbackArr.push(row);
    return row;
  }
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) {
    console.error(`Supabase INSERT ${table}:`, error.message);
    fallbackArr.push(row);
    return row;
  }
  return data;
}

export async function dbUpdate(table: string, id: string, patch: any, idCol = "id") {
  if (!supabase) return patch;
  const { data, error } = await supabase.from(table).update(patch).eq(idCol, id).select().single();
  if (error) {
    console.error(`Supabase UPDATE ${table}:`, error.message);
    return patch;
  }
  return data;
}

export async function dbDelete(table: string, id: string, idCol = "id") {
  if (!supabase) return;
  const { error } = await supabase.from(table).delete().eq(idCol, id);
  if (error) console.error(`Supabase DELETE ${table}:`, error.message);
}
