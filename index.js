const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
dotenv.config();
const server = http.createServer();

const io = new Server(server, {
  cors: { origin: "*" },
});
connectDB();
// SOCKET HANDLERS
require("./socket")(io);

const PORT = process.env.SOCKET_PORT || 8000;

server.listen(PORT, () => {
  console.log("Socket server working on port:", PORT);
});
