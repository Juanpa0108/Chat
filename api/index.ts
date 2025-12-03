import { Server, type Socket } from "socket.io";
import "dotenv/config";

const origins = (process.env.ORIGIN ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function isAllowedOrigin(requestOrigin?: string | null): boolean {
  if (!requestOrigin) return true; // allow same-origin or server-side calls
  if (origins.length === 0) return true;
  for (const rule of origins) {
    if (rule === "*") return true;
    if (rule.includes("*")) {
      // simple wildcard matcher: https://*.netlify.app
      const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
      const re = new RegExp(`^${escaped}$`);
      if (re.test(requestOrigin)) return true;
    } else if (requestOrigin === rule) {
      return true;
    } else if (rule.endsWith(".netlify.app") && requestOrigin.endsWith(".netlify.app")) {
      // allow any netlify.app subdomain if rule targets that host root
      return true;
    }
  }
  return false;
}

const io = new Server({
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  // Slightly relax timeouts to avoid flaky reconnects on dev
  pingTimeout: 30000,
  pingInterval: 25000
});

const port = Number(process.env.PORT ?? 3000);

io.listen(port);
console.log(`Server is running on port ${port}`);

type OnlineUser = { socketId: string; userId: string };
type ChatMessagePayload = {
  userId: string;
  message: string;
  timestamp?: string;
};

let onlineUsers: OnlineUser[] = [];
// Track the host socket per meeting room (simple heuristic: first join becomes host)
const roomHost: Map<string, string> = new Map();

io.on("connection", (socket: Socket) => {
  onlineUsers.push({ socketId: socket.id, userId: "" });
  io.emit("usersOnline", onlineUsers);
  console.log(
    "A user connected with id: ",
    socket.id,
    " there are now ",
    onlineUsers.length,
    " online users"
  );

  socket.on("newUser", (userId: string) => {
    if (!userId) {
      return;
    }

    const existingUserIndex = onlineUsers.findIndex(
      user => user.socketId === socket.id
    );

    if (existingUserIndex !== -1) {
      onlineUsers[existingUserIndex] = { socketId: socket.id, userId };
    } else if (!onlineUsers.some(user => user.userId === userId)) {
      onlineUsers.push({ socketId: socket.id, userId });
    } else {
      onlineUsers = onlineUsers.map(user =>
        user.userId === userId ? { socketId: socket.id, userId } : user
      );
    }

    io.emit("usersOnline", onlineUsers);
  });

  socket.on("chat:message", (payload: ChatMessagePayload) => {
    const trimmedMessage = payload?.message?.trim();

    if (!trimmedMessage) {
      return;
    }

    const sender =
      onlineUsers.find(user => user.socketId === socket.id) ?? null;

    const outgoingMessage = {
      userId: payload.userId || sender?.userId || socket.id,
      message: trimmedMessage,
      timestamp: payload.timestamp ?? new Date().toISOString()
    };

    io.emit("chat:message", outgoingMessage);
    console.log(
      "Relayed chat message from: ",
      outgoingMessage.userId,
      " message: ",
      outgoingMessage.message
    );
  });

  // --- WebRTC signaling ---
  socket.on('rtc:join', ({ room }: { room: string }) => {
    if (!room) return;
    socket.join(room);
    if (!roomHost.has(room)) {
      roomHost.set(room, socket.id);
    }
    socket.to(room).emit('rtc:joined', { from: socket.id });
  });

  socket.on('rtc:leave', ({ room }: { room: string }) => {
    if (!room) return;
    socket.leave(room);
    socket.to(room).emit('rtc:left', { from: socket.id });
  });

  socket.on('rtc:offer', ({ room, to, offer }: { room: string; to: string; offer: any }) => {
    if (!room || !to || !offer) return;
    socket.to(to).emit('rtc:offer', { from: socket.id, offer });
  });

  socket.on('rtc:answer', ({ room, to, answer }: { room: string; to: string; answer: any }) => {
    if (!room || !to || !answer) return;
    socket.to(to).emit('rtc:answer', { from: socket.id, answer });
  });

  socket.on('rtc:ice', ({ room, to, candidate }: { room: string; to: string; candidate: any }) => {
    if (!room || !to || !candidate) return;
    socket.to(to).emit('rtc:ice', { from: socket.id, candidate });
  });

  // End meeting only allowed by host
  socket.on('meeting:end', ({ room }: { room: string }) => {
    if (!room) return;
    const hostId = roomHost.get(room);
    if (hostId && hostId === socket.id) {
      io.to(room).emit('meeting:ended');
      // Optionally clear room state
      roomHost.delete(room);
      // Disconnect all sockets from the room
      const clients = io.sockets.adapter.rooms.get(room);
      if (clients) {
        for (const clientId of clients) {
          const s = io.sockets.sockets.get(clientId);
          s?.leave(room);
        }
      }
    } else {
      // Non-hosts cannot end; they can leave only
      socket.emit('meeting:end:denied');
    }
  });

  socket.on('meeting:leave', ({ room }: { room: string }) => {
    if (!room) return;
    socket.leave(room);
    socket.to(room).emit('rtc:left', { from: socket.id });
  });

  socket.on("disconnect", () => {
    onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
    io.emit("usersOnline", onlineUsers);
    // Clean up host mapping if host disconnects
    for (const [room, hostId] of roomHost.entries()) {
      if (hostId === socket.id) roomHost.delete(room);
    }
    console.log(
      "A user disconnected with id: ",
      socket.id,
      " there are now ",
      onlineUsers.length,
      " online users"
    );
  });
});
