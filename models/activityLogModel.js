import mongoose from "mongoose"

const activityLogSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      required: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "LOGIN",
        "LOGOUT",
        "VIEW",
        "EXPORT",
        "IMPORT",
        "STATUS_CHANGE",
        "PERMISSION_CHANGE",
        "BULK_ACTION",
        "OTHER",
      ],
    },
    module: {
      type: String,
      required: true,
      enum: [
        "PRODUCTS",
        "CATEGORIES",
        "SUBCATEGORIES",
        "BRANDS",
        "ORDERS",
        "USERS",
        "REVIEWS",
        "BLOGS",
        "BANNERS",
        "HOME_SECTIONS",
        "OFFER_PAGES",
        "GAMING_ZONE",
        "COUPONS",
        "DELIVERY_CHARGES",
        "SETTINGS",
        "EMAIL_TEMPLATES",
        "NEWSLETTER",
        "REQUEST_CALLBACKS",
        "BULK_PURCHASE",
        "BUYER_PROTECTION",
        "STOCK_ADJUSTMENT",
        "SEO_SETTINGS",
        "CACHE",
        "VOLUMES",
        "WARRANTY",
        "COLORS",
        "UNITS",
        "TAX",
        "SIZES",
        "ADMIN_MANAGEMENT",
        "AUTH",
        "PERMISSIONS",
        "OTHER",
      ],
    },
    description: {
      type: String,
      required: true,
    },
    targetId: {
      type: String,
    },
    targetName: {
      type: String,
    },
    previousData: {
      type: mongoose.Schema.Types.Mixed,
    },
    newData: {
      type: mongoose.Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
)

// Index for efficient querying
activityLogSchema.index({ user: 1, createdAt: -1 })
activityLogSchema.index({ module: 1, createdAt: -1 })
activityLogSchema.index({ action: 1, createdAt: -1 })
activityLogSchema.index({ createdAt: -1 })

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema)

export default ActivityLog
