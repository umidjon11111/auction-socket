// models/lot.model.js - YANGILANGAN
const mongoose = require("mongoose");

const lotSchema = new mongoose.Schema(
  {
    imei: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    title: { type: String, required: true },
    description: String,
    images: [String],
    type: { type: String, enum: ["auction", "fixed"], default: "auction" },
    phones: [String],
    city: { type: String, index: true },

    // Auction fields
    startPrice: { type: Number, default: 0 },
    step: { type: Number, default: 10000 },
    buyNow: { type: Number, default: null },
    highestBid: { type: Number, default: 0 },
    highestBidder: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      default: null,
    },
    highestBidderArray: [
      {
        type: mongoose.Types.ObjectId,
        ref: "User",
      },
    ],
    bidsCount: { type: Number, default: 0 },
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

    // ✅ LIVE AUCTION FIELDLARI
    isLive: {
      type: Boolean,
      default: false,
      index: true,
    },
    liveStartedAt: {
      type: Date,
      default: null,
    },
    liveEndedAt: {
      type: Date,
      default: null,
    },
    liveViewers: {
      type: Number,
      default: 0,
    },
    liveDuration: {
      type: Number, // seconds
      default: 900, // 15 minutes default
    },

    // Live price settings (narxni belgilash)
    liveStartPrice: {
      type: Number,
      default: null,
    },
    liveStep: {
      type: Number,
      default: null,
    },
    liveBuyNow: {
      type: Number,
      default: null,
    },

    // Live restriction (24 soat kutish)
    lastLiveEndedAt: {
      type: Date,
      default: null,
    },
    liveCount: {
      type: Number,
      default: 0,
    },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes
lotSchema.index({ endAt: 1 });
lotSchema.index({ status: 1 });
lotSchema.index({ user: 1 });
lotSchema.index({ isLive: 1 });
lotSchema.index({ liveStartedAt: -1 });

// ✅ METHOD: Live boshlash mumkinligini tekshirish
lotSchema.methods.canStartLive = function () {
  // Agar hech qachon live qilinmagan bo'lsa
  if (!this.lastLiveEndedAt) return true;

  // 24 soat o'tganini tekshirish
  const now = new Date();
  const hoursSinceLastLive = (now - this.lastLiveEndedAt) / (1000 * 60 * 60);

  return hoursSinceLastLive >= 24;
};

// ✅ METHOD: Live qolgan vaqtni hisoblash
lotSchema.methods.getLiveTimeRemaining = function () {
  if (!this.isLive || !this.liveStartedAt) return 0;

  const now = new Date();
  const elapsedSeconds = Math.floor((now - this.liveStartedAt) / 1000);
  const remaining = this.liveDuration - elapsedSeconds;

  return Math.max(0, remaining);
};

module.exports = mongoose.model("Lot", lotSchema);
