import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Enhanced CORS and WebSocket middleware
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';

  // Basic CORS headers
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  // Handle WebSocket upgrade requests
  if (req.headers.upgrade === 'websocket') {
    res.removeHeader('Connection');
    res.removeHeader('Upgrade');
    next();
    return;
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
});

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Enhanced logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  if (path.startsWith("/ws")) {
    log(`WebSocket request: ${req.method} ${path}`);
    log(`Headers: ${JSON.stringify(req.headers)}`);
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  try {
    const server = await registerRoutes(app);

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
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

    const PORT = process.env.PORT || 5000; // Usa el puerto de Railway o 5000 por defecto
    server.listen(PORT, "0.0.0.0", () => {
      log(`Server running on port ${PORT}`);
      log(`WebSocket server available at wss://0.0.0.0:${PORT}/ws`);
    });
  } catch (error) {
    console.error("[Server] Fatal error:", error);
    process.exit(1);
  }
})();