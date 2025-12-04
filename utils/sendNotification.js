const Notification = require("../models/notification");

module.exports = async function sendNotification(
  userId,
  title,
  message,
  data = {}
) {
  if (!userId) {
    console.log("❌ sendNotification: userId yo'q!");
    return;
  }

  try {
    await Notification.create({
      user: userId, // 🔥 MUHIM — REQUIRED FIELD
      title,
      message,
      data,
    });

    console.log("📩 Notification saved for user:", userId);
  } catch (err) {
    console.error("❌ Notification create error:", err);
  }
};
