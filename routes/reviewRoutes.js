import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs/promises"
import { fileURLToPath } from "url"
import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import Review from "../models/reviewModel.js"
import ReviewVerification from "../models/reviewVerificationModel.js"
import Product from "../models/productModel.js"
import User from "../models/userModel.js"
import Order from "../models/orderModel.js"
import { protect } from "../middleware/authMiddleware.js"
import { sendReviewVerificationEmail } from "../utils/emailService.js"
import { updateProductReviewStats } from "../utils/reviewUtils.js"

const router = express.Router()

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../uploads/reviews")

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(uploadsDir, { recursive: true })
      cb(null, uploadsDir)
    } catch (error) {
      cb(error)
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, "review-" + uniqueSuffix + path.extname(file.originalname))
  },
})

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true)
  } else {
    cb(new Error("Only image files are allowed"), false)
  }
}

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
})

// Optional auth middleware (allows both authenticated and guest users)
const optionalAuth = async (req, res, next) => {
  let token

  try {
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1]

      // Check if token is properly formatted
      if (token && token !== "null" && token !== "undefined") {
        try {
          // Verify JWT token
          const decoded = jwt.verify(token, process.env.JWT_SECRET)

          // Find user
          const user = await User.findById(decoded.id).select("-password")

          if (user) {
            req.user = user
          }
        } catch (error) {
          // Don't throw error, just continue without user
        }
      }
    }

    // Always continue, whether user is authenticated or not
    next()
  } catch (error) {
    // Continue without authentication
    next()
  }
}

// POST /api/reviews - Submit a new review
router.post("/", optionalAuth, upload.single("image"), async (req, res) => {
  try {
    const { productId, rating, comment, name, email } = req.body

    // Validate required fields
    if (!productId || !rating || !comment) {
      return res.status(400).json({
        message: "Product ID, rating, and comment are required",
      })
    }

    // Check if product exists
    const product = await Product.findById(productId)
    if (!product) {
      return res.status(404).json({ message: "Product not found" })
    }

    const reviewData = {
      product: productId,
      rating: Number.parseInt(rating),
      comment: comment.trim(),
    }

    // If user is logged in
    if (req.user) {
      const user = await User.findById(req.user.id || req.user._id)
      reviewData.user = req.user.id || req.user._id
      reviewData.name = user.name
      reviewData.email = user.email

      // Check if user has purchased this product
      const hasPurchased = await Order.findOne({
        user: req.user.id || req.user._id,
        "orderItems.product": productId,
        orderStatus: "delivered",
      })

      if (hasPurchased) {
        reviewData.isVerifiedPurchase = true
      }

      // Check if user already reviewed this product
      const existingReview = await Review.findOne({
        product: productId,
        user: req.user.id || req.user._id,
      })

      if (existingReview) {
        return res.status(400).json({
          message: "You have already reviewed this product",
        })
      }

      // Add image if uploaded
      if (req.file) {
        reviewData.image = req.file.filename
      }

      reviewData.status = "approved"
      reviewData.approvedAt = new Date()

      const review = new Review(reviewData)
      await review.save()

      try {
        await updateProductReviewStats(productId)
        console.log(`[ReviewRoutes] Updated product stats after review approval for product: ${productId}`)
      } catch (error) {
        console.error(`[ReviewRoutes] Failed to update product stats:`, error)
        // Don't fail the request if stats update fails
      }

      res.status(201).json({
        message: "Review submitted and published successfully!",
        review: {
          id: review._id,
          status: review.status,
        },
      })
    } else {
      // Guest user - requires email verification
      if (!name || !email) {
        return res.status(400).json({
          message: "Name and email are required for guest reviews",
        })
      }

      const verificationData = {
        email: email.trim().toLowerCase(),
        productId: productId,
        reviewData: {
          rating: Number.parseInt(rating),
          comment: comment.trim(),
          name: name.trim(),
          image: req.file ? req.file.filename : null,
        },
      }

      // Check if there's already a pending verification for this email and product
      const existingVerification = await ReviewVerification.findOne({
        email: verificationData.email,
        productId: productId,
        isVerified: false,
      })

      let verification
      if (existingVerification) {
        // Update existing verification
        existingVerification.reviewData = verificationData.reviewData
        const code = existingVerification.generateVerificationCode()
        verification = await existingVerification.save()
      } else {
        // Create new verification
        verification = new ReviewVerification(verificationData)
        const code = verification.generateVerificationCode()
        verification = await verification.save()
      }

      // Send verification email
      try {
        await sendReviewVerificationEmail(
          verificationData.email,
          verificationData.reviewData.name,
          verification.verificationCode,
          product.name,
          verificationData.reviewData.rating,
          verificationData.reviewData.comment,
        )

        res.status(201).json({
          message: "Please check your email and enter the verification code to publish your review.",
          verificationId: verification._id,
          requiresVerification: true,
        })
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError)
        // Clean up verification record if email fails
        await ReviewVerification.findByIdAndDelete(verification._id)

        // Delete uploaded file if there was an error
        if (req.file) {
          try {
            await fs.unlink(req.file.path)
          } catch (unlinkError) {
            console.error("Error deleting uploaded file:", unlinkError)
          }
        }

        res.status(500).json({
          message: "Failed to send verification email. Please try again.",
        })
      }
    }
  } catch (error) {
    console.error("Error submitting review:", error)

    // Delete uploaded file if there was an error
    if (req.file) {
      try {
        await fs.unlink(req.file.path)
      } catch (unlinkError) {
        console.error("Error deleting uploaded file:", unlinkError)
      }
    }

    res.status(500).json({ message: "Error submitting review" })
  }
})

