const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    avatar: { type: String },
    phone: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    lastAdMonth: { type: Number, default: null },
    lastAdYear: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
