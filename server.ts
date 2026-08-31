import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import apiRoutes from "./server/api.js";
import { handleWebSocketConnection } from "./server/ws.js";
import { extractSessionTokenFromCookie, getSession } from "./server/middleware.js";
import { bootstrapDb } from "./server/db.js";

async function startServer() {
  await bootstrapDb();
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  let shuttingDown = false;

  const shutdown = (code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    httpServer.close(() => process.exit(code));
    setTimeout(() => process.exit(code), 5000).unref();
  };

  // ── Security headers ────────────────────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
          "form-action 'self'",
          "img-src 'self' data: https:",
          "font-src 'self' data:",
          "style-src 'self' 'unsafe-inline' https:",
          "script-src 'self'",
          "connect-src 'self' https: wss:",
        ].join("; ")
      );
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // ── Body parsing with size limit ────────────────────────────────────────────
  app.use(express.json({ limit: "5mb" }));

  // ── Guest profile — registered directly, never blocked by any middleware ────
  // API Routes
  app.use("/api", apiRoutes);

  const httpServer = createServer(app);

  // WebSocket Setup
  const wss = new WebSocketServer({ server: httpServer, path: "/api/ws" });
  wss.on("connection", async (ws, req) => {
    const token = extractSessionTokenFromCookie(req.headers.cookie);
    const session = token ? await getSession(token) : null;
    if (!session || session.role === "Customer") {
      ws.close(1008, "Unauthorized");
      return;
    }
    handleWebSocketConnection(ws);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, { maxAge: "1d" }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ── Global error handler ────────────────────────────────────────────────────
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Unhandled Error]", err?.message || err);
    res.status(500).json({ error: "Internal server error" });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.info(`Server running on http://localhost:${PORT} [${process.env.NODE_ENV || "development"}]`);
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  process.on("SIGTERM", () => { shutdown(0); });
  process.on("SIGINT",  () => { shutdown(0); });
  process.on("unhandledRejection", (reason) => {
    console.error("[Unhandled Rejection]", reason);
    shutdown(1);
  });
  process.on("uncaughtException", (error) => {
    console.error("[Uncaught Exception]", error);
    shutdown(1);
  });
}

startServer().catch(err => { console.error("Failed to start server:", err); process.exit(1); });
