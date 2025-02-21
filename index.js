// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
var rooms = /* @__PURE__ */ new Map();
var translations = /* @__PURE__ */ new Map();
var sseClients = /* @__PURE__ */ new Map();
async function registerRoutes(app2) {
  const httpServer = createServer(app2);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    path: "/socket.io"
  });
  console.log("[SocketIO] Server initialized");
  app2.get("/api/translations/stream/:roomId", (req, res) => {
    try {
      const roomId = req.params.roomId;
      const language = req.query.language;
      if (!roomId || !language) {
        res.status(400).json({ error: "Room ID and language are required" });
        return;
      }
      console.log(`[Translations] Setting up SSE for room ${roomId}, language ${language}`);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type"
      });
      res.write(`event: connected
data: ${JSON.stringify({ type: "connected" })}

`);
      if (!sseClients.has(roomId)) {
        sseClients.set(roomId, /* @__PURE__ */ new Set());
      }
      sseClients.get(roomId)?.add({ res, language });
      console.log(`[Translations] Client connected to room ${roomId}`);
      const keepAlive = setInterval(() => {
        if (!res.writableEnded) {
          res.write(":\n\n");
        }
      }, 15e3);
      req.on("close", () => {
        console.log(`[Translations] Client disconnected from room ${roomId}`);
        clearInterval(keepAlive);
        const clients = sseClients.get(roomId);
        if (clients) {
          clients.forEach((client) => {
            if (client.res === res) {
              clients.delete(client);
            }
          });
          if (clients.size === 0) {
            sseClients.delete(roomId);
          }
        }
      });
    } catch (error) {
      console.error("[Translations] Error setting up SSE:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
  app2.post("/api/translate", async (req, res) => {
    try {
      const { text, from, to, roomId } = req.body;
      if (!text || !from || !to || !roomId) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }
      console.log(`[Translations] Translation request:`, { text, from, to, roomId });
      const translatedText = `[${to.toUpperCase()}] ${text}`;
      if (!translations.has(roomId)) {
        translations.set(roomId, /* @__PURE__ */ new Map());
      }
      translations.get(roomId)?.set(text, translatedText);
      const clients = sseClients.get(roomId);
      if (clients) {
        const message = {
          type: "translation",
          text,
          translated: translatedText,
          from,
          to
        };
        console.log(`[Translations] Broadcasting to ${clients.size} clients:`, message);
        clients.forEach((client) => {
          if (!client.res.writableEnded) {
            client.res.write(`event: message
data: ${JSON.stringify(message)}

`);
          }
        });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Translations] Translation error:", error);
      res.status(500).json({ error: "Translation failed" });
    }
  });
  io.on("connection", (socket) => {
    console.log("[SocketIO] New connection:", socket.id);
    let currentRoom = null;
    socket.on("join", ({ roomId }) => {
      try {
        if (!roomId) {
          throw new Error("Room ID is required");
        }
        if (currentRoom) {
          socket.leave(currentRoom);
          const prevRoom = rooms.get(currentRoom);
          if (prevRoom) {
            prevRoom.delete(socket.id);
            if (prevRoom.size === 0) {
              rooms.delete(currentRoom);
            }
          }
        }
        currentRoom = roomId;
        socket.join(roomId);
        if (!rooms.has(roomId)) {
          rooms.set(roomId, /* @__PURE__ */ new Set());
        }
        const room = rooms.get(roomId);
        room.add(socket.id);
        console.log(`[SocketIO] Client ${socket.id} joined room ${roomId}`);
        socket.emit("joined", {
          clientId: socket.id,
          clients: room.size
        });
      } catch (error) {
        console.error("[SocketIO] Join error:", error);
        socket.emit("error", {
          message: error.message || "Error al unirse a la sala"
        });
      }
    });
    socket.on("signal", (message) => {
      try {
        if (!currentRoom) {
          socket.emit("error", {
            message: "Debe unirse a una sala primero"
          });
          return;
        }
        console.log(`[SocketIO] Broadcasting ${message.type} to room ${currentRoom}`);
        socket.to(currentRoom).emit("signal", message);
      } catch (error) {
        console.error("[SocketIO] Signal error:", error);
        socket.emit("error", {
          message: error.message || "Error al procesar se\xF1al"
        });
      }
    });
    socket.on("disconnect", () => {
      if (currentRoom) {
        const room = rooms.get(currentRoom);
        if (room) {
          room.delete(socket.id);
          if (room.size === 0) {
            rooms.delete(currentRoom);
          }
          console.log(`[SocketIO] Client ${socket.id} left room ${currentRoom}`);
        }
      }
    });
  });
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2, { dirname } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var vite_config_default = defineConfig({
  plugins: [react(), runtimeErrorOverlay(), themePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared")
    }
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:5000",
        // Usa la URL del backend
        changeOrigin: true,
        secure: false
      },
      "/socket.io": {
        target: process.env.VITE_SOCKET_URL || "http://localhost:5000",
        // Usa la URL del backend
        ws: true
      }
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = dirname(__filename2);
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        __dirname2,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(__dirname2, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.headers.upgrade === "websocket") {
    res.removeHeader("Connection");
    res.removeHeader("Upgrade");
    next();
    return;
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  if (path3.startsWith("/ws")) {
    log(`WebSocket request: ${req.method} ${path3}`);
    log(`Headers: ${JSON.stringify(req.headers)}`);
  }
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      log(`${req.method} ${path3} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});
(async () => {
  try {
    const server = await registerRoutes(app);
    app.use((err, _req, res, _next) => {
      console.error("[Server] Error:", err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
    });
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
    const PORT = process.env.PORT || 5e3;
    server.listen(PORT, "0.0.0.0", () => {
      log(`Server running on port ${PORT}`);
      log(`WebSocket server available at wss://0.0.0.0:${PORT}/ws`);
    });
  } catch (error) {
    console.error("[Server] Fatal error:", error);
    process.exit(1);
  }
})();
