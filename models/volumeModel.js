import mongoose from "mongoose"

const volumeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      required: true,
    },
    unit: {
      type: String,
      required: true,
      enum: ["ml", "L", "g", "kg", "oz", "lb"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
)

const Volume = mongoose.model("Volume", volumeSchema)

export default Volume
