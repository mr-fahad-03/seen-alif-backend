import mongoose from "mongoose"

const warrantySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    durationType: {
      type: String,
      required: true,
      enum: ["days", "months", "years"],
      default: "months",
    },
    description: {
      type: String,
      trim: true,
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

const Warranty = mongoose.model("Warranty", warrantySchema)

export default Warranty
