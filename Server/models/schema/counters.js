import mongoose from "mongoose";

const CounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    refId: { type: String, required: true, index: true }, /// productId, commentId, userId, orderId, etc
    userId: { type: String, required: true, index: true },
    type: { type: String, default: null },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    strict: true,
  },
);

CounterSchema.index({ refId: 1, userId: 1 }, { unique: true });

const CounterModel = mongoose.model("Counter", CounterSchema, "counters");

export { CounterModel, CounterSchema };
