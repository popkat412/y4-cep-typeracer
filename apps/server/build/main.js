"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
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
