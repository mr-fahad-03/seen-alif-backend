import mongoose from "mongoose"

const redirectSchema = new mongoose.Schema(
  {
    redirectFrom: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    redirectTo: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    redirectType: {
      type: String,
      required: true,
      enum: ["301", "302", "307", "308"],
      default: "301",
    },
    status: {
      type: String,
      required: true,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    description: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
)

// Index for better query performance
redirectSchema.index({ redirectFrom: 1 })
redirectSchema.index({ status: 1 })

const Redirect = mongoose.model("Redirect", redirectSchema)

export default Redirect
