import { WebSocket } from "ws";
import { db, supabase, dbInsert } from "./db.js";
import crypto from "crypto";

const clients = new Set<WebSocket>();
const isDev = process.env.NODE_ENV !== "production";

export function handleWebSocketConnection(ws: WebSocket) {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.on("error", (error) => {
    if (isDev) console.error("[ws] client error:", error);
  });
}

// Only these 3 types create persistent notifications
const TYPE_META: Record<string, { title: (p: any) => string; desc: (p: any) => string; notif_type: string }> = {
  INBOUND_QR_ORDER:   { title: p => `New QR Order #${p.order_id}`,        desc: p => `Table ${p.table_number} • ₹${p.bill_amount}`,     notif_type: "info" },
  INVENTORY_DEPLETED: { title: p => `Out of Stock: SKU ${p.sku_code}`,    desc: p => `Product ${p.product_id} has reached zero stock.`, notif_type: "error" },
  LOW_STOCK_ALERT:    { title: p => `Low Stock: ${p.product_name}`,       desc: p => `Only ${p.remaining_qty} units left.`,             notif_type: "warning" },
};

export async function broadcast(message: any) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
  // Persist to DB
  const meta = TYPE_META[message.type];
  if (meta) {
    if (!db.notifications) db.notifications = [];
    const entry = {
      id: crypto.randomUUID(),
      type: message.type,
      title: meta.title(message.payload),
      description: meta.desc(message.payload),
      notif_type: meta.notif_type,
      payload: message.payload,
      read: false,
      created_at: new Date().toISOString(),
    };
    await dbInsert("notifications", entry, db.notifications).catch(() => {});
  }
}
