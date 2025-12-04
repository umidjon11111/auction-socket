module.exports = function (io) {
  io.on("connection", (socket) => {
    socket.on("joinChat", (chatId) => {
      socket.join(chatId);
    });

    socket.on("sendMessage", (data) => {
      io.to(data.chatId).emit("newMessage", data);
    });
  });
};
