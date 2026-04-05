import mongoose from "mongoose"

const customSliderItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameAr: {
      type: String,
      default: "",
      trim: true,
    },
    image: {
      type: String,
      required: true,
    },
    redirectUrl: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model("CustomSliderItem", customSliderItemSchema)
