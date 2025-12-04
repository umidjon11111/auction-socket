const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    imei: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^[0-9]{15}$/, // Faqat 15 xonali IMEI raqam
    },

    title: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },

    category: { type: String, index: true },
    brand: { type: String, index: true },
    city: { type: String, index: true },

    images: [String],
    condition: { type: String, enum: ["new", "used"], default: "used" },

    user: { type: mongoose.Types.ObjectId, ref: "User", required: true },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// Indexlar
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ city: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });

// IMEI index — juda tez qidirish uchun
productSchema.index({ imei: 1 });

module.exports = mongoose.model("Product", productSchema);
