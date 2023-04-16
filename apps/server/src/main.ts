import express from "express";
import http from "http";
import {
  ClientToServerEvents,
  InterServerEvents,
  JoinGameError,
  ServerToClientEvents,
  SocketData,
} from "shared";

import { BroadcastOperator, Server, Socket } from "socket.io";
import { randomUUID } from "crypto";

// socket stuff
const app = express();
const server = http.createServer(app);
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server, {
  cors: {
    origin: "*", // todo: update this when deploying
  },
});

// interfaces
interface SessionData {
  gameId?: string;
}

// helper functions
function randomCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function joinSocketToGame(
  socket: Socket<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >,
  gameId: string
): void {
  if (!socket.data.sessionId) {
    console.error("no session associated with socket");
    return;
  }

  // join socket.io room
  socket.join(gameId);

  // update socket data
  socket.data.gameId = gameId;

  // update sessions store
  const sessionData = sessionStore.get(socket.data.sessionId);
  if (sessionData) {
    sessionData.gameId = gameId;
  }
}

// type EmitCallback = (
//   room: BroadcastOperator<ServerToClientEvents, SocketData>
// ) => void;

// function bufferedEmit(gameId: string, callback: EmitCallback): void {
//   if (!roomBuffer.has(gameId)) roomBuffer.set(gameId, []);
//   roomBuffer.get(gameId)!.push(callback);
// }

// state
const sessionStore = new Map<string, SessionData>(); // session id -> session data
// const roomBuffer = new Map<string, EmitCallback[]>();

// handle sockets
io.use((socket, next) => {
  const sessionId = socket.handshake.auth.sessionId as string | undefined;
  console.log(`in middleware (handshake sessionId: ${sessionId})`, socket.data);
  if (sessionId) {
    const session = sessionStore.get(sessionId);
    if (session) {
      socket.data.sessionId = sessionId;
      socket.data.gameId = session.gameId;
      if (session.gameId) {
        socket.join(session.gameId);
      }
      return next();
    } else {
      // session doesn't exist
      console.log("session doesn't exist");
    }
  }

  socket.data.sessionId = randomUUID();
  sessionStore.set(socket.data.sessionId, {});

  console.log("set session id: ", socket.data.sessionId);

  next();
});

io.on("connection", (socket) => {
  console.log("new connection", socket.id);

  socket.emit("session", socket.data.sessionId!);

  socket.on("createGame", (callback) => {
    const rooms = io.of("/").adapter.rooms;

    let gameCode = randomCode();
    while (rooms.has(gameCode)) gameCode = randomCode();

    console.log("creating game: ", gameCode);

    joinSocketToGame(socket, gameCode);

    callback(gameCode);
  });

  socket.on("joinGame", (gameId, callback) => {
    gameId = gameId.trim();

    const rooms = io.of("/").adapter.rooms;

    if (!rooms.has(gameId)) {
      console.log("room doesn't exist");
      return callback(JoinGameError.RoomDoesntExist);
    }

    if (rooms.get(gameId)!.size > 1) {
      console.log("room full");
      return callback(JoinGameError.RoomFull);
    }

    joinSocketToGame(socket, gameId);

    // inform other client
    socket.to(gameId).emit("getReady");

    callback(false);
  });

  socket.on("ready", () => {
    if (!socket.data.gameId) throw new Error("no game id");
    if (!socket.data.gameId) return;

    // relay message to other client
    socket.to(socket.data.gameId).emit("opponentReady");
  });

  socket.on("start", () => {
    if (!socket.data.gameId) throw new Error("no game id");
    if (!socket.data.gameId) return;

    // relay message to BOTH clients
    io.to(socket.data.gameId).emit("start");
  });

  socket.on("newWord", (word) => {
    if (!socket.data.gameId) throw new Error("no game id");
    if (!socket.data.gameId) return;

    // bufferedEmit(socket.data.gameId, (room) => {
    //   room.emit("newWord", word);
    // });

    // relay message to other client
    socket.to(socket.data.gameId).emit("newWord", word);
    console.log(`emitted new word: ${word.word}`);
  });

  socket.on("input", (input) => {
    if (!socket.data.gameId) throw new Error("no game id");
    // return;

    // relay message to other client
    socket.to(socket.data.gameId).emit("input", input);
  });

  socket.on("clearedWord", (word) => {
    if (!socket.data.gameId) throw new Error("no game id");
    // if (!socket.data.gameId) return;

    // relay message to other client
    socket.to(socket.data.gameId).emit("opponentClearedWord", word);
  });

  socket.on("iDiedSadge", () => {
    if (!socket.data.gameId) throw new Error("no game id");
    // if (!socket.data.gameId) return;

    socket.to(socket.data.gameId).emit("opponentDied");
  });

  socket.on("playAgain", () => {
    if (!socket.data.gameId) throw new Error("no game id");
    // if (!socket.data.gameId) return;

    io.to(socket.data.gameId).emit("playAgain"); // send to BOTH clients
  });

  socket.on("disconnecting", (info) => {
    console.log("diconnecting info: ", info);
    if (socket.data.gameId) {
      socket.to(socket.data.gameId).emit("opponentLeft");
    }
  });
});

// listen
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`listening on port ${port}`);
});