// POST /api/reviews/verify-email - Verify guest review email
router.post("/verify-email", async (req, res) => {
  try {
    const { verificationId, code } = req.body

    if (!verificationId || !code) {
      return res.status(400).json({
        message: "Verification ID and code are required",
      })
    }

    // Find verification record
    const verification = await ReviewVerification.findById(verificationId)
    if (!verification) {
      return res.status(404).json({
        message: "Verification record not found",
      })
    }

    // Check if already verified
    if (verification.isVerified) {
      return res.status(400).json({
        message: "This review has already been verified",
      })
    }

    // Verify the code
    if (!verification.verifyCode(code)) {
      return res.status(400).json({
        message: "Invalid or expired verification code",
      })
    }

    // Get product info
    const product = await Product.findById(verification.productId)
    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      })
    }

    // Create the review with approved status
    const reviewData = {
      product: verification.productId,
      name: verification.reviewData.name,
      email: verification.email,
      rating: verification.reviewData.rating,
      comment: verification.reviewData.comment,
      image: verification.reviewData.image,
      status: "approved", // Guest reviews are auto-approved after email verification
      approvedAt: new Date(),
      isVerifiedPurchase: false,
    }

    const review = new Review(reviewData)
    await review.save()

    // Mark verification as completed
    verification.isVerified = true
    verification.verifiedAt = new Date()
    await verification.save()

    try {
      await updateProductReviewStats(verification.productId)
      console.log(
        `[ReviewRoutes] Updated product stats after guest review approval for product: ${verification.productId}`,
      )
    } catch (error) {
      console.error(`[ReviewRoutes] Failed to update product stats:`, error)
      // Don't fail the request if stats update fails
    }

    res.status(201).json({
      message: "Email verified successfully! Your review has been published.",
      review: {
        id: review._id,
        status: review.status,
      },
    })
  } catch (error) {
    console.error("Error verifying review email:", error)
    res.status(500).json({ message: "Error verifying email" })
  }
})

// POST /api/reviews/resend-verification - Resend verification code
router.post("/resend-verification", async (req, res) => {
  try {
    const { verificationId } = req.body

    if (!verificationId) {
      return res.status(400).json({
        message: "Verification ID is required",
      })
    }

    // Find verification record
    const verification = await ReviewVerification.findById(verificationId)
    if (!verification) {
      return res.status(404).json({
        message: "Verification record not found",
      })
    }

    // Check if already verified
    if (verification.isVerified) {
      return res.status(400).json({
        message: "This review has already been verified",
      })
    }

    // Get product info
    const product = await Product.findById(verification.productId)
    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      })
    }

    // Generate new code
    const code = verification.generateVerificationCode()
    await verification.save()

    // Resend verification email
    try {
      await sendReviewVerificationEmail(
        verification.email,
        verification.reviewData.name,
        code,
        product.name,
        verification.reviewData.rating,
        verification.reviewData.comment,
      )

      res.json({
        message: "Verification code sent successfully!",
      })
    } catch (emailError) {
      console.error("Failed to resend verification email:", emailError)
      res.status(500).json({
        message: "Failed to send verification email. Please try again.",
      })
    }
  } catch (error) {
    console.error("Error resending verification:", error)
    res.status(500).json({ message: "Error resending verification" })
  }
})

