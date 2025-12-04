const Lot = require("./models/lot.model");
const Bid = require("./models/bid.model");
const Notification = require("./models/notification");
const messageModel = require("./models/message.model");
const chatModel = require("./models/chat.model");
const userModel = require("./models/user.model");
const SoldLot = require("./models/soldLot.model");
const sendNotification = require("./utils/sendNotification");

let lastNotificationTime = null;
let onlineUsers = new Set();

module.exports = (io) => {
  /* =========================================================
        🔔 ADMIN NOTIFICATION WATCHER
  ========================================================== */

  setInterval(async () => {
    try {
      if (!lastNotificationTime) {
        const newest = await Notification.findOne().sort({ createdAt: -1 });
        if (newest) lastNotificationTime = newest.createdAt;
        return;
      }

      const newNotes = await Notification.find({
        createdAt: { $gt: lastNotificationTime },
      }).sort({ createdAt: 1 });

      if (newNotes.length > 0) {
        lastNotificationTime = newNotes[newNotes.length - 1].createdAt;

        newNotes.forEach((note) => {
          io.emit("adminNotification", {
            id: note._id,
            title: note.title,
            body: note.body,
            message: note.message,
            data: note.data || null,
            createdAt: note.createdAt,
          });
        });
      }
    } catch (err) {
      console.error("Notification watcher error:", err);
    }
  }, 3000);

  /* =========================================================
       🕒 LOT TIME WATCHER
       (VAQTI TUGAGAN LOT → SOLD)
  ========================================================== */

  setInterval(async () => {
    try {
      const now = new Date();

      const expiredLots = await Lot.find({
        status: "active",
        endAt: { $lt: now },
      });

      for (const lot of expiredLots) {
        if (!lot.highestBidder) {
          lot.status = "ended"; // hech kim bid qilmagan
          await lot.save();
          continue;
        }

        lot.status = "sold";
        await lot.save();

        const exist = await SoldLot.findOne({ lot: lot._id });
        if (!exist) {
          await SoldLot.create({
            lot: lot._id,
            winner: lot.highestBidder,
            amount: lot.highestBid,
            title: lot.title,
            images: lot.images,
            category: lot.category,
            imei: lot.imei,
            city: lot.city,
            step: lot.step,
            buyNow: lot.buyNow,
            notified: false,
          });
        }

        await sendNotification(
          lot.highestBidder.toString(),
          "🎉 Tabriklaymiz!",
          `Siz "${
            lot.title
          }" lotini ${lot.highestBid.toLocaleString()} so‘mga yutib oldingiz.`,
          { lotId: lot._id }
        );

        io.emit("userWonAuction", {
          userId: lot.highestBidder.toString(),
          lotId: lot._id.toString(),
          amount: lot.highestBid,
          title: lot.title,
        });

        console.log("✔ LOT FINISHED:", lot.title);
      }
    } catch (err) {
      console.log("LOT TIMER ERROR:", err);
    }
  }, 3000);

  /* =========================================================
        🔥 SOCKET MAIN
  ========================================================== */

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    /* ========================== USER ONLINE ========================== */
    socket.on("userOnline", (userId) => {
      if (!userId) return;
      socket.userId = userId;
      onlineUsers.add(userId);
      io.emit("onlineUsers", Array.from(onlineUsers));
    });

    socket.on("disconnect", () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit("onlineUsers", Array.from(onlineUsers));
      }
      console.log("User disconnected:", socket.id);
    });

    /* ========================== JOIN CHAT ============================ */
    socket.on("joinChat", ({ chatId }) => {
      socket.join(`chat_${chatId}`);
    });

    /* ========================== SEND MESSAGE ========================= */
    socket.on("sendMessage", async ({ chatId, sender, text }) => {
      try {
        console.log(
          "New message in chat:",
          chatId,
          "from:",
          sender,
          "text:",
          text
        );

        const msg = await messageModel.create({
          chat: chatId,
          sender,
          text,
        });

        await chatModel.findByIdAndUpdate(chatId, {
          lastMessage: msg._id,
        });

        io.to(`chat_${chatId}`).emit("newMessage", {
          _id: msg._id,
          chatId,
          text,
          sender,
          createdAt: msg.createdAt,
        });

        const senderUser = await userModel
          .findById(sender)
          .select("name avatar");

        io.emit("newChatNotification", {
          senderId: sender,
          chatId,
          title: senderUser.name,
          body: text,
          senderName: senderUser.name,
          senderAvatar: senderUser.avatar,
        });
      } catch (err) {
        console.error("sendMessage error:", err);
      }
    });

    /* ========================== JOIN AUCTION ========================= */
    socket.on("joinAuction", async ({ lotId }) => {
      socket.join(`lot_${lotId}`);
      try {
        const lot = await Lot.findById(lotId).populate(
          "highestBidder",
          "phone"
        );
        if (!lot) return;

        socket.emit("auctionState", {
          highestBid: lot.highestBid,
          highestBidder: lot.highestBidder,
          endAt: lot.endAt,
          status: lot.status,
        });
      } catch (e) {
        console.error("joinAuction error:", e);
      }
    });

    /* ========================== PLACE BID ============================ */
    socket.on("placeBid", async ({ lotId, userId, amount }) => {
      try {
        const lot = await Lot.findById(lotId).populate("user");

        if (!lot || lot.status !== "active") {
          return socket.emit("bidError", {
            message: "Auksion mavjud emas yoki yopilgan.",
          });
        }

        if (lot.user._id.toString() === userId) {
          return socket.emit("bidError", {
            message: "Sotuvchi o‘z lotiga bid bera olmaydi.",
          });
        }

        const minRequired =
          Math.max(lot.startPrice, lot.highestBid || 0) + lot.step;

        if (amount < minRequired) {
          return socket.emit("bidError", {
            message: `Minimal bid ${minRequired} so'm bo'lishi kerak.`,
          });
        }

        /* ======================== BUY NOW → SOLD ======================== */
        if (lot.buyNow && amount >= lot.buyNow) {
          lot.highestBid = amount;
          lot.highestBidder = userId;
          lot.status = "sold";
          await lot.save();

          await Bid.create({ lot: lotId, user: userId, amount });

          const exist = await SoldLot.findOne({ lot: lot._id });
          if (!exist) {
            await SoldLot.create({
              lot: lot._id,
              winner: userId,
              amount,
              title: lot.title,
              images: lot.images,
              category: lot.category,
              imei: lot.imei,
              city: lot.city,
              step: lot.step,
              buyNow: lot.buyNow,
              notified: false,
            });
          }

          await sendNotification(
            userId,
            "🎉 Tabriklaymiz!",
            `Siz "${
              lot.title
            }" lotini ${amount.toLocaleString()} so‘mga yutib oldingiz!`,
            { lotId: lot._id }
          );

          io.to(`lot_${lotId}`).emit("auctionEnded", {
            lotId,
            winner: userId,
            amount,
          });

          io.emit("userWonAuction", {
            userId,
            lotId,
            title: lot.title,
            amount,
          });

          return;
        }

        // 🔁 USER OLDIN BID QILGAN HOLAT – TUZATILGAN QISMI
        const existingBid = await Bid.findOne({
          lot: lotId,
          user: userId,
        });

        if (existingBid) {
          existingBid.amount = amount;
          existingBid.createdAt = new Date();
          await existingBid.save();

          lot.highestBid = amount;
          lot.highestBidder = userId;
          await lot.save();

          io.to(`lot_${lotId}`).emit("newHighestBid", {
            lotId,
            amount,
            userId,
          });

          return;
        }

        /* ========================= YANGI BID ============================ */
        await Bid.create({ lot: lotId, user: userId, amount });

        lot.highestBid = amount;
        lot.highestBidder = userId;
        await lot.save();

        io.to(`lot_${lotId}`).emit("newHighestBid", {
          lotId,
          amount,
          userId,
        });
      } catch (err) {
        console.error("placeBid error:", err);
        socket.emit("bidError", { message: "Server xatosi" });
      }
    });

    socket.on("leaveAuction", ({ lotId }) => {
      socket.leave(`lot_${lotId}`);
    });
  });
};
