import mongoose from "mongoose"

const reviewVerificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    verificationCode: {
      type: String,
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    reviewData: {
      rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
      },
      comment: {
        type: String,
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      image: {
        type: String,
        required: false,
      },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    },
    verifiedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
)

// Create index for automatic cleanup of expired documents
reviewVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Method to generate verification code
reviewVerificationSchema.methods.generateVerificationCode = function () {
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  this.verificationCode = code
  this.expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  return code
}

// Method to verify code
reviewVerificationSchema.methods.verifyCode = function (code) {
  if (this.isVerified) {
    return false // Already verified
  }

  if (new Date() > this.expiresAt) {
    return false // Expired
  }

  return this.verificationCode === code
}

const ReviewVerification = mongoose.model("ReviewVerification", reviewVerificationSchema)

export default ReviewVerification