// GET /api/reviews/product/:productId - Get approved reviews for a product
router.get("/product/:productId", optionalAuth, async (req, res) => {
  try {
    const { productId } = req.params
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const skip = (page - 1) * limit

    console.log("* Backend - Query params:", req.query)
    console.log("* Backend - Guest review IDs raw:", req.query.guestReviewIds)

    const guestReviewIds = req.query.guestReviewIds
      ? req.query.guestReviewIds.split(",").filter((id) => mongoose.Types.ObjectId.isValid(id))
      : []

    console.log("* Backend - Parsed guest review IDs:", guestReviewIds)
    console.log("* Backend - User authenticated:", !!req.user)

    let reviewQuery = {
      product: productId,
      status: "approved",
    }

    if (req.user) {
      // For logged-in users: show approved reviews + their own reviews (any status)
      reviewQuery = {
        product: productId,
        $or: [{ status: "approved" }, { user: req.user.id || req.user._id }],
      }
    } else if (guestReviewIds.length > 0) {
      // For guests: show approved reviews + their specific review IDs (any status)
      reviewQuery = {
        product: productId,
        $or: [{ status: "approved" }, { _id: { $in: guestReviewIds.map((id) => new mongoose.Types.ObjectId(id)) } }],
      }
    }

    console.log("* Backend - Final query:", JSON.stringify(reviewQuery, null, 2))

    const reviews = await Review.find(reviewQuery)
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    console.log("* Backend - Found reviews count:", reviews.length)
    console.log(
      "* Backend - Review IDs found:",
      reviews.map((r) => r._id.toString()),
    )

    let totalReviewsQuery = {
      product: productId,
      status: "approved",
    }

    if (req.user) {
      totalReviewsQuery = {
        product: productId,
        $or: [{ status: "approved" }, { user: req.user.id || req.user._id }],
      }
    } else if (guestReviewIds.length > 0) {
      totalReviewsQuery = {
        product: productId,
        $or: [{ status: "approved" }, { _id: { $in: guestReviewIds.map((id) => new mongoose.Types.ObjectId(id)) } }],
      }
    }

    const totalReviews = await Review.countDocuments(totalReviewsQuery)

    // Calculate average rating (only from approved reviews for fairness)
    const ratingStats = await Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(productId), status: "approved" } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          ratingDistribution: {
            $push: "$rating",
          },
        },
      },
    ])

    const stats = {
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    }

    if (ratingStats.length > 0) {
      stats.averageRating = Math.round(ratingStats[0].averageRating * 10) / 10
      stats.totalReviews = ratingStats[0].totalReviews

      // Calculate rating distribution
      ratingStats[0].ratingDistribution.forEach((rating) => {
        stats.ratingDistribution[rating]++
      })
    }

    res.json({
      reviews,
      stats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalReviews / limit),
        totalReviews,
        hasNext: page < Math.ceil(totalReviews / limit),
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching reviews:", error)
    res.status(500).json({ message: "Error fetching reviews" })
  }
})

// GET /api/reviews/user - Get user's reviews (authenticated users only)
router.get("/user", protect, async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const skip = (page - 1) * limit

    const userId = req.user.id || req.user._id

    const reviews = await Review.find({ user: userId })
      .populate("product", "name slug images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const totalReviews = await Review.countDocuments({ user: userId })

    res.json({
      reviews,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalReviews / limit),
        totalReviews,
        hasNext: page < Math.ceil(totalReviews / limit),
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching user reviews:", error)
    res.status(500).json({ message: "Error fetching reviews" })
  }
})

// GET /api/reviews - Get all approved reviews
router.get("/", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const skip = (page - 1) * limit

    const reviews = await Review.find({ status: "approved" })
      .populate("user", "name")
      .populate("product", "name slug")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const totalReviews = await Review.countDocuments({ status: "approved" })

    res.json({
      reviews,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalReviews / limit),
        totalReviews,
        hasNext: page < Math.ceil(totalReviews / limit),
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching reviews:", error)
    res.status(500).json({ message: "Error fetching reviews" })
  }
})

export default router
