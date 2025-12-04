// models/lot.model.js
const mongoose = require("mongoose");

const lotSchema = new mongoose.Schema(
  {
    imei: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    category: { type: String, index: true },
    title: { type: String, required: true },
    description: String,
    images: [String],
    type: { type: String, enum: ["auction", "fixed"], default: "auction" },
    brand: { type: String, index: true },
    city: { type: String, index: true },
    // auction fields
    startPrice: { type: Number, default: 0 },
    step: { type: Number, default: 10000 },
    buyNow: { type: Number, default: null }, // optional
    highestBid: { type: Number, default: 0 },
    highestBidder: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      default: null,
    },

    user: { type: mongoose.Types.ObjectId, ref: "User", required: true },
    endAt: {
      type: Date,
      required: function () {
        return this.type === "auction";
      },
    },

    status: {
      type: String,
      enum: ["active", "ended", "sold", "canceled"],
      default: "active",
    },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes for queries
lotSchema.index({ endAt: 1 });
lotSchema.index({ status: 1 });
lotSchema.index({ user: 1 });

module.exports = mongoose.model("Lot", lotSchema);
