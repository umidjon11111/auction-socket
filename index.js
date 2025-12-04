const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();

// EXPRESS app
const app = express();

// Simple HTTP endpoint → Hosting shuni tekshiradi!
app.get("/", (req, res) => {
  res.send("Socket server is running.");
});

// CREATE HTTP server with express
const server = http.createServer(app);

// SOCKET IO
const io = new Server(server, {
  cors: { origin: "*" },
});

connectDB();

// SOCKET HANDLERS
require("./socket")(io);

const PORT = process.env.SOCKET_PORT || 8000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Socket server working on port:", PORT);
});
