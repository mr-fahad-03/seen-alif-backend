import express from "express"
import asyncHandler from "express-async-handler"
import BuyerProtection from "../models/buyerProtectionModel.js"
import Product from "../models/productModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"

const router = express.Router()

// @desc    Get all buyer protection plans
// @route   GET /api/buyer-protection
// @access  Public
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const protections = await BuyerProtection.find({ isActive: true })
      .populate("parentCategories", "name")
      .populate("categories", "name")
      .populate("subCategories2", "name")
      .populate("subCategories3", "name")
      .populate("subCategories4", "name")
      .populate("specificProducts", "name slug price")
      .sort({ sortOrder: 1, createdAt: -1 })
    res.json(protections)
  }),
)

// @desc    Get all buyer protection plans (Admin)
// @route   GET /api/buyer-protection/admin
// @access  Private/Admin
router.get(
  "/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const protections = await BuyerProtection.find({})
      .populate("parentCategories", "name")
      .populate("categories", "name")
      .populate("subCategories2", "name")
      .populate("subCategories3", "name")
      .populate("subCategories4", "name")
      .populate("specificProducts", "name slug price")
      .sort({ sortOrder: 1, createdAt: -1 })
    res.json(protections)
  }),
)

// @desc    Get single buyer protection plan
// @route   GET /api/buyer-protection/:id
// @access  Public
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const protection = await BuyerProtection.findById(req.params.id)
      .populate("parentCategories", "name")
      .populate("categories", "name")
      .populate("subCategories2", "name")
      .populate("subCategories3", "name")
      .populate("subCategories4", "name")
      .populate("specificProducts", "name slug price")

    if (protection) {
      res.json(protection)
    } else {
      res.status(404)
      throw new Error("Protection plan not found")
    }
  }),
)

// @desc    Get applicable buyer protection plans for a specific product
// @route   POST /api/buyer-protection/for-product
// @access  Public
router.post(
  "/for-product",
  asyncHandler(async (req, res) => {
    const { productId, productPrice } = req.body

    console.log('For-product request:', { productId, productPrice })

    if (!productId || !productPrice) {
      res.status(400)
      throw new Error("Product ID and price are required")
    }

    // Get the product to check its categories
    const product = await Product.findById(productId)
    if (!product) {
      res.status(404)
      throw new Error("Product not found")
    }

    // Find all active protection plans
    const allProtections = await BuyerProtection.find({ isActive: true })
      .populate("parentCategories", "name")
      .populate("categories", "name")
      .populate("subCategories2", "name")
      .populate("subCategories3", "name")
      .populate("subCategories4", "name")
      .populate("specificProducts", "name slug price")

    console.log('Found protections:', allProtections.length)
    allProtections.forEach(p => {
      console.log(`Protection: ${p.name}, Type: ${p.pricingType}, Price: ${p.price}, Percentage: ${p.pricePercentage}`)
    })

    // Filter protections based on applicationType
    const applicableProtections = allProtections.filter((protection) => {
      if (protection.applicationType === "all") {
        return true
      }

      if (protection.applicationType === "categories") {
        // Check if product belongs to any of the specified categories
        const hasParentCategory =
          protection.parentCategories.length === 0 ||
          protection.parentCategories.some((cat) => cat._id.toString() === product.parentCategory?.toString())

        const hasCategory =
          protection.categories.length === 0 ||
          protection.categories.some((cat) => cat._id.toString() === product.category?.toString())

        const hasSubCategory2 =
          protection.subCategories2.length === 0 ||
          protection.subCategories2.some((cat) => cat._id.toString() === product.subCategory2?.toString())

        const hasSubCategory3 =
          protection.subCategories3.length === 0 ||
          protection.subCategories3.some((cat) => cat._id.toString() === product.subCategory3?.toString())

        const hasSubCategory4 =
          protection.subCategories4.length === 0 ||
          protection.subCategories4.some((cat) => cat._id.toString() === product.subCategory4?.toString())

        // If any category array has items, at least one must match
        const categoryArraysWithItems = [
          protection.parentCategories.length > 0,
          protection.categories.length > 0,
          protection.subCategories2.length > 0,
          protection.subCategories3.length > 0,
          protection.subCategories4.length > 0,
        ].filter(Boolean).length

        if (categoryArraysWithItems === 0) return false // No categories specified

        // At least one category level must match
        return hasParentCategory || hasCategory || hasSubCategory2 || hasSubCategory3 || hasSubCategory4
      }

      if (protection.applicationType === "products") {
        // Check if product is in the specificProducts array
        return protection.specificProducts.some((prod) => prod._id.toString() === productId.toString())
      }

      return false
    })

    // Calculate final prices for protections with percentage pricing
    const protectionsWithPrices = applicableProtections.map((protection) => {
      const protectionObj = protection.toObject()

      console.log(`Calculating price for ${protectionObj.name}:`, {
        pricingType: protectionObj.pricingType,
        pricePercentage: protectionObj.pricePercentage,
        productPrice,
        fixedPrice: protectionObj.price
      })

      if (protectionObj.pricingType === "percentage" && protectionObj.pricePercentage) {
        let calculatedPrice = (productPrice * protectionObj.pricePercentage) / 100

        console.log(`Raw calculated: ${calculatedPrice}`)

        // Apply min/max bounds
        if (protectionObj.minPrice && calculatedPrice < protectionObj.minPrice) {
          calculatedPrice = protectionObj.minPrice
          console.log(`Applied minPrice: ${calculatedPrice}`)
        }
        if (protectionObj.maxPrice && calculatedPrice > protectionObj.maxPrice) {
          calculatedPrice = protectionObj.maxPrice
          console.log(`Applied maxPrice: ${calculatedPrice}`)
        }

        protectionObj.calculatedPrice = Math.round(calculatedPrice * 100) / 100 // Round to 2 decimals
        console.log(`Final calculatedPrice: ${protectionObj.calculatedPrice}`)
      } else {
        protectionObj.calculatedPrice = protectionObj.price || 0
        console.log(`Using fixed price: ${protectionObj.calculatedPrice}`)
      }

      return protectionObj
    })

    console.log('Returning protections with prices:', protectionsWithPrices.map(p => ({
      name: p.name,
      calculatedPrice: p.calculatedPrice
    })))

    res.json(protectionsWithPrices)
  }),
)

