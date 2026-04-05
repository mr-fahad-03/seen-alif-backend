import mongoose from "mongoose"

const bannerSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    subtitle: {
      type: String,
    },
    description: {
      type: String,
    },
    image: {
      type: String,
      required: true,
    },
    backgroundImage: {
      type: String,
    },
    buttonText: {
      type: String,
      default: "Shop Now",
    },
    buttonLink: {
      type: String,
      default: "/shop",
    },
    position: {
      type: String,
      required: true,
      enum: [
        "hero",
        "category",
        "promotional",
        "footer",
        "home-top-triple",
        "home-brand-single",
        "home-brand-dual",
        "home-category-banner",
        "home-custom"
      ],
      default: "hero",
    },
    section: {
      type: String,
      // Used to group banners by specific sections on home page
      // e.g., "hp-section", "dell-section", "accessories-section", etc.
    },
    link: {
      type: String,
      // Direct link for the banner (alternative to buttonLink)
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: function () {
        return this.position === "category"
      },
    },
    discount: {
      type: Number,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    deviceType: {
      type: String,
      enum: ["desktop", "mobile"],
      default: "desktop",
    },
    validFrom: {
      type: Date,
      default: Date.now,
    },
    validUntil: {
      type: Date,
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

const Banner = mongoose.model("Banner", bannerSchema)

export default Banner
