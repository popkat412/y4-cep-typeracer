import { io } from "socket.io-client";

import "./style.css";

const socket = io("localhost:3010");

socket.on("connect", () => {
  console.log("socket.io connected");
});
