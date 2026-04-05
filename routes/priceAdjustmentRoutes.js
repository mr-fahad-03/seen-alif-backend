import express from "express"
import Product from "../models/productModel.js"
import PriceAdjustment from "../models/priceAdjustmentModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"

const router = express.Router()

// @desc    Get all products for price adjustment (without pagination)
// @route   GET /api/price-adjustment/products
// @access  Private/Admin
router.get("/products", protect, admin, async (req, res) => {
  try {
    const {
      search,
      parentCategory,
      category,
      subCategory,
      subCategory2,
      subCategory3,
      subCategory4,
      brand,
      isActive,
      onHold,
    } = req.query

    // Build query
    const query = {}

    // Search by name, sku, or brand name
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i")
      query.$or = [{ name: searchRegex }, { sku: searchRegex }]
    }

    // Filter by parent category
    if (parentCategory && parentCategory !== "all") {
      query.parentCategory = parentCategory
    }

    // Level 1 subcategory (accept both category and legacy subCategory)
    if (category && category !== "all") {
      query.category = category
    } else if (subCategory && subCategory !== "all") {
      query.category = subCategory
    }

    // Level 2/3/4 subcategories
    if (subCategory2 && subCategory2 !== "all") {
      query.subCategory2 = subCategory2
    }
    if (subCategory3 && subCategory3 !== "all") {
      query.subCategory3 = subCategory3
    }
    if (subCategory4 && subCategory4 !== "all") {
      query.subCategory4 = subCategory4
    }

    // Filter by brand
    if (brand && brand !== "all") {
      query.brand = brand
    }

    // Status filtering
    if (typeof onHold !== "undefined") {
      query.onHold = String(onHold).toLowerCase() === "true"
    }
    if (typeof isActive !== "undefined") {
      query.isActive = String(isActive).toLowerCase() === "true"
    }

    const products = await Product.find(query)
      .populate("brand", "name")
      .populate("parentCategory", "name")
      .populate("category", "name")
      .select("name sku price offerPrice image brand parentCategory category")
      .sort({ name: 1 })

    res.json({
      products,
      totalCount: products.length,
    })
  } catch (error) {
    console.error("Error fetching products for price adjustment:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @desc    Bulk update product prices
// @route   POST /api/price-adjustment/bulk-update
// @access  Private/Admin
router.post("/bulk-update", protect, admin, async (req, res) => {
  try {
    const {
      productIds,
      adjustmentType, // "both", "base_only", "offer_only"
      adjustmentMethod, // "percentage", "fixed_amount"
      adjustmentValue,
      notes,
      filterCriteria,
    } = req.body

    if (!productIds || productIds.length === 0) {
      return res.status(400).json({ message: "No products selected" })
    }

    if (!adjustmentType || !adjustmentMethod || adjustmentValue === undefined) {
      return res.status(400).json({ message: "Missing adjustment parameters" })
    }

    // Fetch products to update
    const products = await Product.find({ _id: { $in: productIds } })
      .populate("brand", "name")
      .populate("parentCategory", "name")
      .populate("category", "name")

    if (products.length === 0) {
      return res.status(404).json({ message: "No products found" })
    }

    const adjustmentData = {
      products: [],
      adjustmentType,
      adjustmentMethod,
      adjustmentValue,
      totalProductsAffected: products.length,
      adjustedBy: req.user._id,
      adjustedByName: req.user.name || req.user.email,
      notes: notes || "",
      filterCriteria: filterCriteria || {},
    }

    // Process each product
    for (const product of products) {
      const previousPrice = product.price
      const previousOfferPrice = product.offerPrice || 0

      let newPrice = previousPrice
      let newOfferPrice = previousOfferPrice

      // Calculate new prices based on adjustment type and method
      if (adjustmentMethod === "percentage") {
        const multiplier = 1 + adjustmentValue / 100

        if (adjustmentType === "both" || adjustmentType === "base_only") {
          newPrice = Math.round(previousPrice * multiplier * 100) / 100
        }

        if (adjustmentType === "both" || adjustmentType === "offer_only") {
          if (previousOfferPrice > 0) {
            newOfferPrice = Math.round(previousOfferPrice * multiplier * 100) / 100
          }
        }
      } else if (adjustmentMethod === "fixed_amount") {
        if (adjustmentType === "both" || adjustmentType === "base_only") {
          newPrice = Math.max(0, previousPrice + adjustmentValue)
        }

        if (adjustmentType === "both" || adjustmentType === "offer_only") {
          if (previousOfferPrice > 0) {
            newOfferPrice = Math.max(0, previousOfferPrice + adjustmentValue)
          }
        }
      }

      // Calculate changes
      const priceChange = newPrice - previousPrice
      const offerPriceChange = newOfferPrice - previousOfferPrice
      const priceChangePercentage = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0
      const offerPriceChangePercentage = previousOfferPrice > 0 ? (offerPriceChange / previousOfferPrice) * 100 : 0

      // Update product in database
      const updateData = {}
      if (adjustmentType === "both" || adjustmentType === "base_only") {
        updateData.price = newPrice
      }
      if (adjustmentType === "both" || adjustmentType === "offer_only") {
        updateData.offerPrice = newOfferPrice
      }

      await Product.findByIdAndUpdate(product._id, updateData)

      // Add to adjustment history
      adjustmentData.products.push({
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        previousPrice,
        previousOfferPrice,
        newPrice,
        newOfferPrice,
        priceChange,
        offerPriceChange,
        priceChangePercentage: Math.round(priceChangePercentage * 100) / 100,
        offerPriceChangePercentage: Math.round(offerPriceChangePercentage * 100) / 100,
      })
    }

    // Save adjustment history
    const priceAdjustment = new PriceAdjustment(adjustmentData)
    await priceAdjustment.save()

    res.json({
      message: `Successfully updated ${products.length} products`,
      adjustmentId: priceAdjustment._id,
      productsUpdated: products.length,
    })
  } catch (error) {
    console.error("Error in bulk price update:", error)
    res.status(500).json({ message: "Server error during price update" })
  }
})

// @desc    Get price adjustment history/reports
// @route   GET /api/price-adjustment/reports
// @access  Private/Admin
router.get("/reports", protect, admin, async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate, adjustedBy } = req.query

    // Build query
    const query = {}

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) {
        query.createdAt.$gte = new Date(startDate)
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate)
      }
    }

    // Filter by user who made the adjustment
    if (adjustedBy && adjustedBy !== "all") {
      query.adjustedBy = adjustedBy
    }

    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    const [reports, totalCount] = await Promise.all([
      PriceAdjustment.find(query)
        .populate("adjustedBy", "name email")
        .populate("filterCriteria.parentCategory", "name")
        .populate("filterCriteria.subCategory", "name")
        .populate("filterCriteria.brand", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number.parseInt(limit)),
      PriceAdjustment.countDocuments(query),
    ])

    res.json({
      reports,
      totalCount,
      totalPages: Math.ceil(totalCount / Number.parseInt(limit)),
      currentPage: Number.parseInt(page),
    })
  } catch (error) {
    console.error("Error fetching price adjustment reports:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @desc    Get detailed report for a specific adjustment
// @route   GET /api/price-adjustment/reports/:id
// @access  Private/Admin
router.get("/reports/:id", protect, admin, async (req, res) => {
  try {
    const report = await PriceAdjustment.findById(req.params.id)
      .populate("adjustedBy", "name email")
      .populate("filterCriteria.parentCategory", "name")
      .populate("filterCriteria.subCategory", "name")
      .populate("filterCriteria.brand", "name")
      .populate("products.productId", "name sku image")

    if (!report) {
      return res.status(404).json({ message: "Report not found" })
    }

    res.json(report)
  } catch (error) {
    console.error("Error fetching price adjustment report:", error)
    res.status(500).json({ message: "Server error" })
  }
})

export default router
