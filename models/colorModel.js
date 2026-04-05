import mongoose from "mongoose"

const colorSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    hexCode: {
      type: String,
      required: true,
      match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
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

const Color = mongoose.model("Color", colorSchema)

export default Color