// @desc    Create a buyer protection plan
// @route   POST /api/buyer-protection
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const {
      name,
      type,
      duration,
      price,
      pricingType,
      pricePercentage,
      minPrice,
      maxPrice,
      applicationType,
      parentCategories,
      categories,
      subCategories2,
      subCategories3,
      subCategories4,
      specificProducts,
      icon,
      features,
      description,
      isActive,
      sortOrder,
    } = req.body

    // Validation
    if (pricingType === "percentage") {
      if (pricePercentage === undefined || pricePercentage === null || isNaN(pricePercentage)) {
        res.status(400)
        throw new Error("Price percentage is required for percentage pricing")
      }
      if (pricePercentage < 0 || pricePercentage > 100) {
        res.status(400)
        throw new Error("Price percentage must be between 0 and 100")
      }
    }

    if (pricingType === "fixed") {
      if (price === undefined || price === null || isNaN(price) || price <= 0) {
        res.status(400)
        throw new Error("Price is required and must be greater than 0 for fixed pricing")
      }
    }

    const protection = new BuyerProtection({
      name,
      type,
      duration,
      price: pricingType === "fixed" ? Number(price) : 0,
      pricingType: pricingType || "fixed",
      pricePercentage: pricingType === "percentage" ? Number(pricePercentage) : undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      applicationType: applicationType || "all",
      parentCategories: parentCategories || [],
      categories: categories || [],
      subCategories2: subCategories2 || [],
      subCategories3: subCategories3 || [],
      subCategories4: subCategories4 || [],
      specificProducts: specificProducts || [],
      icon,
      features: features || [],
      description,
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: sortOrder || 0,
    })

    const createdProtection = await protection.save()
    
    // Populate references before sending response
    const populatedProtection = await BuyerProtection.findById(createdProtection._id)
      .populate("parentCategories", "name")
      .populate("categories", "name")
      .populate("subCategories2", "name")
      .populate("subCategories3", "name")
      .populate("subCategories4", "name")
      .populate("specificProducts", "name slug price")
    
    res.status(201).json(populatedProtection)
  }),
)

