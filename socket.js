// socket.js - TO'LIQ LIVE AUCTION TIZIMI
const Lot = require("./models/lot.model");
const Bid = require("./models/bid.model");
const Notification = require("./models/notification");
const messageModel = require("./models/message.model");
const chatModel = require("./models/chat.model");
const userModel = require("./models/user.model");
const SoldLot = require("./models/soldLot.model");
const sendNotification = require("./utils/sendNotification");
const job = require("./job");

let lastNotificationTime = null;
let onlineUsers = new Set();
let liveRooms = new Map(); // Live auction rooms
job.start();

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
       🕒 LOT TIME WATCHER — VAQTI TUGAGAN LOT → SOLD
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
          lot.status = "ended";
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
          }" lotini ${lot.highestBid.toLocaleString()} so'mga yutib oldingiz.`,
          { lotId: lot._id }
        );

        io.emit("userWonAuction", {
          userId: lot.highestBidder.toString(),
          lotId: lot._id.toString(),
          amount: lot.highestBid,
          title: lot.title,
        });
      }
    } catch (err) {
      console.log("LOT TIMER ERROR:", err);
    }
  }, 3000);

  /* =========================================================
       🎥 LIVE AUCTION TIMER - 15 MINUT WATCHER
  ========================================================== */

  setInterval(async () => {
    try {
      const now = new Date();

      // Barcha active live lotlarni tekshirish
      const activeLives = await Lot.find({
        isLive: true,
        liveStartedAt: { $ne: null },
      });

      for (const lot of activeLives) {
        const timeRemaining = lot.getLiveTimeRemaining();

        if (timeRemaining <= 0) {
          // ✅ 15 minut tugadi - Live ni to'xtatish
          console.log(`⏱️ Live ended for lot ${lot._id} - Time's up!`);

          lot.isLive = false;
          lot.liveEndedAt = now;
          lot.lastLiveEndedAt = now; // 24 soat kutish uchun
          lot.liveViewers = 0;

          // ✅ Agar kim yutgan bo'lsa → SOLD
          if (lot.highestBidder) {
            lot.status = "sold";

            // SoldLot yaratish
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
                step: lot.liveStep || lot.step,
                buyNow: lot.liveBuyNow || lot.buyNow,
                notified: false,
              });
            }

            // Notification yuborish
            await sendNotification(
              lot.highestBidder.toString(),
              "🎉 Live Auction yutdingiz!",
              `Siz "${
                lot.title
              }" lotini live auksionda ${lot.highestBid.toLocaleString()} so'mga yutib oldingiz.`,
              { lotId: lot._id }
            );

            console.log(`✅ Lot ${lot._id} sold to ${lot.highestBidder}`);
          } else {
            // ✅ Hech kim yutmagan → Lot egasida qoladi
            lot.status = "active"; // Qayta active
            console.log(`⚠️ Lot ${lot._id} - No winner, returned to owner`);
          }

          await lot.save();

          // Socket orqali barcha viewerlarga xabar
          const roomId = `live_${lot._id}`;
          io.to(roomId).emit("live-ended", {
            lotId: lot._id.toString(),
            winner: lot.highestBidder?.toString() || null,
            amount: lot.highestBid || 0,
            reason: "time_up",
          });

          // Room ni tozalash
          liveRooms.delete(roomId);
        } else if (timeRemaining <= 60) {
          // ✅ 1 minut qolganda warning
          const roomId = `live_${lot._id}`;
          io.to(roomId).emit("live-time-warning", {
            lotId: lot._id.toString(),
            timeRemaining,
            message: "Live auksion 1 minut ichida tugaydi!",
          });
        }
      }
    } catch (err) {
      console.error("LIVE TIMER ERROR:", err);
    }
  }, 1000); // Har 1 soniyada tekshirish

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
        const lot = await Lot.findById(lotId);
        if (!lot) return;

        socket.emit("auctionState", {
          highestBid: lot.highestBid,
          highestBidder: lot.highestBidder,
          bidsCount: lot.bidsCount || 0,
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
            message: "Sotuvchi o'z lotiga bid bera olmaydi.",
          });
        }

        // ✅ Live mode uchun narx tekshirish
        const currentStep = lot.isLive ? lot.liveStep || lot.step : lot.step;
        const minRequired =
          Math.max(
            lot.isLive ? lot.liveStartPrice || lot.startPrice : lot.startPrice,
            lot.highestBid || 0
          ) + currentStep;

        if (amount < minRequired) {
          return socket.emit("bidError", {
            message: `Minimal bid ${minRequired.toLocaleString()} so'm bo'lishi kerak.`,
          });
        }

        /* ======================== BUY NOW → SOLD ======================== */
        const buyNowPrice = lot.isLive
          ? lot.liveBuyNow || lot.buyNow
          : lot.buyNow;
        if (buyNowPrice && amount >= buyNowPrice) {
          lot.highestBid = amount;
          lot.highestBidder = userId;

          if (!Array.isArray(lot.highestBidderArray))
            lot.highestBidderArray = [];

          if (!lot.highestBidderArray.includes(userId)) {
            lot.highestBidderArray.push(userId);
          }

          lot.status = "sold";

          // ✅ Agar live bo'lsa, live ni ham to'xtatish
          if (lot.isLive) {
            lot.isLive = false;
            lot.liveEndedAt = new Date();
            lot.lastLiveEndedAt = new Date();
            lot.liveViewers = 0;
          }

          await lot.save();

          await Bid.create({ lot: lotId, user: userId, amount });

          io.to(`lot_${lotId}`).emit("auctionEnded", {
            lotId,
            winner: userId,
            amount,
          });

          // ✅ Live room dan ham xabar
          if (lot.isLive) {
            io.to(`live_${lotId}`).emit("live-ended", {
              lotId,
              winner: userId,
              amount,
              reason: "buy_now",
            });
          }

          return;
        }

        /* ======================== USER ALREADY BIDDED ======================== */
        const existingBid = await Bid.findOne({ lot: lotId, user: userId });

        if (existingBid) {
          existingBid.amount = amount;
          existingBid.createdAt = new Date();
          await existingBid.save();

          lot.highestBid = amount;
          lot.highestBidder = userId;

          if (!Array.isArray(lot.highestBidderArray))
            lot.highestBidderArray = [];

          if (!lot.highestBidderArray.includes(userId)) {
            lot.highestBidderArray.push(userId);
          }

          await lot.save();

          io.to(`lot_${lotId}`).emit("newHighestBid", {
            lotId,
            amount,
            userId,
            highestBidderArray: lot.highestBidderArray,
          });

          // ✅ Live room ga ham yuborish
          if (lot.isLive) {
            io.to(`live_${lotId}`).emit("live-new-bid", {
              lotId,
              amount,
              userId,
              highestBidderArray: lot.highestBidderArray,
            });
          }

          return;
        }

        /* ========================= NEW BID ============================ */
        await Bid.create({ lot: lotId, user: userId, amount });

        lot.highestBid = amount;
        lot.highestBidder = userId;
        lot.bidsCount = (lot.bidsCount || 0) + 1;

        if (!Array.isArray(lot.highestBidderArray)) lot.highestBidderArray = [];

        if (!lot.highestBidderArray.includes(userId)) {
          lot.highestBidderArray.push(userId);
        }

        await lot.save();

        io.to(`lot_${lotId}`).emit("bidsCountUpdated", {
          lotId,
          bidsCount: lot.bidsCount,
        });

        io.to(`lot_${lotId}`).emit("newHighestBid", {
          lotId,
          amount,
          userId,
          highestBidderArray: lot.highestBidderArray,
        });

        // ✅ Live room ga ham yuborish
        if (lot.isLive) {
          io.to(`live_${lotId}`).emit("live-new-bid", {
            lotId,
            amount,
            userId,
            highestBidderArray: lot.highestBidderArray,
          });
        }
      } catch (err) {
        console.error("placeBid error:", err);
        socket.emit("bidError", { message: "Server xatosi" });
      }
    });

    socket.on("leaveAuction", ({ lotId }) => {
      socket.leave(`lot_${lotId}`);
    });

    /* ===================================================================
         🎥 LIVE AUCTION EVENTS
    =================================================================== */

    /* ======================== START LIVE ======================== */
    socket.on("start-live", async ({ lotId, userId, liveSettings }) => {
      try {
        const lot = await Lot.findById(lotId).populate("user");

        if (!lot) {
          return socket.emit("live-error", { message: "Lot topilmadi" });
        }

        // ✅ Faqat lot egasi live boshlashi mumkin
        if (lot.user._id.toString() !== userId) {
          return socket.emit("live-error", {
            message: "Faqat lot egasi live boshlashi mumkin",
          });
        }

        // ✅ 24 soat tekshirish
        if (!lot.canStartLive()) {
          const hoursSince = Math.floor(
            (new Date() - lot.lastLiveEndedAt) / (1000 * 60 * 60)
          );
          return socket.emit("live-error", {
            message: `Live ni ${
              24 - hoursSince
            } soatdan keyin boshlashingiz mumkin`,
          });
        }

        // ✅ Live narxlarni belgilash
        if (liveSettings) {
          lot.liveStartPrice = liveSettings.startPrice || lot.startPrice;
          lot.liveStep = liveSettings.step || lot.step;
          lot.liveBuyNow = liveSettings.buyNow || lot.buyNow;
        }

        // ✅ Live ni boshlash
        lot.isLive = true;
        lot.liveStartedAt = new Date();
        lot.liveEndedAt = null;
        lot.liveViewers = 0;
        lot.liveCount = (lot.liveCount || 0) + 1;
        lot.liveDuration = 900; // 15 minut = 900 soniya

        await lot.save();

        const roomId = `live_${lotId}`;
        socket.join(roomId);

        liveRooms.set(roomId, {
          hostId: socket.id,
          userId,
          lotId,
          viewers: 0,
          startedAt: new Date(),
        });

        socket.emit("live-started", {
          roomId,
          lotId,
          duration: 900,
          startPrice: lot.liveStartPrice,
          step: lot.liveStep,
          buyNow: lot.liveBuyNow,
        });

        io.to(roomId).emit("viewer-count", { count: 0 });

        console.log(`🎥 Live started: ${roomId} by user ${userId}`);
      } catch (err) {
        console.error("start-live error:", err);
        socket.emit("live-error", { message: "Live boshlanmadi" });
      }
    });

    /* ======================== JOIN LIVE ======================== */
    socket.on("join-live", async ({ lotId }) => {
      try {
        const lot = await Lot.findById(lotId);

        if (!lot) {
          return socket.emit("live-error", { message: "Lot topilmadi" });
        }

        if (!lot.isLive) {
          return socket.emit("live-error", { message: "Live aktiv emas" });
        }

        const roomId = `live_${lotId}`;
        socket.join(roomId);

        lot.liveViewers = (lot.liveViewers || 0) + 1;
        await lot.save();

        const room = liveRooms.get(roomId);
        if (room) {
          room.viewers = lot.liveViewers;
        }

        socket.emit("joined-live", {
          roomId,
          lotId,
          timeRemaining: lot.getLiveTimeRemaining(),
          currentBid: lot.highestBid,
          highestBidder: lot.highestBidder,
          startPrice: lot.liveStartPrice,
          step: lot.liveStep,
          buyNow: lot.liveBuyNow,
        });

        io.to(roomId).emit("viewer-count", { count: lot.liveViewers });

        console.log(
          `👁️ User joined live: ${roomId}, viewers: ${lot.liveViewers}`
        );
      } catch (err) {
        console.error("join-live error:", err);
        socket.emit("live-error", { message: "Live ga qo'shilmadi" });
      }
    });

    /* ======================== END LIVE ======================== */
    socket.on("end-live", async ({ lotId }) => {
      try {
        const lot = await Lot.findById(lotId);

        if (!lot || !lot.isLive) {
          return socket.emit("live-error", { message: "Live aktiv emas" });
        }

        // Host tomonidan to'xtatish
        lot.isLive = false;
        lot.liveEndedAt = new Date();
        lot.lastLiveEndedAt = new Date();
        lot.liveViewers = 0;

        await lot.save();

        const roomId = `live_${lotId}`;
        io.to(roomId).emit("live-ended", {
          lotId,
          winner: lot.highestBidder?.toString() || null,
          amount: lot.highestBid || 0,
          reason: "host_ended",
        });

        liveRooms.delete(roomId);

        console.log(`⏹️ Live ended by host: ${roomId}`);
      } catch (err) {
        console.error("end-live error:", err);
        socket.emit("live-error", { message: "Live to'xtatilmadi" });
      }
    });

    /* ======================== LEAVE LIVE ======================== */
    socket.on("leave-live", async ({ lotId }) => {
      try {
        const roomId = `live_${lotId}`;
        socket.leave(roomId);

        const lot = await Lot.findById(lotId);
        if (lot && lot.isLive) {
          lot.liveViewers = Math.max(0, (lot.liveViewers || 0) - 1);
          await lot.save();

          io.to(roomId).emit("viewer-count", { count: lot.liveViewers });
        }

        console.log(`👋 User left live: ${roomId}`);
      } catch (err) {
        console.error("leave-live error:", err);
      }
    });
  });
};
