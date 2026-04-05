
import mongoose from "mongoose"

const productSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    nameAr: {
      type: String,
      default: "",
    },
    sku: {
      type: String,
      unique: true,
      sparse: true, // allows null/undefined values but ensures non-null values are unique
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
    },
    barcode: {
      type: String,
      unique: true,
      sparse: true, // allows null/undefined values but ensures non-null values are unique
    },
    gtin: {
      type: String,
      unique: true,
      sparse: true, // GTIN number for Google Merchant feed
    },
    stockStatus: {
      type: String,
      required: true,
      default: "In Stock",
      enum: ["In Stock", "Out of Stock", "PreOrder"],
    },
    stockStatusAr: {
      type: String,
      default: "",
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },
    // Main category (shown in navbar)
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    // Subcategory Level 1 (shown in dropdown)
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    // Subcategory Level 2 (optional)
    subCategory2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    // Subcategory Level 3 (optional)
    subCategory3: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    // Subcategory Level 4 (optional)
    subCategory4: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    // Keep old category field for backward compatibility
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    description: {
      type: String,
      required: true,
    },
    descriptionAr: {
      type: String,
      default: "",
    },
    shortDescription: {
      type: String,
    },
    shortDescriptionAr: {
      type: String,
      default: "",
    },
    buyingPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    offerPrice: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    oldPrice: {
      type: Number,
    },
    image: {
      type: String,
    },
    galleryImages: [
      {
        type: String,
      },
    ],
    video: {
      type: String,
    },
    videoGallery: [
      {
        type: String,
      },
    ],
    countInStock: {
      type: Number,
      required: true,
      default: 0,
    },
    lowStockWarning: {
      type: Number,
      default: 5,
    },
    maxPurchaseQty: {
      type: Number,
      default: 10,
    },
    weight: {
      type: Number,
      default: 0,
    },
    unit: {
      type: String,
      default: "piece",
    },
    tax: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tax",
    },
    deliveryCharge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryCharge",
    },
    tags: [
      {
        type: String,
      },
    ],
    tagsAr: [
      {
        type: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    onHold: {
      type: Boolean,
      default: false,
    },
    canPurchase: {
      type: Boolean,
      default: true,
    },
    showStockOut: {
      type: Boolean,
      default: true,
    },
    refundable: {
      type: Boolean,
      default: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    hideFromShop: {
      type: Boolean,
      default: false,
    },
    rating: {
      type: Number,
      default: 0,
    },
    numReviews: {
      type: Number,
      default: 0,
    },
    specifications: [
      {
        key: { type: String },
        keyAr: { type: String, default: "" },
        value: { type: String },
        valueAr: { type: String, default: "" },
      },
    ],
    reviews: [
      {
        name: { type: String, required: true },
        rating: { type: Number, required: true },
        comment: { type: String, required: true },
        user: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: "User",
        },
      },
      {
        timestamps: true,
      },
    ],
    variations: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        variationText: {
          type: String,
          default: "",
        },
        variationTextAr: {
          type: String,
          default: "",
        },
      },
    ],
    reverseVariationText: {
      type: String,
      default: "",
    },
    reverseVariationTextAr: {
      type: String,
      default: "",
    },
    // The label for this product when shown in variation lists (e.g., "16GB RAM", "24GB RAM")
    selfVariationText: {
      type: String,
      default: "",
    },
    selfVariationTextAr: {
      type: String,
      default: "",
    },
    colorVariations: [
      {
        color: {
          type: String,
          default: "",
        },
        image: {
          type: String,
          default: "",
        },
        galleryImages: [
          {
            type: String,
          },
        ],
        buyingPrice: {
          type: Number,
          default: 0,
        },
        price: {
          type: Number,
          default: 0,
        },
        offerPrice: {
          type: Number,
          default: 0,
        },
        sku: {
          type: String,
          default: "",
        },
        countInStock: {
          type: Number,
          default: 0,
        },
      },
    ],
    currentProductColor: {
      type: String,
      default: "",
    },
    dosVariations: [
      {
        dosType: {
          type: String,
          default: "",
        },
        image: {
          type: String,
          default: "",
        },
        galleryImages: [
          {
            type: String,
          },
        ],
        buyingPrice: {
          type: Number,
          default: 0,
        },
        price: {
          type: Number,
          default: 0,
        },
        offerPrice: {
          type: Number,
          default: 0,
        },
        sku: {
          type: String,
          default: "",
        },
        countInStock: {
          type: Number,
          default: 0,
        },
      },
    ],
    // SEO Fields (only used for meta tags, not displayed on frontend)
    seoTitle: {
      type: String,
      default: "",
    },
    seoDescription: {
      type: String,
      default: "",
    },
    seoKeywords: {
      type: String,
      default: "",
    },
    seoCanonicalUrl: {
      type: String,
      default: "",
    },
    seoRobots: {
      type: String,
      default: "index, follow",
      enum: ["index, follow", "noindex, follow", "index, nofollow", "noindex, nofollow"],
    },
    customSchema: {
      type: String,
      default: "",
    },
    ogTitle: {
      type: String,
      default: "",
    },
    ogDescription: {
      type: String,
      default: "",
    },
    ogImage: {
      type: String,
      default: "",
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

const Product = mongoose.model("Product", productSchema)

export default Product
