import mongoose from "mongoose"

const buyerProtectionSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["warranty", "damage_protection", "accidental_extended"],
    },
    duration: {
      type: String,
      required: true, // e.g., "1 YEAR", "2 YEARS"
    },
    // Pricing configuration
    pricingType: {
      type: String,
      required: true,
      enum: ["fixed", "percentage"],
      default: "fixed",
    },
    price: {
      type: Number,
      required: function() {
        return this.pricingType === "fixed"
      },
      default: 0,
    },
    pricePercentage: {
      type: Number,
      required: function() {
        return this.pricingType === "percentage"
      },
      min: 0,
      max: 100,
    },
    minPrice: {
      type: Number,
      default: 0, // Minimum price when using percentage
    },
    maxPrice: {
      type: Number,
      default: null, // Maximum price when using percentage (null = no limit)
    },
    // Application scope
    applicationType: {
      type: String,
      required: true,
      enum: ["all", "categories", "products"],
      default: "all",
    },
    // Category targeting
    parentCategories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    }],
    categories: [{ // Level 1 subcategories
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    }],
    subCategories2: [{ // Level 2 subcategories
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    }],
    subCategories3: [{ // Level 3 subcategories
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    }],
    subCategories4: [{ // Level 4 subcategories
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    }],
    // Product targeting
    specificProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    }],
    icon: {
      type: String, // URL or icon identifier
    },
    features: [
      {
        type: String,
      },
    ],
    description: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
)

const BuyerProtection = mongoose.model("BuyerProtection", buyerProtectionSchema)

export default BuyerProtection
