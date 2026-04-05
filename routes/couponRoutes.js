import express from "express"
import asyncHandler from "express-async-handler"
import Coupon from "../models/couponModel.js"
import Category from "../models/categoryModel.js"
import Product from "../models/productModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { logActivity } from "../middleware/permissionMiddleware.js"

const router = express.Router()

// @desc    Get all coupons
// @route   GET /api/coupons
// @access  Public
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const coupons = await Coupon.find({ isActive: true, validUntil: { $gte: new Date() }, visibility: "public" })
      .populate("categories", "name")
      .sort({ createdAt: -1 })

    res.json(coupons)
  }),
)

// @desc    Get all coupons (admin)
// @route   GET /api/coupons/admin
// @access  Private/Admin
router.get(
  "/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const coupons = await Coupon.find({})
      .populate("categories", "name")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })

    res.json(coupons)
  }),
)

// @desc    Get inactive coupons (admin)
// @route   GET /api/coupons/admin/inactive
// @access  Private/Admin
router.get(
  "/admin/inactive",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const coupons = await Coupon.find({ isActive: false })
      .populate("categories", "name")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })

    res.json(coupons)
  }),
)

// @desc    Get expired/disabled coupons (admin)
// @route   GET /api/coupons/admin/expired
// @access  Private/Admin
router.get(
  "/admin/expired",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const coupons = await Coupon.find({
      validUntil: { $lt: new Date() },
    })
      .populate("categories", "name")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })

    res.json(coupons)
  }),
)

// @desc    Validate coupon
// @route   POST /api/coupons/validate
// @access  Public
router.post(
  "/validate",
  asyncHandler(async (req, res) => {
    const { code, cartItems } = req.body

    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() },
    }).populate("categories", "name")

    if (!coupon) {
      res.status(400)
      throw new Error("Invalid or expired coupon code")
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      res.status(400)
      throw new Error("Coupon usage limit exceeded")
    }

    // Calculate eligible items and discount
    let eligibleItems = []
    let totalEligibleAmount = 0

    if (coupon.categories && coupon.categories.length > 0) {
      // Category-specific coupon
      for (const item of cartItems) {
        const product = await Product.findById(item.product).populate("parentCategory")
        if (product && product.parentCategory && coupon.categories.some(c => c._id.toString() === product.parentCategory._id.toString())) {
          eligibleItems.push(item)
          // Use the actual selling price (offer price if available, otherwise regular price)
          const sellingPrice = (product.offerPrice && product.offerPrice > 0) ? product.offerPrice : product.price
          totalEligibleAmount += sellingPrice * item.qty
        }
      }
    } else {
      // General coupon applies to all items
      eligibleItems = cartItems
      for (const item of cartItems) {
        const product = await Product.findById(item.product)
        if (product) {
          // Use the actual selling price (offer price if available, otherwise regular price)
          const sellingPrice = (product.offerPrice && product.offerPrice > 0) ? product.offerPrice : product.price
          totalEligibleAmount += sellingPrice * item.qty
        }
      }
    }

    if (eligibleItems.length === 0) {
      res.status(400)
      throw new Error(
        coupon.categories && coupon.categories.length > 0
          ? `This coupon is only valid for products in: ${coupon.categories.map(c => c.name).join(", ")}. None of your cart items belong to these categories.`
          : "No eligible items in cart"
      )
    }

    // Check minimum order amount
    if (coupon.minOrderAmount && totalEligibleAmount < coupon.minOrderAmount) {
      res.status(400)
      throw new Error(`Minimum order amount of ${coupon.minOrderAmount} required for this coupon`)
    }

    // Calculate discount
    let discountAmount = 0
    if (coupon.discountType === "percentage") {
      discountAmount = (totalEligibleAmount * coupon.discountValue) / 100
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount
      }
    } else {
      discountAmount = Math.min(coupon.discountValue, totalEligibleAmount)
    }

    res.json({
      valid: true,
      coupon: {
        _id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        categories: coupon.categories,
      },
      discountAmount,
      eligibleItems,
      totalEligibleAmount,
    })
  }),
)

// @desc    Create coupon
// @route   POST /api/coupons
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { categories, ...couponData } = req.body

    // Verify categories exist if provided
    if (categories && categories.length > 0) {
      const categoryExists = await Category.find({ _id: { $in: categories } })
      if (categoryExists.length !== categories.length) {
        res.status(400)
        throw new Error("Invalid category")
      }
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ code: couponData.code.toUpperCase() })
    if (existingCoupon) {
      res.status(400)
      throw new Error("Coupon code already exists")
    }

    const coupon = new Coupon({
      ...couponData, // includes visibility
      code: couponData.code.toUpperCase(),
      categories,
      createdBy: req.user._id,
    })

    const createdCoupon = await coupon.save()
    const populatedCoupon = await Coupon.findById(createdCoupon._id)
      .populate("categories", "name")
      .populate("createdBy", "name email")

    // Log activity
    await logActivity(req, "CREATE", "COUPONS", `Created coupon: ${createdCoupon.code}`, createdCoupon._id, createdCoupon.code)

    res.status(201).json(populatedCoupon)
  }),
)

// @desc    Update coupon
// @route   PUT /api/coupons/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const coupon = await Coupon.findById(req.params.id)

    if (coupon) {
      const { categories, ...updateData } = req.body

      // Verify categories exist if provided
      if (categories && categories.length > 0) {
        const categoryExists = await Category.find({ _id: { $in: categories } })
        if (categoryExists.length !== categories.length) {
          res.status(400)
          throw new Error("Invalid category")
        }
      }

      // Check if coupon code already exists (excluding current coupon)
      if (updateData.code) {
        const existingCoupon = await Coupon.findOne({
          code: updateData.code.toUpperCase(),
          _id: { $ne: req.params.id },
        })
        if (existingCoupon) {
          res.status(400)
          throw new Error("Coupon code already exists")
        }
      }

      // Update coupon fields
      Object.keys(updateData).forEach((key) => {
        if (key === "code") {
          coupon[key] = updateData[key].toUpperCase()
        } else {
          coupon[key] = updateData[key] // includes visibility
        }
      })

      if (categories && categories.length > 0) coupon.categories = categories

      const updatedCoupon = await coupon.save()
      const populatedCoupon = await Coupon.findById(updatedCoupon._id)
        .populate("categories", "name")
        .populate("createdBy", "name email")

      // Log activity
      await logActivity(req, "UPDATE", "COUPONS", `Updated coupon: ${updatedCoupon.code}`, updatedCoupon._id, updatedCoupon.code)

      res.json(populatedCoupon)
    } else {
      res.status(404)
      throw new Error("Coupon not found")
    }
  }),
)

// @desc    Delete coupon
// @route   DELETE /api/coupons/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const coupon = await Coupon.findById(req.params.id)

    if (coupon) {
      const couponCode = coupon.code
      const couponId = coupon._id
      await coupon.deleteOne()

      // Log activity
      await logActivity(req, "DELETE", "COUPONS", `Deleted coupon: ${couponCode}`, couponId, couponCode)

      res.json({ message: "Coupon removed" })
    } else {
      res.status(404)
      throw new Error("Coupon not found")
    }
  }),
)

export default router
