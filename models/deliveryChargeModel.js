import mongoose from "mongoose"

const deliveryChargeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    charge: {
      type: Number,
      required: true,
      min: 0,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxOrderAmount: {
      type: Number,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    applicableAreas: [
      {
        type: String,
        trim: true,
      },
    ],
    deliveryTime: {
      type: String,
      default: "1-2 business days",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
)

const DeliveryCharge = mongoose.model("DeliveryCharge", deliveryChargeSchema)

export default DeliveryCharge
