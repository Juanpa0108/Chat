import { Server, type Socket } from "socket.io";
import "dotenv/config";

const origins = (process.env.ORIGIN ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const io = new Server({
  cors: {
    origin: origins
  }
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

  socket.on("disconnect", () => {
    onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
    io.emit("usersOnline", onlineUsers);
    console.log(
      "A user disconnected with id: ",
      socket.id,
      " there are now ",
      onlineUsers.length,
      " online users"
    );
  });
});