// @desc    Update a buyer protection plan
// @route   PUT /api/buyer-protection/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const {
      name,
      type,
      duration,
      price,
      pricingType,
      pricePercentage,
      minPrice,
      maxPrice,
      applicationType,
      parentCategories,
      categories,
      subCategories2,
      subCategories3,
      subCategories4,
      specificProducts,
      icon,
      features,
      description,
      isActive,
      sortOrder,
    } = req.body

    const protection = await BuyerProtection.findById(req.params.id)

    if (protection) {
      // Validation
      if (pricingType === "percentage" && pricePercentage !== undefined) {
        if (isNaN(pricePercentage) || pricePercentage < 0 || pricePercentage > 100) {
          res.status(400)
          throw new Error("Price percentage must be between 0 and 100")
        }
      }

      if (pricingType === "fixed" && price !== undefined) {
        if (isNaN(price) || price <= 0) {
          res.status(400)
          throw new Error("Price must be greater than 0 for fixed pricing")
        }
      }

      protection.name = name || protection.name
      protection.type = type || protection.type
      protection.duration = duration || protection.duration
      protection.pricingType = pricingType || protection.pricingType
      
      // Update pricing fields based on type
      if (pricingType === "percentage") {
        protection.price = 0
        protection.pricePercentage = pricePercentage !== undefined ? Number(pricePercentage) : protection.pricePercentage
        protection.minPrice = minPrice !== undefined ? (minPrice ? Number(minPrice) : undefined) : protection.minPrice
        protection.maxPrice = maxPrice !== undefined ? (maxPrice ? Number(maxPrice) : undefined) : protection.maxPrice
      } else if (pricingType === "fixed") {
        protection.price = price !== undefined ? Number(price) : protection.price
        protection.pricePercentage = undefined
        protection.minPrice = undefined
        protection.maxPrice = undefined
      } else {
        // Keep existing pricing type logic
        protection.price = price !== undefined ? Number(price) : protection.price
        protection.pricePercentage = pricePercentage !== undefined ? Number(pricePercentage) : protection.pricePercentage
        protection.minPrice = minPrice !== undefined ? (minPrice ? Number(minPrice) : undefined) : protection.minPrice
        protection.maxPrice = maxPrice !== undefined ? (maxPrice ? Number(maxPrice) : undefined) : protection.maxPrice
      }
      
      protection.applicationType = applicationType || protection.applicationType
      protection.parentCategories = parentCategories !== undefined ? parentCategories : protection.parentCategories
      protection.categories = categories !== undefined ? categories : protection.categories
      protection.subCategories2 = subCategories2 !== undefined ? subCategories2 : protection.subCategories2
      protection.subCategories3 = subCategories3 !== undefined ? subCategories3 : protection.subCategories3
      protection.subCategories4 = subCategories4 !== undefined ? subCategories4 : protection.subCategories4
      protection.specificProducts = specificProducts !== undefined ? specificProducts : protection.specificProducts
      protection.icon = icon !== undefined ? icon : protection.icon
      protection.features = features || protection.features
      protection.description = description !== undefined ? description : protection.description
      protection.isActive = isActive !== undefined ? isActive : protection.isActive
      protection.sortOrder = sortOrder !== undefined ? sortOrder : protection.sortOrder

      await protection.save()
      
      // Populate references before sending response
      const updatedProtection = await BuyerProtection.findById(protection._id)
        .populate("parentCategories", "name")
        .populate("categories", "name")
        .populate("subCategories2", "name")
        .populate("subCategories3", "name")
        .populate("subCategories4", "name")
        .populate("specificProducts", "name slug price")
      
      res.json(updatedProtection)
    } else {
      res.status(404)
      throw new Error("Protection plan not found")
    }
  }),
)

// @desc    Delete a buyer protection plan
// @route   DELETE /api/buyer-protection/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const protection = await BuyerProtection.findById(req.params.id)

    if (protection) {
      await protection.deleteOne()
      res.json({ message: "Protection plan removed" })
    } else {
      res.status(404)
      throw new Error("Protection plan not found")
    }
  }),
)

export default router
