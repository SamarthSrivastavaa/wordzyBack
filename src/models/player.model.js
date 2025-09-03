import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";

const playerSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  gamesPlayed: { type: Number, default: 0 },
  gamesWon: { type: Number, default: 0 },
  gamesLost: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 }
}, { timestamps: true });

playerSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    next(err);
  }
});

playerSchema.methods.isPasswordCorrect = async function(password) {
  return await bcrypt.compare(password, this.password);
};

const Player = mongoose.model("Player", playerSchema);
export default Player;