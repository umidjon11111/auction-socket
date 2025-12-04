const mongoose = require("mongoose");

const SoldLotSchema = new mongoose.Schema(
  {
    lot: { type: mongoose.Schema.Types.ObjectId, ref: "Lot", required: true },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: { type: Number, required: true },

    // Lotdan ko'chiriladigan ma'lumotlar
    title: String,
    images: [String],
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    imei: String,
    city: String,
    step: Number,
    buyNow: Number,

    // tugagan vaqt
    closedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SoldLot", SoldLotSchema);
