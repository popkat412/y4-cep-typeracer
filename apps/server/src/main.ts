import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true, // todo: remember to update this
  },
});

const port = process.env.PORT || 3010;

io.on("connection", (socket) => {
  console.log(`new connection: ${socket.id}`);
});

server.listen(port, () => {
  console.log(`server listening on port ${port}`);
});
