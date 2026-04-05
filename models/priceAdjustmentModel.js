import mongoose from "mongoose"

const priceAdjustmentSchema = mongoose.Schema(
  {
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        productName: {
          type: String,
          required: true,
        },
        sku: {
          type: String,
        },
        // Previous prices
        previousPrice: {
          type: Number,
          required: true,
        },
        previousOfferPrice: {
          type: Number,
          default: 0,
        },
        // New prices
        newPrice: {
          type: Number,
          required: true,
        },
        newOfferPrice: {
          type: Number,
          default: 0,
        },
        // Price change details
        priceChange: {
          type: Number, // Difference in price
          required: true,
        },
        offerPriceChange: {
          type: Number, // Difference in offer price
          default: 0,
        },
        priceChangePercentage: {
          type: Number, // Percentage change in price
          required: true,
        },
        offerPriceChangePercentage: {
          type: Number, // Percentage change in offer price
          default: 0,
        },
      },
    ],
    adjustmentType: {
      type: String,
      required: true,
      enum: ["both", "base_only", "offer_only"], // both prices, base price only, offer price only
    },
    adjustmentMethod: {
      type: String,
      required: true,
      enum: ["percentage", "fixed_amount"], // percentage increase/decrease or fixed amount
    },
    adjustmentValue: {
      type: Number,
      required: true, // The percentage or fixed amount used for adjustment
    },
    totalProductsAffected: {
      type: Number,
      required: true,
    },
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    adjustedByName: {
      type: String,
      required: true,
    },
    notes: {
      type: String, // Optional notes about the adjustment
    },
    // Filter criteria used for the adjustment
    filterCriteria: {
      parentCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
      subCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubCategory",
      },
      brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Brand",
      },
      searchTerm: {
        type: String,
      },
    },
  },
  {
    timestamps: true,
  },
)

// Index for better query performance
priceAdjustmentSchema.index({ createdAt: -1 })
priceAdjustmentSchema.index({ adjustedBy: 1 })
priceAdjustmentSchema.index({ "products.productId": 1 })

const PriceAdjustment = mongoose.model("PriceAdjustment", priceAdjustmentSchema)

export default PriceAdjustment
