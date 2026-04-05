import mongoose from "mongoose"

const bulkPurchaseSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    company: {
      type: String,
      required: true,
    },
    note: {
      type: String,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["pending", "contacted", "done", "spam"],
      default: "pending",
    },
    otpCode: {
      type: String,
    },
    otpExpires: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
)

// Method to generate OTP code
bulkPurchaseSchema.methods.generateOTP = function () {
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString()

  // Set code and expiration (10 minutes)
  this.otpCode = code
  this.otpExpires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  return code
}

// Method to verify OTP code
bulkPurchaseSchema.methods.verifyOTP = function (code) {
  if (!this.otpCode || !this.otpExpires) {
    return false
  }

  // Check if code has expired
  if (new Date() > this.otpExpires) {
    return false
  }

  // Check if code matches
  return this.otpCode === code
}

const BulkPurchase = mongoose.model("BulkPurchase", bulkPurchaseSchema)

export default BulkPurchase
