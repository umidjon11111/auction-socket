const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    lot: { type: mongoose.Schema.Types.ObjectId, ref: "Lot", default: null },
  },
  { timestamps: true }
);

chatSchema.index({ members: 1 });

module.exports = mongoose.model("Chat", chatSchema);
