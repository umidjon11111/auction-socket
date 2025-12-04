const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.DB_URI);

    console.log(`MongoDB ulandi: ${conn.connection.host}`);
  } catch (error) {
    console.error("MongoDB ulanishida xatolik:", error.message);
    process.exit(1); // serverni to'xtatadi (bu production uchun kerak)
  }
};

module.exports = connectDB;
