// models/bid.model.js
const mongoose = require("mongoose");

const bidSchema = new mongoose.Schema({
  lot: {
    type: mongoose.Types.ObjectId,
    ref: "Lot",
    required: true,
    index: true,
  },
  user: { type: mongoose.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

bidSchema.index({ lot: 1, amount: -1 });
module.exports = mongoose.model("Bid", bidSchema);
