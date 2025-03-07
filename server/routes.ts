import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { type SignalingMessage, type Language } from "@shared/schema";

const rooms = new Map<string, Set<string>>();
const translations = new Map<string, Map<string, string>>();
const sseClients = new Map<string, Set<{ res: any, language: string }>>();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Create Socket.IO server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    path: '/socket.io'
  });

  console.log("[SocketIO] Server initialized");

  // Setup SSE translation endpoint
  app.get('/api/translations/stream/:roomId', (req, res) => {
    try {
      const roomId = req.params.roomId;
      const language = req.query.language as string;

      if (!roomId || !language) {
        res.status(400).json({ error: 'Room ID and language are required' });
        return;
      }

      console.log(`[Translations] Setting up SSE for room ${roomId}, language ${language}`);

      // Set SSE headers with correct CORS
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      });

      // Send initial message to confirm connection
      res.write(`event: connected\ndata: ${JSON.stringify({ type: "connected" })}\n\n`);

      // Store SSE client
      if (!sseClients.has(roomId)) {
        sseClients.set(roomId, new Set());
      }
      sseClients.get(roomId)?.add({ res, language });

      console.log(`[Translations] Client connected to room ${roomId}`);

      // Keep connection alive
      const keepAlive = setInterval(() => {
        if (!res.writableEnded) {
          res.write(':\n\n');
        }
      }, 15000);

      // Clean up on close
      req.on('close', () => {
        console.log(`[Translations] Client disconnected from room ${roomId}`);
        clearInterval(keepAlive);
        const clients = sseClients.get(roomId);
        if (clients) {
          clients.forEach(client => {
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
      console.error('[Translations] Error setting up SSE:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Add translation endpoint
  app.post('/api/translate', async (req, res) => {
    try {
      const { text, from, to, roomId } = req.body;

      if (!text || !from || !to || !roomId) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      console.log(`[Translations] Translation request:`, { text, from, to, roomId });

      // Mock translation
      const translatedText = `[${to.toUpperCase()}] ${text}`;

      // Store translation
      if (!translations.has(roomId)) {
        translations.set(roomId, new Map());
      }
      translations.get(roomId)?.set(text, translatedText);

      // Send to SSE clients
      const clients = sseClients.get(roomId);
      if (clients) {
        const message = {
          type: 'translation',
          text,
          translated: translatedText,
          from,
          to
        };

        console.log(`[Translations] Broadcasting to ${clients.size} clients:`, message);

        clients.forEach(client => {
          if (!client.res.writableEnded) {
            client.res.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
          }
        });
      }

      res.json({ success: true });

    } catch (error) {
      console.error('[Translations] Translation error:', error);
      res.status(500).json({ error: 'Translation failed' });
    }
  });

  // Socket.IO handling
  io.on('connection', (socket) => {
    console.log("[SocketIO] New connection:", socket.id);
    let currentRoom: string | null = null;

    socket.on('join', ({ roomId }) => {
      try {
        if (!roomId) {
          throw new Error('Room ID is required');
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
          rooms.set(roomId, new Set());
        }

        const room = rooms.get(roomId)!;
        room.add(socket.id);

        console.log(`[SocketIO] Client ${socket.id} joined room ${roomId}`);

        socket.emit('joined', {
          clientId: socket.id,
          clients: room.size
        });

      } catch (error: any) {
        console.error("[SocketIO] Join error:", error);
        socket.emit('error', {
          message: error.message || 'Error al unirse a la sala'
        });
      }
    });

    socket.on('signal', (message: SignalingMessage) => {
      try {
        if (!currentRoom) {
          socket.emit('error', {
            message: 'Debe unirse a una sala primero'
          });
          return;
        }

        console.log(`[SocketIO] Broadcasting ${message.type} to room ${currentRoom}`);
        socket.to(currentRoom).emit('signal', message);

      } catch (error: any) {
        console.error("[SocketIO] Signal error:", error);
        socket.emit('error', {
          message: error.message || 'Error al procesar señal'
        });
      }
    });

    socket.on('disconnect', () => {
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