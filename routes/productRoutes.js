import express from "express"
import asyncHandler from "express-async-handler"
import axios from "axios"
import Product from "../models/productModel.js"
import Category from "../models/categoryModel.js"
import Brand from "../models/brandModel.js"
import SubCategory from "../models/subCategoryModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { logActivity } from "../middleware/permissionMiddleware.js"
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js"
import multer from "multer"
import XLSX from "xlsx"
import fs from "fs"
import Tax from "../models/taxModel.js"
import Unit from "../models/unitModel.js"
import Color from "../models/colorModel.js"
import Warranty from "../models/warrantyModel.js"
import Size from "../models/sizeModel.js"
import Volume from "../models/volumeModel.js"
import mongoose from "mongoose"
import { deleteLocalFile, isCloudinaryUrl } from "../config/multer.js"

const router = express.Router()
const TRANSLATION_TIMEOUT_MS = Number(process.env.TRANSLATION_TIMEOUT_MS || 4000)
const BING_TRANSLATION_TIMEOUT_MS = Number(process.env.BING_TRANSLATION_TIMEOUT_MS || 3000)
const TRANSLATION_FAILURE_COOLDOWN_MS = Number(process.env.TRANSLATION_FAILURE_COOLDOWN_MS || 60000)
const ENABLE_PRODUCT_TRANSLATION = process.env.ENABLE_PRODUCT_TRANSLATION !== "false"
const ENABLE_BING_TRANSLATION_FALLBACK = process.env.ENABLE_BING_TRANSLATION_FALLBACK !== "false"
let cachedBingTranslate = null
let bingLoaderAttempted = false
let primaryTranslatorUnavailableUntil = 0
let bingTranslatorUnavailableUntil = 0

const withTimeout = (promise, ms, timeoutMessage) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), ms)
    }),
  ])

const loadBingTranslate = async () => {
  if (bingLoaderAttempted) return cachedBingTranslate
  bingLoaderAttempted = true

  try {
    const bingModule = await import("bing-translate-api")
    cachedBingTranslate = bingModule?.translate || null
    if (!cachedBingTranslate) {
      console.error("Product translation fallback unavailable: translate export not found")
    }
  } catch (error) {
    console.error("Product translation fallback package not available:", error.message)
    cachedBingTranslate = null
  }

  return cachedBingTranslate
}

// Helper for translation
const translateText = async (text) => {
  if (!ENABLE_PRODUCT_TRANSLATION) return ""
  const normalizedText = String(text || "").trim()
  if (!normalizedText) return ""

  const now = Date.now()

  if (now >= primaryTranslatorUnavailableUntil) {
    try {
      const response = await axios.post(
        "https://langaimodel.grabatoz.ae/api/translate/en-ar",
        { text: normalizedText },
        { timeout: TRANSLATION_TIMEOUT_MS },
      )
      const translated = response.data.translation || ""
      if (translated) return translated
    } catch (error) {
      primaryTranslatorUnavailableUntil = Date.now() + TRANSLATION_FAILURE_COOLDOWN_MS
      console.error("Product primary translation failed, trying Bing fallback:", error.message)
    }
  }

  if (!ENABLE_BING_TRANSLATION_FALLBACK) return ""
  if (Date.now() < bingTranslatorUnavailableUntil) return ""

  try {
    const bingTranslate = await loadBingTranslate()
    if (!bingTranslate) {
      bingTranslatorUnavailableUntil = Date.now() + TRANSLATION_FAILURE_COOLDOWN_MS
      return ""
    }

    const bingResult = await withTimeout(
      bingTranslate(normalizedText, null, "ar"),
      BING_TRANSLATION_TIMEOUT_MS,
      "Bing product translation timeout",
    )
    return bingResult?.translation || ""
  } catch (error) {
    bingTranslatorUnavailableUntil = Date.now() + TRANSLATION_FAILURE_COOLDOWN_MS
    console.error("Bing product translation fallback failed:", error.message)
    return ""
  }
}

// Multer setup for Excel parsing (use memory storage for Vercel compatibility)
const excelUpload = multer({ storage: multer.memoryStorage() })

// Helper: map Excel columns to backend keys (supports 4-level categories)
const excelToBackendKey = {
  name: "name",
  slug: "slug",
  sku: "sku",
  // Category hierarchy
  category: "category", // Level 1
  subcategory: "category", // alias for level 1
  sub_category: "category", // alias for level 1
  category1: "category", // alias for level 1
  category_level_1: "category", // alias for level 1
  parent_category: "parent_category",
  parentcategory: "parent_category",
  // Deeper levels
  category_level_2: "subCategory2",
  category2: "subCategory2",
  sub_category_2: "subCategory2",
  subcategory2: "subCategory2",
  subcategory2: "subCategory2",
  category_level_3: "subCategory3",
  category3: "subCategory3",
  sub_category_3: "subCategory3",
  subcategory3: "subCategory3",
  subcategory3: "subCategory3",
  category_level_4: "subCategory4",
  category4: "subCategory4",
  sub_category_4: "subCategory4",
  subcategory4: "subCategory4",
  subcategory4: "subCategory4",
  barcode: "barcode",
  buying_price: "buyingPrice",
  selling_price: "price",
  offer_price: "offerPrice",
  price: "price",
  offerprice: "offerPrice",
  tax: "tax",
  brand: "brand",
  status: "stockStatus",
  stockstatus: "stockStatus",
  show_stock_out: "showStockOut",
  can_purchasable: "canPurchase",
  refundable: "refundable",
  max_purchase_quantity: "maxPurchaseQty",
  low_stock_warning: "lowStockWarning",
  unit: "unit",
  weight: "weight",
  tags: "tags",
  description: "description",
  discount: "discount",
  specifications: "specifications",
  details: "details",
  short_description: "shortDescription",
  warranty: "warranty",
  size: "size",
  volume: "volume",
}

function remapRow(row) {
  const mapped = {}
  const specifications = []
  for (const key in row) {
    const normalizedKey = key.trim().toLowerCase()
    const backendKey = excelToBackendKey[normalizedKey] || key.trim()
    if (excelToBackendKey[normalizedKey]) {
      mapped[backendKey] = row[key]
    } else {
      // If not a standard field, treat as specification
      if (row[key] !== undefined && row[key] !== "") {
        specifications.push({ key: key.trim(), value: String(row[key]) })
      }
    }
  }
  if (specifications.length > 0) {
    mapped.specifications = specifications
  }
  return mapped
}

// Robust slug generator: lowercases, converts & to 'and', removes quotes, replaces non-alphanumerics with '-',
// collapses multiple dashes, and trims leading/trailing dashes.
function generateSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, "-and-")
    .replace(/["'’`]+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

const sanitizeSlug = (slug) => generateSlug(slug)
const normalizeOptionalUniqueField = (value) => {
  const normalized = String(value ?? "").trim()
  return normalized !== "" ? normalized : undefined
}

const parseSpecificationsInput = (input) => {
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (item && typeof item === "object") {
          const key = String(item.key ?? "").trim()
          const value = String(item.value ?? "").trim()
          return key && value ? { key, value } : null
        }
        return null
      })
      .filter(Boolean)
  }

  const raw = String(input ?? "").trim()
  if (!raw) return []

  // Support JSON input if someone passes specifications in JSON format.
  if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
    try {
      const parsed = JSON.parse(raw)
      const normalized = Array.isArray(parsed) ? parsed : [parsed]
      const specs = normalized
        .map((item) => {
          if (item && typeof item === "object") {
            const key = String(item.key ?? "").trim()
            const value = String(item.value ?? "").trim()
            return key && value ? { key, value } : null
          }
          return null
        })
        .filter(Boolean)
      if (specs.length) return specs
    } catch (err) {
      // Fall back to delimiter parsing.
    }
  }

  // Expected template format: "Display: 6.8 inch, RAM: 12GB, Storage: 256GB"
  const specs = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const sepIndex = part.includes(":") ? part.indexOf(":") : part.indexOf("=")
      if (sepIndex > 0) {
        const key = part.slice(0, sepIndex).trim()
        const value = part.slice(sepIndex + 1).trim()
        return key && value ? { key, value } : null
      }
      return null
    })
    .filter(Boolean)

  if (specs.length) return specs
  return [{ key: "Specifications", value: raw }]
}

// Helper to escape regex special characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// @desc    Fetch all products (Admin only - includes inactive)
// @route   GET /api/products/admin
// @access  Private/Admin
router.get("/admin", protect, admin, async (req, res) => {
  try {
    const { search, category, subcategory, subCategory2, subCategory3, subCategory4, parentCategory, brand, isActive, onHold, limit = 20, page = 1 } = req.query
    const query = {}
    const orConditions = []

    if (category) query.category = category
    if (subcategory) query.subCategory = subcategory
    if (subCategory2) query.subCategory2 = subCategory2
    if (subCategory3) query.subCategory3 = subCategory3
    if (subCategory4) query.subCategory4 = subCategory4
    if (parentCategory) query.parentCategory = parentCategory
    if (brand) query.brand = brand

    // Add isActive filter if provided
    if (isActive !== undefined && isActive !== null && isActive !== "") {
      query.isActive = isActive === "true" || isActive === true
    }

    // Add onHold filter if provided
    if (onHold !== undefined && onHold !== null && onHold !== "") {
      query.onHold = onHold === "true" || onHold === true
    }

    if (typeof search === "string" && search.trim() !== "") {
      const safeSearch = escapeRegex(search)
      const regex = new RegExp(safeSearch, "i")
      // Find matching brands by name
      const matchingBrands = await Brand.find({ name: regex }).select("_id")
      const brandIds = matchingBrands.map((b) => b._id)
      orConditions.push(
        { name: regex },
        { description: regex },
        { sku: regex },
        { barcode: regex },
        { tags: regex },
        { brand: { $in: brandIds } },
      )
    }
    if (orConditions.length > 0) {
      query.$or = orConditions
    }

    // Get total count for pagination
    const totalCount = await Product.countDocuments(query)

    let productsQuery = Product.find(query)
      .populate("brand", "name nameAr slug")
      .populate("category", "name nameAr slug")
      .populate("subCategory", "name nameAr slug")
      .populate("parentCategory", "name nameAr slug")
      .populate("subCategory2", "name nameAr slug")
      .populate("subCategory3", "name nameAr slug")
      .populate("subCategory4", "name nameAr slug")
      .populate("tax", "rate")
      .populate({
        path: "variations.product",
        select: "name nameAr slug image price offerPrice sku selfVariationText selfVariationTextAr reverseVariationText reverseVariationTextAr"
      })
      .sort({ createdAt: -1 })

    // Pagination
    const skip = (page - 1) * limit
    productsQuery = productsQuery.skip(skip).limit(Number.parseInt(limit))

    const products = await productsQuery
    res.json({ products, totalCount })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
})

// @desc    Get product count only (Admin only - for efficient select all)
// @route   GET /api/products/admin/count
// @access  Private/Admin
router.get("/admin/count", protect, admin, async (req, res) => {
  try {
    const { search, category, subcategory, subCategory2, subCategory3, subCategory4, parentCategory, brand, isActive, onHold } = req.query
    const query = {}
    const orConditions = []

    if (category) query.category = category
    if (subcategory) query.subCategory = subcategory
    if (subCategory2) query.subCategory2 = subCategory2
    if (subCategory3) query.subCategory3 = subCategory3
    if (subCategory4) query.subCategory4 = subCategory4
    if (parentCategory) query.parentCategory = parentCategory
    if (brand) query.brand = brand

    // Add isActive filter if provided
    if (isActive !== undefined && isActive !== null && isActive !== "") {
      query.isActive = isActive === "true" || isActive === true
    }

    // Add onHold filter if provided
    if (onHold !== undefined && onHold !== null && onHold !== "") {
      query.onHold = onHold === "true" || onHold === true
    }

    if (typeof search === "string" && search.trim() !== "") {
      const safeSearch = escapeRegex(search)
      const regex = new RegExp(safeSearch, "i")
      // Find matching brands by name
      const matchingBrands = await Brand.find({ name: regex }).select("_id")
      const brandIds = matchingBrands.map((b) => b._id)
      orConditions.push(
        { name: regex },
        { description: regex },
        { sku: regex },
        { barcode: regex },
        { tags: regex },
        { brand: { $in: brandIds } },
      )
    }
    if (orConditions.length > 0) {
      query.$or = orConditions
    }

    // Get only the count - much faster than fetching products
    const totalCount = await Product.countDocuments(query)
    res.json({ totalCount })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
})

// @desc    Get products by specific IDs (for exporting selected products)
// @route   POST /api/products/by-ids
// @access  Private/Admin
router.post("/by-ids", protect, admin, asyncHandler(async (req, res) => {
  try {
    const { ids } = req.body
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Product IDs array is required" })
    }

    // Validate ObjectIds
    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id))
    
    if (validIds.length === 0) {
      return res.status(400).json({ message: "No valid product IDs provided" })
    }

    // Fetch products by IDs
    const products = await Product.find({ _id: { $in: validIds } })
      .populate("brand", "name nameAr slug")
      .populate("category", "name nameAr slug")
      .populate("subCategory", "name nameAr slug")
      .populate("parentCategory", "name nameAr slug")
      .populate("subCategory2", "name nameAr slug")
      .populate("subCategory3", "name nameAr slug")
      .populate("subCategory4", "name nameAr slug")
      .populate("tax", "rate")
      .sort({ createdAt: -1 })

    res.json({ 
      products,
      totalCount: products.length,
      requestedCount: ids.length,
      foundCount: products.length
    })
  } catch (error) {
    console.error("Error fetching products by IDs:", error)
    res.status(500).json({ message: "Server error" })
  }
}))

// @desc    Fetch all products
// @route   GET /api/products
// @access  Public
router.get(
  "/",
  cacheMiddleware('products'),
  asyncHandler(async (req, res) => {
  const { category, subcategory, parentCategory, featured, search, brand, limit } = req.query

    const andConditions = [{ isActive: true }, { hideFromShop: { $ne: true } }]

    // Category filter
    if (category && category !== "all" && category.match(/^[0-9a-fA-F]{24}$/)) {
      andConditions.push({ category })
    }

    // Parent category filter (only if subcategory is not present)
    if (!subcategory && parentCategory && parentCategory.match(/^[0-9a-fA-F]{24}$/)) {
      andConditions.push({ parentCategory })
    }

    // Subcategory filter
    if (subcategory && subcategory.match(/^[0-9a-fA-F]{24}$/)) {
      andConditions.push({
        $or: [
          { category: subcategory },
          { subCategory: subcategory },
          { subCategory2: subcategory },
          { subCategory3: subcategory },
          { subCategory4: subcategory },
        ],
      })
    }

    // Search filter
    if (typeof search === "string" && search.trim()) {
      const safeSearch = escapeRegex(search.trim())
      const regex = new RegExp(safeSearch, "i")

      // Find matching brands by name for search
      const matchingBrands = await Brand.find({ name: regex }).select("_id").lean()
      const brandIds = matchingBrands.map((b) => b._id)

      andConditions.push({
        $or: [
          { name: regex },
          { description: regex },
          { sku: regex },
          { barcode: regex },
          { tags: regex },
          { brand: { $in: brandIds } },
        ],
      })
    }

    // Brand filter
    if (brand) {
      if (Array.isArray(brand)) {
        andConditions.push({ brand: { $in: brand } })
      } else if (typeof brand === "string" && brand.match(/^[0-9a-fA-F]{24}$/)) {
        andConditions.push({ brand })
      }
    }

    // Featured filter
    if (featured === "true") {
      andConditions.push({ featured: true })
    }

    const query = andConditions.length > 1 ? { $and: andConditions } : andConditions[0]

    let productsQuery = Product.find(query)
      .select(
        "name nameAr slug sku shortDescription shortDescriptionAr description descriptionAr price offerPrice discount image countInStock stockStatus stockStatusAr brand category subCategory parentCategory subCategory2 subCategory3 subCategory4 featured tags createdAt rating numReviews",
      )
      .populate("brand", "name nameAr slug")
      .populate("category", "name nameAr slug")
      .populate("subCategory", "name nameAr slug") // Populate legacy subCategory field
      .populate("parentCategory", "name nameAr slug")
      .populate("subCategory2", "name nameAr slug") // Populate Level 2 subcategories
      .populate("subCategory3", "name nameAr slug") // Populate Level 3 subcategories
      .populate("subCategory4", "name nameAr slug") // Populate Level 4 subcategories
      .lean() // Use lean() for better performance
      .sort({ createdAt: -1 })

    // Apply limit only if specified (for specific use cases)
    if (limit && !isNaN(limit)) {
      productsQuery = productsQuery.limit(Number.parseInt(limit))
    }

    const products = await productsQuery

    res.json(products)
  }),
)

// @desc    Fetch products with pagination (for specific use cases)
// @route   GET /api/products/paginated
// @access  Public
router.get(
  "/paginated",
  cacheMiddleware('products'),
  asyncHandler(async (req, res) => {
  const { category, subcategory, parentCategory, featured, search, page = 1, limit = 20, brand } = req.query

    const andConditions = [{ isActive: true }, { hideFromShop: { $ne: true } }]

    if (category && category !== "all" && category.match(/^[0-9a-fA-F]{24}$/)) {
      andConditions.push({ category })
    }
    if (!subcategory && parentCategory && parentCategory.match(/^[0-9a-fA-F]{24}$/)) {
      andConditions.push({ parentCategory })
    }
    if (subcategory && subcategory.match(/^[0-9a-fA-F]{24}$/)) {
      andConditions.push({
        $or: [
          { category: subcategory },
          { subCategory: subcategory },
          { subCategory2: subcategory },
          { subCategory3: subcategory },
          { subCategory4: subcategory },
        ],
      })
    }

    if (typeof search === "string" && search.trim()) {
      const safeSearch = escapeRegex(search.trim())
      const regex = new RegExp(safeSearch, "i")
      const matchingBrands = await Brand.find({ name: regex }).select("_id").lean()
      const brandIds = matchingBrands.map((b) => b._id)

      andConditions.push({
        $or: [
          { name: regex },
          { description: regex },
          { sku: regex },
          { barcode: regex },
          { tags: regex },
          { brand: { $in: brandIds } },
        ],
      })
    }

    if (brand) {
      if (Array.isArray(brand)) {
        andConditions.push({ brand: { $in: brand } })
      } else if (typeof brand === "string" && brand.match(/^[0-9a-fA-F]{24}$/)) {
        andConditions.push({ brand })
      }
    }

    if (featured === "true") {
      andConditions.push({ featured: true })
    }

    const query = andConditions.length > 1 ? { $and: andConditions } : andConditions[0]

    // Get total count for pagination info
    const totalCount = await Product.countDocuments(query)

    const products = await Product.find(query)
      .select(
        "name nameAr slug sku shortDescription shortDescriptionAr description descriptionAr price offerPrice discount image countInStock stockStatus stockStatusAr brand category parentCategory featured tags createdAt rating numReviews",
      )
      .populate("brand", "name nameAr slug")
      .populate("category", "name nameAr slug")
      .populate("parentCategory", "name nameAr slug")
      .lean()
      .skip((page - 1) * Number.parseInt(limit))
      .limit(Number.parseInt(limit))
      .sort({ createdAt: -1 })

    res.json({
      products,
      totalCount,
      currentPage: Number.parseInt(page),
      totalPages: Math.ceil(totalCount / Number.parseInt(limit)),
      hasMore: Number.parseInt(page) * Number.parseInt(limit) < totalCount,
    })
  }),
)

// @desc    Fetch products by SKU array
// @route   POST /api/products/by-skus
// @access  Public
router.post(
  "/by-skus",
  asyncHandler(async (req, res) => {
    const { skus } = req.body

    if (!skus || !Array.isArray(skus)) {
      return res.status(400).json({ message: "SKUs array is required" })
    }

    // Allow fetching products by SKU regardless of hideFromShop status
    // Hidden products should be accessible via SKU lookup
    const products = await Product.find({
      sku: { $in: skus },
      isActive: true,
      // Note: We don't filter by hideFromShop here because SKU lookup should work for all products
    })
      .populate("category", "name slug")
      .populate("subCategory", "name slug")
      .populate("brand", "name slug")
      .populate("parentCategory", "name slug")

    res.json(products)
  }),
)

// @desc    Bulk move products to new categories
// @route   PUT /api/products/bulk-move
// @access  Private/Admin
router.put(
  "/bulk-move",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    try {
      console.log('Bulk move request received:', req.body)
      
      const { productIds, parentCategory, category, subCategory2, subCategory3, subCategory4 } = req.body

      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        res.status(400)
        throw new Error("Product IDs are required")
      }

      if (!parentCategory) {
        res.status(400)
        throw new Error("Parent category is required")
      }

      // Verify parent category exists
      const parentCategoryExists = await Category.findById(parentCategory)
      if (!parentCategoryExists) {
        res.status(400)
        throw new Error("Invalid parent category")
      }

      // Verify subcategories if provided (only if not null/empty)
      if (category && category !== '') {
        const categoryExists = await SubCategory.findById(category)
        if (!categoryExists) {
          res.status(400)
          throw new Error("Invalid subcategory level 1")
        }
      }

      if (subCategory2 && subCategory2 !== '') {
        const subCategory2Exists = await SubCategory.findById(subCategory2)
        if (!subCategory2Exists) {
          res.status(400)
          throw new Error("Invalid subcategory level 2")
        }
      }

      if (subCategory3 && subCategory3 !== '') {
        const subCategory3Exists = await SubCategory.findById(subCategory3)
        if (!subCategory3Exists) {
          res.status(400)
          throw new Error("Invalid subcategory level 3")
        }
      }

      if (subCategory4 && subCategory4 !== '') {
        const subCategory4Exists = await SubCategory.findById(subCategory4)
        if (!subCategory4Exists) {
          res.status(400)
          throw new Error("Invalid subcategory level 4")
        }
      }

      // Prepare update object - only set fields that have values
      const updateData = {
        parentCategory,
      }

      if (category && category !== '') {
        updateData.category = category
        updateData.subCategory = category // for backward compatibility
      } else {
        updateData.category = null
        updateData.subCategory = null
      }

      if (subCategory2 && subCategory2 !== '') {
        updateData.subCategory2 = subCategory2
      } else {
        updateData.subCategory2 = null
      }

      if (subCategory3 && subCategory3 !== '') {
        updateData.subCategory3 = subCategory3
      } else {
        updateData.subCategory3 = null
      }

      if (subCategory4 && subCategory4 !== '') {
        updateData.subCategory4 = subCategory4
      } else {
        updateData.subCategory4 = null
      }

      console.log('Updating products with data:', updateData)
      console.log('Product IDs:', productIds)

      // Update all products
      const result = await Product.updateMany(
        { _id: { $in: productIds } },
        { $set: updateData }
      )

      console.log('Update result:', result)

      // Invalidate storefront product cache after bulk category move
      await invalidateCache("products")

      res.json({
        message: `Successfully moved ${result.modifiedCount} product(s)`,
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount,
      })
    } catch (error) {
      console.error('Bulk move error:', error)
      res.status(500)
      throw error
    }
  }),
)

// @desc    Bulk update product status (active/inactive/onhold)
// @route   PUT /api/products/bulk-status
// @access  Private/Admin
router.put(
  "/bulk-status",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    try {
      console.log('Bulk status update request received:', req.body)
      
      const { productIds, isActive, onHold } = req.body

      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        res.status(400)
        throw new Error("Product IDs are required")
      }

      // Prepare update object
      const updateData = {}
      
      if (typeof isActive === 'boolean') {
        updateData.isActive = isActive
      }
      
      if (typeof onHold === 'boolean') {
        updateData.onHold = onHold
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400)
        throw new Error("At least one status field (isActive or onHold) is required")
      }

      console.log('Updating products with status:', updateData)
      console.log('Product IDs count:', productIds.length)

      // Update all products
      const result = await Product.updateMany(
        { _id: { $in: productIds } },
        { $set: updateData }
      )

      console.log('Update result:', result)

      // Invalidate storefront product cache after bulk status update
      await invalidateCache("products")

      // Determine status message
      let statusMessage = ""
      if (updateData.onHold === true) {
        statusMessage = "hidden from shop"
      } else if (updateData.isActive === true) {
        statusMessage = "activated"
      } else if (updateData.isActive === false) {
        statusMessage = "deactivated"
      }

      // Log activity
      if (req.user) {
        await logActivity({
          user: req.user,
          action: "BULK_ACTION",
          module: "PRODUCTS",
          description: `Bulk ${statusMessage} ${result.modifiedCount} product(s)`,
          newData: { productCount: productIds.length, status: updateData },
          req,
        })
      }

      res.json({
        message: `Successfully ${statusMessage} ${result.modifiedCount} product(s)`,
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount,
      })
    } catch (error) {
      console.error('Bulk status update error:', error)
      res.status(500)
      throw error
    }
  }),
)

// @desc    Fetch single product by ID
// @route   GET /api/products/:id
// @access  Public
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)
      .populate("category", "name nameAr slug")
      .populate("brand", "name nameAr")

    if (product && product.isActive) {
      res.json(product)
    } else {
      res.status(404)
      throw new Error("Product not found")
    }
  }),
)

// @desc    Fetch single product by slug
// @route   GET /api/products/slug/:slug
// @access  Public
router.get(
  "/slug/:slug",
  asyncHandler(async (req, res) => {
    const rawSlug = typeof req.params.slug === "string" ? req.params.slug : ""
    let decodedSlug = rawSlug
    try {
      decodedSlug = decodeURIComponent(rawSlug)
    } catch {
      decodedSlug = rawSlug
    }
    const trimmedSlug = decodedSlug.trim().replace(/^\/+|\/+$/g, "")
    const sanitizedSlug = sanitizeSlug(trimmedSlug)
    const slugCandidates = Array.from(new Set([decodedSlug, trimmedSlug, sanitizedSlug].filter(Boolean)))

    // Allow access to active products (both visible and hidden from shop)
    // This ensures hidden products are accessible via direct link and variations
    const product = await Product.findOne({ 
      slug: { $in: slugCandidates }, 
      isActive: true 
      // Note: We don't filter by hideFromShop here because hidden products should be accessible via direct link
    })
      .populate("parentCategory", "name nameAr slug")
      .populate("category", "name nameAr slug")
      .populate("subCategory2", "name nameAr slug")
      .populate("subCategory3", "name nameAr slug")
      .populate("subCategory4", "name nameAr slug")
      .populate("brand", "name nameAr")
      .populate({
        path: "variations.product",
        select: "name nameAr slug image price offerPrice sku isActive hideFromShop selfVariationText selfVariationTextAr reverseVariationText reverseVariationTextAr",
        // Populate all variation products regardless of hideFromShop status
        // This ensures hidden variations are visible in the variations section
      })

    if (product) {
      res.json(product)
    } else {
      res.status(404)
      throw new Error("Product not found")
    }
  }),
)

// @desc    Create a product review
// @route   POST /api/products/:id/reviews
// @access  Private
router.post(
  "/:id/reviews",
  protect,
  asyncHandler(async (req, res) => {
    const { rating, comment, name } = req.body

    const product = await Product.findById(req.params.id)

    if (product) {
      const alreadyReviewed = product.reviews.find((r) => r.user.toString() === req.user._id.toString())

      if (alreadyReviewed) {
        res.status(400)
        throw new Error("Product already reviewed")
      }

      const review = {
        name: name || req.user.name,
        rating: Number(rating),
        comment,
        user: req.user._id,
        createdAt: new Date(),
      }

      product.reviews.push(review)

      // Properly calculate numReviews and rating
      product.numReviews = product.reviews.length
      product.rating = product.reviews.reduce((acc, item) => Number(item.rating) + acc, 0) / product.reviews.length

      await product.save()

      // Log the updated values for debugging
      console.log(
        "Review added - Product:",
        product.name,
        "New Rating:",
        product.rating,
        "NumReviews:",
        product.numReviews,
      )

      res.status(201).json({ message: "Review added", rating: product.rating, numReviews: product.numReviews })
    } else {
      res.status(404)
      throw new Error("Product not found")
    }
  }),
)

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { parentCategory, category, subCategory2, subCategory3, subCategory4, ...productData } = req.body

    // Verify parentCategory exists
    if (parentCategory) {
      const parentCategoryExists = await Category.findById(parentCategory)
      if (!parentCategoryExists) {
        res.status(400)
        throw new Error("Invalid parent category")
      }
    } else {
      res.status(400)
      throw new Error("Parent category is required")
    }

    // Verify subcategory exists if provided
    if (category) {
      const subCategoryExists = await SubCategory.findById(category)
      if (!subCategoryExists) {
        res.status(400)
        throw new Error("Invalid subcategory")
      }
    }

    // Verify subCategory2 exists if provided
    if (subCategory2) {
      const subCategory2Exists = await SubCategory.findById(subCategory2)
      if (!subCategory2Exists) {
        res.status(400)
        throw new Error("Invalid subcategory level 2")
      }
    }

    // Verify subCategory3 exists if provided
    if (subCategory3) {
      const subCategory3Exists = await SubCategory.findById(subCategory3)
      if (!subCategory3Exists) {
        res.status(400)
        throw new Error("Invalid subcategory level 3")
      }
    }

    // Verify subCategory4 exists if provided
    if (subCategory4) {
      const subCategory4Exists = await SubCategory.findById(subCategory4)
      if (!subCategory4Exists) {
        res.status(400)
        throw new Error("Invalid subcategory level 4")
      }
    }

    // Sanitize slug if provided and check uniqueness
    if (productData.slug) {
      productData.slug = sanitizeSlug(productData.slug)
      const existingProduct = await Product.findOne({ slug: productData.slug })
      if (existingProduct) {
        res.status(400)
        throw new Error("Product slug already exists")
      }
    }

    const normalizedSKU = normalizeOptionalUniqueField(productData.sku)
    const normalizedBarcode = normalizeOptionalUniqueField(productData.barcode)
    const normalizedGTIN = normalizeOptionalUniqueField(productData.gtin)

    // Check SKU uniqueness if provided
    if (normalizedSKU) {
      const existingSKU = await Product.findOne({ sku: normalizedSKU })
      if (existingSKU) {
        res.status(400)
        throw new Error(`SKU '${normalizedSKU}' already exists`)
      }
    }

    // Check barcode uniqueness if provided
    if (normalizedBarcode) {
      const existingBarcode = await Product.findOne({ barcode: normalizedBarcode })
      if (existingBarcode) {
        res.status(400)
        throw new Error(`Barcode '${normalizedBarcode}' already exists`)
      }
    }

    // Check GTIN uniqueness if provided
    if (normalizedGTIN) {
      const existingGTIN = await Product.findOne({ gtin: normalizedGTIN })
      if (existingGTIN) {
        res.status(400)
        throw new Error(`GTIN '${normalizedGTIN}' already exists`)
      }
    }

    // Ensure slug exists
    if (!productData.slug && productData.name) {
      productData.slug = generateSlug(productData.name)
    }

    // Normalize optional unique fields - set to undefined if empty to work with sparse index
    productData.sku = normalizedSKU
    productData.barcode = normalizedBarcode
    productData.gtin = normalizedGTIN

    // Translate product fields
    let nameAr = "";
    let descriptionAr = "";
    let shortDescriptionAr = "";
    let tagsAr = [];

    if (productData.name) {
      nameAr = await translateText(productData.name);
    }
    if (productData.description) {
      descriptionAr = await translateText(productData.description);
    }
    if (productData.shortDescription) {
      shortDescriptionAr = await translateText(productData.shortDescription);
    }
    if (productData.tags && Array.isArray(productData.tags)) {
      tagsAr = await Promise.all(productData.tags.map(t => translateText(t)));
    }

    // Translate specifications
    if (productData.specifications && Array.isArray(productData.specifications)) {
      for (const spec of productData.specifications) {
        if (spec.key && !spec.keyAr) spec.keyAr = await translateText(spec.key);
        if (spec.value && !spec.valueAr) spec.valueAr = await translateText(spec.value);
      }
    }

    // Translate stock status
    let stockStatusAr = "";
    if (productData.stockStatus) {
      stockStatusAr = await translateText(productData.stockStatus);
    }

    // Translate variation texts
    let reverseVariationTextAr = "";
    let selfVariationTextAr = "";
    if (productData.reverseVariationText) {
      reverseVariationTextAr = await translateText(productData.reverseVariationText);
    }
    if (productData.selfVariationText) {
      selfVariationTextAr = await translateText(productData.selfVariationText);
    }

    if (productData.variations && Array.isArray(productData.variations)) {
      for (const v of productData.variations) {
        if (v.variationText && !v.variationTextAr) {
          v.variationTextAr = await translateText(v.variationText);
        }
      }
    }

    const product = new Product({
      ...productData,
      nameAr,
      descriptionAr,
      shortDescriptionAr,
      tagsAr,
      stockStatusAr,
      reverseVariationTextAr,
      selfVariationTextAr,
      parentCategory,
      category,
      subCategory: category || undefined, // for backward compatibility
      subCategory2: subCategory2 || undefined,
      subCategory3: subCategory3 || undefined,
      subCategory4: subCategory4 || undefined,
      createdBy: req.user._id,
    })

    const createdProduct = await product.save()
    
    // Bidirectional variation sync: Update all related products
    if (productData.variations && Array.isArray(productData.variations)) {
      const selfText = productData.selfVariationText || productData.reverseVariationText || ""
      const variationIds = productData.variations
        .filter(v => v && v.product && v.product !== createdProduct._id.toString())
        .map(v => v.product)
      
      console.log(`[SYNC] Product ${createdProduct._id} adding variations:`, variationIds)
      console.log(`[SYNC] Self variation text:`, selfText)
      
      // For each variation in this product
      for (const variationId of variationIds) {
        const variationProduct = await Product.findById(variationId)
        if (variationProduct) {
          let modified = false
          
          // Add current product to the variation's variations list if not already there
          const existingVariationIndex = variationProduct.variations.findIndex(
            v => (v.product || v).toString() === createdProduct._id.toString()
          )
          if (existingVariationIndex === -1) {
            console.log(`[SYNC] Adding product ${createdProduct._id} to ${variationProduct._id}'s variations`)
            // Note: We store empty variationText here because we'll use selfVariationText from the product itself
            variationProduct.variations.push({ 
              product: createdProduct._id, 
              variationText: "" 
            })
            variationProduct.markModified('variations')
            modified = true
          }
          
          // Also sync other variations bidirectionally (full mesh connectivity)
          const otherVariationIds = variationIds.filter(id => id !== variationId)
          for (const otherId of otherVariationIds) {
            const hasOther = variationProduct.variations.some(
              v => (v.product || v).toString() === otherId
            )
            if (!hasOther) {
              console.log(`[SYNC] Adding cross-variation ${otherId} to ${variationProduct._id}`)
              variationProduct.variations.push({ product: otherId, variationText: "" })
              variationProduct.markModified('variations')
              modified = true
            }
          }
          
          if (modified) {
            await variationProduct.save()
            console.log(`[SYNC] Saved ${variationProduct._id} with ${variationProduct.variations.length} variations`)
          }
        }
      }
    }
    

    
    const populatedProduct = await Product.findById(createdProduct._id)
      .populate("parentCategory", "name slug")
      .populate("category", "name slug")
      .populate("subCategory2", "name slug")
      .populate("subCategory3", "name slug")
      .populate("subCategory4", "name slug")
      .populate("brand", "name")
      .populate({
        path: "variations.product",
        select: "name slug image price offerPrice sku selfVariationText reverseVariationText"
      })

    // Log activity
    await logActivity(req, "CREATE", "PRODUCTS", `Created product: ${createdProduct.name}`, createdProduct._id, createdProduct.name)

    // Invalidate product cache
    await invalidateCache('products')

    res.status(201).json(populatedProduct)
  }),
)

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)

    if (product) {
      const { parentCategory, category, subCategory2, subCategory3, subCategory4, slug, ...updateData } = req.body

      // Verify parentCategory exists if provided
      if (parentCategory) {
        const parentCategoryExists = await Category.findById(parentCategory)
        if (!parentCategoryExists) {
          res.status(400)
          throw new Error("Invalid parent category")
        }
      }

      // Verify subcategory exists if provided
      if (category) {
        const subCategoryExists = await SubCategory.findById(category)
        if (!subCategoryExists) {
          res.status(400)
          throw new Error("Invalid subcategory")
        }
      }

      // Verify subCategory2 exists if provided
      if (subCategory2) {
        const subCategory2Exists = await SubCategory.findById(subCategory2)
        if (!subCategory2Exists) {
          res.status(400)
          throw new Error("Invalid subcategory level 2")
        }
      }

      // Verify subCategory3 exists if provided
      if (subCategory3) {
        const subCategory3Exists = await SubCategory.findById(subCategory3)
        if (!subCategory3Exists) {
          res.status(400)
          throw new Error("Invalid subcategory level 3")
        }
      }

      // Verify subCategory4 exists if provided
      if (subCategory4) {
        const subCategory4Exists = await SubCategory.findById(subCategory4)
        if (!subCategory4Exists) {
          res.status(400)
          throw new Error("Invalid subcategory level 4")
        }
      }

      // Check if slug is unique (excluding current product)
      if (slug && slug !== product.slug) {
        const cleanSlug = sanitizeSlug(slug)
        const existingProduct = await Product.findOne({ slug: cleanSlug, _id: { $ne: req.params.id } })
        if (existingProduct) {
          res.status(400)
          throw new Error("Product slug already exists")
        }
        product.slug = cleanSlug
      }

      // Check SKU uniqueness if provided and changed (excluding current product)
      if (updateData.sku !== undefined) {
        const newSKU = normalizeOptionalUniqueField(updateData.sku)
        if (newSKU && newSKU !== product.sku) {
          const existingSKU = await Product.findOne({ sku: newSKU, _id: { $ne: req.params.id } })
          if (existingSKU) {
            res.status(400)
            throw new Error(`SKU '${newSKU}' already exists`)
          }
        }
        updateData.sku = newSKU
      }

      // Check barcode uniqueness if provided and changed (excluding current product)
      if (updateData.barcode !== undefined) {
        const newBarcode = normalizeOptionalUniqueField(updateData.barcode)
        if (newBarcode && newBarcode !== product.barcode) {
          const existingBarcode = await Product.findOne({ barcode: newBarcode, _id: { $ne: req.params.id } })
          if (existingBarcode) {
            res.status(400)
            throw new Error(`Barcode '${newBarcode}' already exists`)
          }
        }
        updateData.barcode = newBarcode
      }

      // Check GTIN uniqueness if provided and changed (excluding current product)
      if (updateData.gtin !== undefined) {
        const newGTIN = normalizeOptionalUniqueField(updateData.gtin)
        if (newGTIN && newGTIN !== product.gtin) {
          const existingGTIN = await Product.findOne({ gtin: newGTIN, _id: { $ne: req.params.id } })
          if (existingGTIN) {
            res.status(400)
            throw new Error(`GTIN '${newGTIN}' already exists`)
          }
        }
        updateData.gtin = newGTIN
      }

      // Update product fields
      for (const key of Object.keys(updateData)) {
        product[key] = updateData[key]
      }

      // Translate updated fields
      if (updateData.name !== undefined) product.nameAr = await translateText(product.name);
      if (updateData.description !== undefined) product.descriptionAr = await translateText(product.description);
      if (updateData.shortDescription !== undefined) product.shortDescriptionAr = await translateText(product.shortDescription);
      if (updateData.tags !== undefined) {
        if (Array.isArray(product.tags)) {
          product.tagsAr = await Promise.all(product.tags.map(t => translateText(t)));
        } else {
          product.tagsAr = [];
        }
      }

      // Translate specifications
      if (updateData.specifications !== undefined && Array.isArray(product.specifications)) {
        for (const spec of product.specifications) {
          if (spec.key && !spec.keyAr) spec.keyAr = await translateText(spec.key);
          if (spec.value && !spec.valueAr) spec.valueAr = await translateText(spec.value);
        }
      }

      // Translate stock status
      if (updateData.stockStatus !== undefined) {
        product.stockStatusAr = await translateText(product.stockStatus);
      }

      // Translate variation texts
      if (updateData.reverseVariationText !== undefined) {
        product.reverseVariationTextAr = await translateText(product.reverseVariationText);
      }
      if (updateData.selfVariationText !== undefined) {
        product.selfVariationTextAr = await translateText(product.selfVariationText);
      }

      if (updateData.variations !== undefined && Array.isArray(product.variations)) {
        for (const v of product.variations) {
          if (v.variationText && !v.variationTextAr) {
            v.variationTextAr = await translateText(v.variationText);
          }
        }
      }

      if (parentCategory) product.parentCategory = parentCategory
      if (category) {
        product.category = category
        product.subCategory = category // for backward compatibility
      }
      if (subCategory2 !== undefined) product.subCategory2 = subCategory2
      if (subCategory3 !== undefined) product.subCategory3 = subCategory3
      if (subCategory4 !== undefined) product.subCategory4 = subCategory4
  // product.slug already set above if slug was provided

      const updatedProduct = await product.save()
      
      // Bidirectional variation sync: Update all related products
      if (updateData.variations && Array.isArray(updateData.variations)) {
        const selfText = updateData.selfVariationText || updateData.reverseVariationText || ""
        const variationIds = updateData.variations
          .filter(v => v && v.product && v.product !== product._id.toString())
          .map(v => v.product)
        
        console.log(`[UPDATE SYNC] Product ${product._id} updating variations:`, variationIds)
        console.log(`[UPDATE SYNC] Self variation text:`, selfText)
        
        // For each variation in this product
        for (const variationId of variationIds) {
          const variationProduct = await Product.findById(variationId)
          if (variationProduct) {
            let modified = false
            
            // Add current product to the variation's variations list if not already there
            const existingVariationIndex = variationProduct.variations.findIndex(
              v => (v.product || v).toString() === product._id.toString()
            )
            if (existingVariationIndex === -1) {
              console.log(`[UPDATE SYNC] Adding product ${product._id} to ${variationProduct._id}'s variations`)
              // Note: We store empty variationText here because we use selfVariationText from the product itself
              variationProduct.variations.push({ 
                product: product._id, 
                variationText: "" 
              })
              variationProduct.markModified('variations')
              modified = true
            }
            
            // Also sync other variations bidirectionally (full mesh connectivity)
            const otherVariationIds = variationIds.filter(id => id !== variationId)
            for (const otherId of otherVariationIds) {
              const hasOther = variationProduct.variations.some(
                v => (v.product || v).toString() === otherId
              )
              if (!hasOther) {
                console.log(`[UPDATE SYNC] Adding cross-variation ${otherId} to ${variationProduct._id}`)
                variationProduct.variations.push({ product: otherId, variationText: "" })
                variationProduct.markModified('variations')
                modified = true
              }
            }
            
            if (modified) {
              await variationProduct.save()
              console.log(`[UPDATE SYNC] Saved ${variationProduct._id} with ${variationProduct.variations.length} variations`)
            }
          }
        }
        
        // Remove current product from variations of products no longer in the list
        const allProducts = await Product.find({ 
          "variations.product": product._id,
          _id: { $ne: product._id }
        })
        console.log(`[UPDATE SYNC] Found ${allProducts.length} products with current product in variations`)
        for (const relatedProduct of allProducts) {
          if (!variationIds.includes(relatedProduct._id.toString())) {
            console.log(`[UPDATE SYNC] Removing product ${product._id} from ${relatedProduct._id}'s variations`)
            relatedProduct.variations = relatedProduct.variations.filter(
              v => (v.product || v).toString() !== product._id.toString()
            )
            relatedProduct.markModified('variations')
            await relatedProduct.save()
          }
        }
      }
      

      
      const populatedProduct = await Product.findById(updatedProduct._id)
        .populate("parentCategory", "name slug")
        .populate("category", "name slug")
        .populate("subCategory2", "name slug")
        .populate("subCategory3", "name slug")
        .populate("subCategory4", "name slug")
        .populate("brand", "name")
        .populate({
          path: "variations.product",
          select: "name slug image price offerPrice sku selfVariationText reverseVariationText"
        })

      // Log activity
      await logActivity(req, "UPDATE", "PRODUCTS", `Updated product: ${updatedProduct.name}`, updatedProduct._id, updatedProduct.name)

      // Invalidate product cache
      await invalidateCache('products')

      res.json(populatedProduct)
    } else {
      res.status(404)
      throw new Error("Product not found")
    }
  }),
)

// @desc    Duplicate a product
// @route   POST /api/products/:id/duplicate
// @access  Private/Admin
router.post(
  "/:id/duplicate",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)

    if (!product) {
      res.status(404)
      throw new Error("Product not found")
    }

    // Helper function to increment last digit
    const incrementLastDigit = (str) => {
      if (!str || str.trim() === "") return undefined
      const match = str.match(/^(.*?)(\d+)$/)
      if (match) {
        const prefix = match[1]
        const number = Number.parseInt(match[2])
        const incremented = number + 1
        // Preserve leading zeros
        const paddedNumber = String(incremented).padStart(match[2].length, '0')
        return prefix + paddedNumber
      }
      // If no number at end, append -1
      return str + "-1"
    }

    // Duplicate SKU with incremented last digit
    let newSKU = incrementLastDigit(product.sku)
    if (newSKU) {
      // Ensure SKU is unique
      let counter = 1
      while (await Product.findOne({ sku: newSKU })) {
        newSKU = incrementLastDigit(newSKU)
        counter++
        if (counter > 100) {
          // Safety limit to prevent infinite loop
          newSKU = `${product.sku}-copy-${Date.now()}`
          break
        }
      }
    }

    // Duplicate barcode with incremented last digit
    let newBarcode = incrementLastDigit(product.barcode)
    if (newBarcode) {
      // Ensure barcode is unique
      let counter = 1
      while (await Product.findOne({ barcode: newBarcode })) {
        newBarcode = incrementLastDigit(newBarcode)
        counter++
        if (counter > 100) {
          // Safety limit to prevent infinite loop
          newBarcode = `${product.barcode}-copy-${Date.now()}`
          break
        }
      }
    }

    // Helper to extract base name and copy number
    const extractCopyInfo = (name) => {
      // Match patterns like "Product Name (Copy)", "Product Name (Copy 1)", "Product Name (Copy 2)", etc.
      const copyMatch = name.match(/^(.+?)\s*\(Copy\s*(\d*)\)$/i)
      if (copyMatch) {
        const baseName = copyMatch[1].trim()
        const copyNum = copyMatch[2] ? parseInt(copyMatch[2]) : 0
        return { baseName, copyNum }
      }
      return { baseName: name, copyNum: null }
    }

    // Generate new product name with incremental copy number
    const { baseName, copyNum } = extractCopyInfo(product.name)
    let newName
    if (copyNum === null) {
      newName = `${baseName} (Copy)`
    } else {
      newName = `${baseName} (Copy ${copyNum + 1})`
    }

    // Ensure name is unique
    let nameCounter = copyNum !== null ? copyNum + 1 : 1
    while (await Product.findOne({ name: newName })) {
      if (nameCounter === 1 && copyNum === null) {
        newName = `${baseName} (Copy 1)`
      } else {
        newName = `${baseName} (Copy ${nameCounter})`
      }
      nameCounter++
    }

    // Extract base slug and copy number from slug
    const extractSlugCopyInfo = (slug) => {
      const duplicateMatch = slug.match(/^(.+?)-duplicate(?:-(\d+))?$/)
      if (duplicateMatch) {
        const baseSlug = duplicateMatch[1]
        const copyNum = duplicateMatch[2] ? parseInt(duplicateMatch[2]) : 0
        return { baseSlug, copyNum }
      }
      return { baseSlug: slug, copyNum: null }
    }

    // Generate new slug with incremental number
    const { baseSlug, copyNum: slugCopyNum } = extractSlugCopyInfo(product.slug)
    let newSlug
    if (slugCopyNum === null) {
      newSlug = `${baseSlug}-duplicate`
    } else {
      newSlug = `${baseSlug}-duplicate-${slugCopyNum + 1}`
    }

    // Ensure slug is unique
    let slugCounter = slugCopyNum !== null ? slugCopyNum + 1 : 1
    while (await Product.findOne({ slug: newSlug })) {
      newSlug = `${baseSlug}-duplicate-${slugCounter}`
      slugCounter++
    }

    // Collect all products in the original product's variation group
    const variationGroupIds = new Set()
    variationGroupIds.add(product._id.toString())
    
    // Add original product's variations
    if (product.variations && product.variations.length > 0) {
      product.variations.forEach(v => {
        const varId = (v.product || v).toString()
        variationGroupIds.add(varId)
      })
    }

    // Create duplicated product with link to original and its variation group
    const duplicatedProduct = new Product({
      name: newName,
      slug: newSlug,
      sku: newSKU,
      barcode: newBarcode,
      stockStatus: product.stockStatus,
      brand: product.brand,
      parentCategory: product.parentCategory,
      category: product.category,
      subCategory: product.subCategory,
      subCategory2: product.subCategory2,
      subCategory3: product.subCategory3,
      subCategory4: product.subCategory4,
      description: product.description,
      shortDescription: product.shortDescription,
      buyingPrice: product.buyingPrice,
      price: product.price,
      offerPrice: product.offerPrice,
      discount: product.discount,
      oldPrice: product.oldPrice,
      image: product.image,
      galleryImages: product.galleryImages,
      countInStock: product.countInStock,
      lowStockWarning: product.lowStockWarning,
      maxPurchaseQty: product.maxPurchaseQty,
      weight: product.weight,
      unit: product.unit,
      tax: product.tax,
      deliveryCharge: product.deliveryCharge,
      tags: product.tags,
      isActive: false, // Set duplicated products to inactive by default
      canPurchase: product.canPurchase,
      showStockOut: product.showStockOut,
      refundable: product.refundable,
      featured: false, // Don't duplicate featured status
      specifications: product.specifications,
      colorVariations: product.colorVariations || [],
      dosVariations: product.dosVariations || [],
      // Link to original product and all its existing variations
      variations: Array.from(variationGroupIds).map(id => ({
        product: id,
        variationText: "" // Will be updated when user edits the duplicated product
      })),
      selfVariationText: "", // User should set this when editing
      reverseVariationText: "", // Backward compatibility
      createdBy: req.user._id,
    })

    const createdProduct = await duplicatedProduct.save()
    
    // Bidirectional sync: Add the duplicated product to all products in the variation group
    console.log(`[DUPLICATE SYNC] Adding duplicated product ${createdProduct._id} to variation group:`, Array.from(variationGroupIds))
    
    for (const groupProductId of variationGroupIds) {
      const groupProduct = await Product.findById(groupProductId)
      if (groupProduct) {
        // Check if duplicated product is already in variations
        const alreadyExists = groupProduct.variations.some(
          v => (v.product || v).toString() === createdProduct._id.toString()
        )
        
        if (!alreadyExists) {
          groupProduct.variations.push({
            product: createdProduct._id,
            variationText: "" // Will show duplicated product's selfVariationText
          })
          groupProduct.markModified('variations')
          await groupProduct.save()
          console.log(`[DUPLICATE SYNC] Added ${createdProduct._id} to ${groupProductId}'s variations`)
        }
      }
    }
    
    // Populate references for response
    const populatedProduct = await Product.findById(createdProduct._id)
      .populate("parentCategory", "name slug")
      .populate("category", "name slug")
      .populate("subCategory2", "name slug")
      .populate("subCategory3", "name slug")
      .populate("subCategory4", "name slug")
      .populate("brand", "name")
      .populate({
        path: "variations.product",
        select: "name slug image price offerPrice sku selfVariationText"
      })

    // Log activity
    await logActivity(req, "CREATE", "PRODUCTS", `Duplicated product: ${populatedProduct.name} (from ${product.name})`, populatedProduct._id, populatedProduct.name)

    // Invalidate product cache so storefront/admin lists refresh
    await invalidateCache("products")

    res.status(201).json(populatedProduct)
  }),
)

// Helper function to extract media URLs from HTML description (TipTap content)
const extractMediaUrlsFromHtml = (html) => {
  const urls = []
  if (!html) return urls

  // Match image src attributes
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    if (match[1] && match[1].includes('/uploads/')) {
      urls.push(match[1])
    }
  }

  // Match video src attributes
  const videoRegex = /<video[^>]+src=["']([^"']+)["']/gi
  while ((match = videoRegex.exec(html)) !== null) {
    if (match[1] && match[1].includes('/uploads/')) {
      urls.push(match[1])
    }
  }

  // Match source src attributes (for video sources)
  const sourceRegex = /<source[^>]+src=["']([^"']+)["']/gi
  while ((match = sourceRegex.exec(html)) !== null) {
    if (match[1] && match[1].includes('/uploads/')) {
      urls.push(match[1])
    }
  }

  return urls
}

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)

    if (product) {
      // Delete main product image
      if (product.image && !isCloudinaryUrl(product.image)) {
        try {
          await deleteLocalFile(product.image)
        } catch (err) {
          console.error("Error deleting product image:", err)
        }
      }

      // Delete gallery images
      if (product.galleryImages && product.galleryImages.length > 0) {
        for (const img of product.galleryImages) {
          if (img && !isCloudinaryUrl(img)) {
            try {
              await deleteLocalFile(img)
            } catch (err) {
              console.error("Error deleting gallery image:", err)
            }
          }
        }
      }

      // Delete main video
      if (product.video && !isCloudinaryUrl(product.video)) {
        try {
          await deleteLocalFile(product.video)
        } catch (err) {
          console.error("Error deleting product video:", err)
        }
      }

      // Delete video gallery
      if (product.videoGallery && product.videoGallery.length > 0) {
        for (const vid of product.videoGallery) {
          if (vid && !isCloudinaryUrl(vid)) {
            try {
              await deleteLocalFile(vid)
            } catch (err) {
              console.error("Error deleting gallery video:", err)
            }
          }
        }
      }

      // Delete color variation images
      if (product.colorVariations && product.colorVariations.length > 0) {
        for (const colorVar of product.colorVariations) {
          if (colorVar.image && !isCloudinaryUrl(colorVar.image)) {
            try {
              await deleteLocalFile(colorVar.image)
            } catch (err) {
              console.error("Error deleting color variation image:", err)
            }
          }
          if (colorVar.galleryImages && colorVar.galleryImages.length > 0) {
            for (const img of colorVar.galleryImages) {
              if (img && !isCloudinaryUrl(img)) {
                try {
                  await deleteLocalFile(img)
                } catch (err) {
                  console.error("Error deleting color variation gallery image:", err)
                }
              }
            }
          }
        }
      }

      // Delete variant images
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          if (variant.image && !isCloudinaryUrl(variant.image)) {
            try {
              await deleteLocalFile(variant.image)
            } catch (err) {
              console.error("Error deleting variant image:", err)
            }
          }
          if (variant.galleryImages && variant.galleryImages.length > 0) {
            for (const img of variant.galleryImages) {
              if (img && !isCloudinaryUrl(img)) {
                try {
                  await deleteLocalFile(img)
                } catch (err) {
                  console.error("Error deleting variant gallery image:", err)
                }
              }
            }
          }
        }
      }

      // Delete media files from description (TipTap content)
      if (product.description) {
        const descriptionMediaUrls = extractMediaUrlsFromHtml(product.description)
        for (const url of descriptionMediaUrls) {
          if (!isCloudinaryUrl(url)) {
            try {
              // Extract the path from full URL if needed
              let filePath = url
              if (url.includes('/uploads/')) {
                filePath = '/uploads/' + url.split('/uploads/')[1]
              }
              await deleteLocalFile(filePath)
            } catch (err) {
              console.error("Error deleting description media:", err)
            }
          }
        }
      }

      // Delete media files from shortDescription (if it has TipTap content)
      if (product.shortDescription) {
        const shortDescMediaUrls = extractMediaUrlsFromHtml(product.shortDescription)
        for (const url of shortDescMediaUrls) {
          if (!isCloudinaryUrl(url)) {
            try {
              let filePath = url
              if (url.includes('/uploads/')) {
                filePath = '/uploads/' + url.split('/uploads/')[1]
              }
              await deleteLocalFile(filePath)
            } catch (err) {
              console.error("Error deleting short description media:", err)
            }
          }
        }
      }

      await product.deleteOne()
      
      // Log activity
      if (req.user) {
        await logActivity({
          user: req.user,
          action: "DELETE",
          module: "PRODUCTS",
          description: `Deleted product: ${product.name} (SKU: ${product.sku || 'N/A'})`,
          targetId: product._id.toString(),
          targetName: product.name,
          previousData: { name: product.name, sku: product.sku, price: product.price },
          req,
        })
      }
      
      // Invalidate product cache
      await invalidateCache('products')
      
      res.json({ message: "Product removed" })
    } else {
      res.status(404)
      throw new Error("Product not found")
    }
  }),
)

// @desc    Get products by category
// @route   GET /api/products/category/:categoryId
// @access  Public
router.get(
  "/category/:categoryId",
  asyncHandler(async (req, res) => {
    const products = await Product.find({
      isActive: true,
      hideFromShop: { $ne: true },
      $or: [
        { category: req.params.categoryId },
        { subCategory: req.params.categoryId },
        { subCategory2: req.params.categoryId },
        { subCategory3: req.params.categoryId },
        { subCategory4: req.params.categoryId },
      ],
    })
      .populate("category", "name slug")
      .populate("brand", "name")
      .sort({ createdAt: -1 })

    res.json(products)
  }),
)

// @desc    Bulk preview products from Excel (supports 4 category levels)
// @route   POST /api/products/bulk-preview
// @access  Private/Admin
router.post(
  "/bulk-preview",
  protect,
  admin,
  excelUpload.single("file"),
  asyncHandler(async (req, res) => {
    console.log("--- EXCEL BULK PREVIEW START ---")
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" })
    }
    try {
      // Read Excel from memory buffer (works on serverless too)
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet)
      console.log("Excel rows loaded:", rows.length)

      // Map headers to backend keys (includes 4-level category aliases)
      const mappedRows = rows.map(remapRow)
      
      // DEBUG: Check first row mapping
      if (mappedRows.length > 0) {
        console.log('First mapped row keys:', Object.keys(mappedRows[0]))
        console.log('First mapped row brand value:', mappedRows[0].brand)
        console.log('Original first row keys:', Object.keys(rows[0]))
      }

      // Helper for flexible retrieval from mapped rows (cleans newlines and extra spaces)
      const getField = (row, keys) => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null) {
            const cleaned = String(row[k]).replace(/\s+/g, ' ').trim()
            if (cleaned !== "") return cleaned
          }
        }
        return undefined
      }

      // Collect unique top-levels for upfront creation
      const uniqueParentCategoryNames = new Set()
      const uniqueLevel1Names = new Set()
      const uniqueBrandNames = new Set()
      const uniqueTaxNames = new Set()
      const uniqueUnitNames = new Set()
      const uniqueColorNames = new Set()
      const uniqueWarrantyNames = new Set()
      const uniqueSizeNames = new Set()
      const uniqueVolumeNames = new Set()

      mappedRows.forEach((row) => {
        const parentName = getField(row, ["parent_category"]) // already normalized
        const level1Name = getField(row, ["category"]) // normalized to level 1
        if (parentName) uniqueParentCategoryNames.add(parentName)
        if (level1Name) uniqueLevel1Names.add(level1Name)
        if (row.brand) uniqueBrandNames.add(String(row.brand).trim())
        if (row.tax) uniqueTaxNames.add(String(row.tax).trim())
        if (row.unit) uniqueUnitNames.add(String(row.unit).trim())
        if (row.color) uniqueColorNames.add(String(row.color).trim())
        if (row.warranty) uniqueWarrantyNames.add(String(row.warranty).trim())
        if (row.size) uniqueSizeNames.add(String(row.size).trim())
        if (row.volume) uniqueVolumeNames.add(String(row.volume).trim())
      })

      // Fetch existing records
      const existingParents = await Category.find({ name: { $in: Array.from(uniqueParentCategoryNames) } })
      const existingLevel1Subs = await SubCategory.find({ name: { $in: Array.from(uniqueLevel1Names) }, level: 1 })
      const existingBrands = await Brand.find({ name: { $in: Array.from(uniqueBrandNames) } })
      const existingTaxes = await Tax.find({ name: { $in: Array.from(uniqueTaxNames) } })
      const existingUnits = await Unit.find({ name: { $in: Array.from(uniqueUnitNames) } })
      const existingColors = await Color.find({ name: { $in: Array.from(uniqueColorNames) } })
      const existingWarranties = await Warranty.find({ name: { $in: Array.from(uniqueWarrantyNames) } })
      const existingSizes = await Size.find({ name: { $in: Array.from(uniqueSizeNames) } })
      const existingVolumes = await Volume.find({ name: { $in: Array.from(uniqueVolumeNames) } })

      // Build maps
      const parentCategoryMap = new Map()
      existingParents.forEach((c) => parentCategoryMap.set(c.name.trim().toLowerCase(), c._id))
      const level1Map = new Map()
      existingLevel1Subs.forEach((s) => level1Map.set(s.name.trim().toLowerCase(), s._id))
      const brandMap = new Map()
      existingBrands.forEach((b) => brandMap.set(b.name.trim().toLowerCase(), b._id))
      const taxMap = new Map()
      existingTaxes.forEach((t) => taxMap.set(t.name.trim().toLowerCase(), t._id))
      const unitMap = new Map()
      existingUnits.forEach((u) => unitMap.set(u.name.trim().toLowerCase(), u._id))
      const colorMap = new Map()
      existingColors.forEach((c) => colorMap.set(c.name.trim().toLowerCase(), c._id))
      const warrantyMap = new Map()
      existingWarranties.forEach((w) => warrantyMap.set(w.name.trim().toLowerCase(), w._id))
      const sizeMap = new Map()
      existingSizes.forEach((s) => sizeMap.set(s.name.trim().toLowerCase(), s._id))
      const volumeMap = new Map()
      existingVolumes.forEach((v) => volumeMap.set(v.name.trim().toLowerCase(), v._id))

      // Create missing parent categories
      for (const name of uniqueParentCategoryNames) {
        const key = name.trim().toLowerCase()
        if (!parentCategoryMap.has(key)) {
          const slug = generateSlug(name)
          const bySlug = await Category.findOne({ slug })
          if (bySlug) parentCategoryMap.set(key, bySlug._id)
          else {
            const created = await Category.create({ name: name.trim(), slug, createdBy: req.user?._id })
            parentCategoryMap.set(key, created._id)
          }
        }
      }

      // Create missing level1 subcategories
      for (const name of uniqueLevel1Names) {
        const key = name.trim().toLowerCase()
        if (!level1Map.has(key)) {
          // find a row that pairs level1 with a parent
          const rowWithParent = mappedRows.find((r) => r.category && r.category.trim().toLowerCase() === key && r.parent_category)
          let parentCategoryId
          if (rowWithParent) {
            parentCategoryId = parentCategoryMap.get(rowWithParent.parent_category.trim().toLowerCase())
          }
          // First try to find by name (case-insensitive)
          let existing = await SubCategory.findOne({ 
            name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            level: 1 
          })
          
          // If not found by name, try by slug
          if (!existing) {
            const slug = generateSlug(name)
            existing = await SubCategory.findOne({ slug, level: 1 })
          }
          
          // If still not found, create new
          if (existing) {
            level1Map.set(key, existing._id)
          } else {
            const slug = generateSlug(name)
            const created = await SubCategory.create({
              name: name.trim(),
              slug,
              category: parentCategoryId,
              parentSubCategory: null,
              level: 1,
              createdBy: req.user?._id,
            })
            level1Map.set(key, created._id)
          }
        }
      }

      // Caches for deeper levels
      const level2Cache = new Map()
      const level3Cache = new Map()
      const level4Cache = new Map()

      // Helper to ensure deeper subcategories (levels 2-4)
      const ensureSubCategory = async (name, parentCategoryId, parentSubId, level) => {
        if (!name) return { id: undefined, isNew: false }
        const key = `${parentCategoryId || ''}:${parentSubId || ''}:${level}:${name.trim().toLowerCase()}`
        const cache = level === 2 ? level2Cache : level === 3 ? level3Cache : level4Cache
        if (cache.has(key)) return cache.get(key)
        
        let isNew = false
        // First try to find by name (case-insensitive), level, and parent
        let existing = await SubCategory.findOne({ 
          name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          level,
          category: parentCategoryId
        })
        
        // If not found by name, try by slug with same level and parent
        if (!existing) {
          const slug = generateSlug(name)
          existing = await SubCategory.findOne({ slug, level, category: parentCategoryId })
        }
        
        // If still not found, create new with unique slug
        if (!existing) {
          isNew = true
          let slug = generateSlug(name)
          // Check if slug exists at any level - if so, make it unique by appending level
          const slugExists = await SubCategory.findOne({ slug })
          if (slugExists) {
            slug = `${slug}-${level}`
            // If even that exists, append parent category id
            const stillExists = await SubCategory.findOne({ slug })
            if (stillExists) {
              slug = `${generateSlug(name)}-${level}-${parentCategoryId.toString().slice(-4)}`
            }
          }
          
          existing = await SubCategory.create({
            name: name.trim(),
            slug,
            category: parentCategoryId,
            parentSubCategory: parentSubId || null,
            level,
            createdBy: req.user?._id,
          })
        }
        const result = { id: existing._id, isNew, name: existing.name, slug: existing.slug }
        cache.set(key, result)
        return result
      }

      // Prepare duplicates check for preview (to show which will be updated)
      const skus = mappedRows.map((r) => r.sku).filter(Boolean)
      const names = mappedRows.map((r) => r.name).filter(Boolean)
      const existingProducts = await Product.find({ 
        $or: [
          { sku: { $in: skus } }, 
          { name: { $in: names } }
        ] 
      }).select("name slug sku")
      
      const existingBySku = new Map()
      const existingByName = new Map()
      existingProducts.forEach((p) => {
        if (p.sku) existingBySku.set(p.sku, p)
        if (p.name) existingByName.set(p.name, p)
      })

      // Build preview
      const previewProducts = []
      const invalidRows = []
      const allowedStockStatus = ["In Stock", "Out of Stock", "PreOrder"]

      for (const [i, row] of mappedRows.entries()) {
        if (Object.values(row).every((v) => !v)) {
          invalidRows.push({ row: i + 2, reason: "Empty row", data: row })
          continue
        }

        const parentName = getField(row, ["parent_category"]) || ""
        if (!row.name || !parentName) {
          invalidRows.push({ row: i + 2, reason: "Missing required fields (name, parent_category)", data: row })
          continue
        }

        // Check if this product exists (will be updated instead of created)
        let willUpdate = false
        let existingProduct = null
        
        if (row.sku && existingBySku.has(row.sku)) {
          willUpdate = true
          existingProduct = existingBySku.get(row.sku)
        } else if (existingByName.has(row.name)) {
          willUpdate = true
          existingProduct = existingByName.get(row.name)
        }

        const parentCategoryId = parentCategoryMap.get(parentName.trim().toLowerCase())
        const level1Name = getField(row, ["category"]) // normalized
        const level2Name = getField(row, ["subCategory2"]) // normalized via excelToBackendKey
        const level3Name = getField(row, ["subCategory3"]) // normalized
        const level4Name = getField(row, ["subCategory4"]) // normalized
        const level1Id = level1Name ? level1Map.get(level1Name.trim().toLowerCase()) : undefined
        const level2Data = await ensureSubCategory(level2Name, parentCategoryId, level1Id, 2)
        const level3Data = await ensureSubCategory(level3Name, parentCategoryId, level2Data.id || level1Id, 3)
        const level4Data = await ensureSubCategory(level4Name, parentCategoryId, level3Data.id || level2Data.id || level1Id, 4)

        let stockStatus = row.stockStatus || "In Stock"
        if (!allowedStockStatus.includes(stockStatus)) stockStatus = "In Stock"
        
        console.log(`Row brand value: "${row.brand}", type: ${typeof row.brand}`)
        const brandId = row.brand ? brandMap.get(String(row.brand).trim().toLowerCase()) : undefined
        console.log(`Brand ID resolved: ${brandId}, brandMap has: ${Array.from(brandMap.entries()).map(([k,v]) => `${k}:${v}`).join(', ')}`)
        
        const taxId = row.tax ? taxMap.get(String(row.tax).trim().toLowerCase()) : undefined
        const unitId = row.unit ? unitMap.get(String(row.unit).trim().toLowerCase()) : undefined

        previewProducts.push({
          name: row.name || "",
          slug: row.slug || generateSlug(row.name || ""),
          sku: row.sku || "",
          barcode: row.barcode || "",
          parentCategory: parentCategoryId,
          category: level1Id,
          subCategory2: level2Data?.id,
          subCategory3: level3Data?.id,
          subCategory4: level4Data?.id,
          categoryStatus: {
            level2: level2Data?.isNew ? 'new' : (level2Data?.id ? 'existing' : null),
            level3: level3Data?.isNew ? 'new' : (level3Data?.id ? 'existing' : null),
            level4: level4Data?.isNew ? 'new' : (level4Data?.id ? 'existing' : null),
          },
          brand: brandId,
          buyingPrice: Number.parseFloat(row.buyingPrice) || 0,
          price: Number.parseFloat(row.price) || 0,
          offerPrice: Number.parseFloat(row.offerPrice) || 0,
          discount: Number.parseFloat(row.discount) || 0,
          tax: taxId,
          stockStatus,
          showStockOut: row.showStockOut === "true" || row.showStockOut === true,
          canPurchase: row.canPurchase === "true" || row.canPurchase === true,
          refundable: row.refundable === "true" || row.refundable === true,
          maxPurchaseQty: Number.parseInt(row.maxPurchaseQty) || 10,
          lowStockWarning: Number.parseInt(row.lowStockWarning) || 5,
          unit: unitId,
          weight: Number.parseFloat(row.weight) || 0,
          tags: row.tags ? String(row.tags).split(",").map((t) => t.trim()) : [],
          description: row.description || "",
          shortDescription: row.shortDescription || "",
          specifications: row.specifications ? [{ key: "Specifications", value: row.specifications }] : [],
          details: row.details || "",
          countInStock: Number.parseInt(row.countInStock) || 0,
          isActive: true,
          featured: false,
          willUpdate: willUpdate, // Flag to indicate this will update existing product
          existingProductId: existingProduct?._id, // ID of existing product
        })
      }

      // Populate for preview display
      const populatedPreviewProducts = await Promise.all(
        previewProducts.map(async (prod) => {
          const populated = { ...prod }
          if (prod.parentCategory) {
            const cat = await Category.findById(prod.parentCategory).select("name slug")
            if (cat) populated.parentCategory = { _id: cat._id, name: cat.name, slug: cat.slug }
          }
          const populateSub = async (id) => (id ? await SubCategory.findById(id).select("name slug") : null)
          if (prod.category) {
            const s1 = await populateSub(prod.category)
            if (s1) populated.category = { _id: s1._id, name: s1.name, slug: s1.slug }
          }
          if (prod.subCategory2) {
            const s2 = await populateSub(prod.subCategory2)
            if (s2) {
              const status = prod.categoryStatus?.level2 === 'new' ? ' 🆕' : prod.categoryStatus?.level2 === 'existing' ? ' ✅' : ''
              populated.subCategory2 = { _id: s2._id, name: s2.name + status, slug: s2.slug }
            }
          }
          if (prod.subCategory3) {
            const s3 = await populateSub(prod.subCategory3)
            if (s3) {
              const status = prod.categoryStatus?.level3 === 'new' ? ' 🆕' : prod.categoryStatus?.level3 === 'existing' ? ' ✅' : ''
              populated.subCategory3 = { _id: s3._id, name: s3.name + status, slug: s3.slug }
            }
          }
          if (prod.subCategory4) {
            const s4 = await populateSub(prod.subCategory4)
            if (s4) {
              const status = prod.categoryStatus?.level4 === 'new' ? ' 🆕' : prod.categoryStatus?.level4 === 'existing' ? ' ✅' : ''
              populated.subCategory4 = { _id: s4._id, name: s4.name + status, slug: s4.slug }
            }
          }
          if (prod.brand) {
            const b = await Brand.findById(prod.brand).select("name slug")
            if (b) populated.brand = { _id: b._id, name: b.name, slug: b.slug }
          }
          return populated
        }),
      )

      res.json({
        previewProducts: populatedPreviewProducts,
        invalidRows,
        total: rows.length,
        valid: previewProducts.length,
        invalid: invalidRows.length,
      })
    } catch (error) {
      console.error("Bulk preview error:", error)
      res.status(500).json({ message: "Bulk preview failed", error: error.message })
    }
  }),
)

// @desc    Bulk preview products from CSV (supports 4 category levels)
// @route   POST /api/products/bulk-preview-csv
// @access  Private/Admin
router.post(
  "/bulk-preview-csv",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    console.log("--- CSV BULK PREVIEW START ---")
    const { csvData } = req.body
    if (!csvData || !Array.isArray(csvData)) {
      return res.status(400).json({ message: "No CSV data provided" })
    }

    // Helper for flexible column names (cleans newlines and extra spaces)
    const getField = (row, keys) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null) {
          const cleaned = String(row[k]).replace(/\s+/g, ' ').trim()
          if (cleaned !== "") return cleaned
        }
      }
      return undefined
    }

    // Collect unique names (parent + level1 + brand/tax/unit) for upfront creation
    const uniqueParentCategoryNames = new Set()
    const uniqueLevel1Names = new Set()
    const uniqueBrandNames = new Set()
    const uniqueTaxNames = new Set()
    const uniqueUnitNames = new Set()

    csvData.forEach((row) => {
      const parentName = getField(row, ["parent_category", "parentCategory"])
      const level1Name = getField(row, ["category", "subcategory", "sub_category", "category1", "category_level_1"])
      if (parentName) uniqueParentCategoryNames.add(parentName)
      if (level1Name) uniqueLevel1Names.add(level1Name)
      const b = getField(row, ["brand"]) ; if (b) uniqueBrandNames.add(b)
      const t = getField(row, ["tax"]) ; if (t) uniqueTaxNames.add(t)
      const u = getField(row, ["unit"]) ; if (u) uniqueUnitNames.add(u)
    })

    // Fetch existing
    const existingParents = await Category.find({ name: { $in: Array.from(uniqueParentCategoryNames) } })
    const existingLevel1Subs = await SubCategory.find({ name: { $in: Array.from(uniqueLevel1Names) }, level: 1 })
    const existingBrands = await Brand.find({ name: { $in: Array.from(uniqueBrandNames) } })
    const existingTaxes = await Tax.find({ name: { $in: Array.from(uniqueTaxNames) } })
    const existingUnits = await Unit.find({ name: { $in: Array.from(uniqueUnitNames) } })

    // Maps
    const parentCategoryMap = new Map()
    existingParents.forEach((c) => parentCategoryMap.set(c.name.trim().toLowerCase(), c._id))
    const level1Map = new Map()
    existingLevel1Subs.forEach((s) => level1Map.set(s.name.trim().toLowerCase(), s._id))
    const brandMap = new Map()
    existingBrands.forEach((b) => brandMap.set(b.name.trim().toLowerCase(), b._id))
    const taxMap = new Map()
    existingTaxes.forEach((t) => taxMap.set(t.name.trim().toLowerCase(), t._id))
    const unitMap = new Map()
    existingUnits.forEach((u) => unitMap.set(u.name.trim().toLowerCase(), u._id))

    // Create missing parent categories
    for (const name of uniqueParentCategoryNames) {
      const key = name.trim().toLowerCase()
      if (!parentCategoryMap.has(key)) {
        const slug = generateSlug(name)
        const existingBySlug = await Category.findOne({ slug })
        if (existingBySlug) {
          parentCategoryMap.set(key, existingBySlug._id)
        } else {
          const created = await Category.create({ name: name.trim(), slug, createdBy: req.user?._id })
          parentCategoryMap.set(key, created._id)
        }
      }
    }

    // Create missing level1 subcategories
    for (const name of uniqueLevel1Names) {
      const key = name.trim().toLowerCase()
      if (!level1Map.has(key)) {
        // attempt find parent from any row referencing this level1 + parent
        const rowWithParent = csvData.find((r) => {
          const l1 = getField(r, ["category", "subcategory", "sub_category", "category1", "category_level_1"])
          return l1 && l1.trim().toLowerCase() === key && getField(r, ["parent_category", "parentCategory"]) // parent exists
        })
        let parentCategoryId = undefined
        if (rowWithParent) {
          const parentName = getField(rowWithParent, ["parent_category", "parentCategory"])?.trim().toLowerCase()
          if (parentName) parentCategoryId = parentCategoryMap.get(parentName)
        }
        // First try to find by name (case-insensitive)
        let existing = await SubCategory.findOne({ 
          name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'i') },
          level: 1 
        })
        
        // If not found by name, try by slug
        if (!existing) {
          const slug = generateSlug(name)
          existing = await SubCategory.findOne({ slug, level: 1 })
        }
        
        // If still not found, create new
        if (existing) {
          level1Map.set(key, existing._id)
        } else {
          let slug = generateSlug(name)
          // Check if slug exists at any level - if so, make it unique by appending level
          const slugExists = await SubCategory.findOne({ slug })
          if (slugExists) {
            slug = `${slug}-1`
            // If even that exists, append timestamp
            const stillExists = await SubCategory.findOne({ slug })
            if (stillExists) {
              slug = `${generateSlug(name)}-1-${Date.now().toString().slice(-4)}`
            }
          }
          const created = await SubCategory.create({
            name: name.trim(),
            slug,
            category: parentCategoryId,
            parentSubCategory: null,
            level: 1,
            createdBy: req.user?._id,
          })
          level1Map.set(key, created._id)
        }
      }
    }

    // Caches for deeper levels
    const level2Cache = new Map()
    const level3Cache = new Map()
    const level4Cache = new Map()

    // Fetch existing products to detect updates vs duplicates
    const names = csvData.map((r) => r.name).filter(Boolean)
    const slugs = csvData.map((r) => r.slug).filter(Boolean)
    const skus = csvData.map((r) => getField(r, ["sku"])).filter(Boolean)
    const barcodes = csvData.map((r) => getField(r, ["barcode"])).filter(Boolean)
    const existingProducts = await Product.find({ 
      $or: [
        { name: { $in: names } }, 
        { slug: { $in: slugs } },
        ...(skus.length > 0 ? [{ sku: { $in: skus } }] : []),
        ...(barcodes.length > 0 ? [{ barcode: { $in: barcodes } }] : [])
      ] 
    }).select("name slug sku barcode")
    
    // Create maps for existing products by SKU and name for update detection
    const existingBySKU = new Map()
    const existingByName = new Map()
    existingProducts.forEach((p) => {
      if (p.sku) existingBySKU.set(p.sku, p)
      existingByName.set(p.name, p)
    })
    
    // Track what we've seen in THIS batch to prevent duplicates within the file
    const seenSKUs = new Set()
    const seenNames = new Set()
    const seenBarcodes = new Set()

    const allowedStockStatus = ["In Stock", "Out of Stock", "PreOrder"]
    const previewProducts = []
    const invalidRows = []

    // Helper to ensure a subcategory level (2-4)
    const ensureSubCategory = async (name, parentCategoryId, parentSubId, level) => {
      if (!name) return { id: undefined, isNew: false }
      const key = `${parentCategoryId || ''}:${parentSubId || ''}:${level}:${name.trim().toLowerCase()}`
      const cache = level === 2 ? level2Cache : level === 3 ? level3Cache : level4Cache
      if (cache.has(key)) return cache.get(key)
      
      let isNew = false
      // First try to find by name (case-insensitive), level, and parent
      let existing = await SubCategory.findOne({ 
        name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'i') },
        level,
        category: parentCategoryId
      })
      
      // If not found by name, try by slug with same level and parent
      if (!existing) {
        const slug = generateSlug(name)
        existing = await SubCategory.findOne({ slug, level, category: parentCategoryId })
      }
      
      // If still not found, create new with unique slug
      if (!existing) {
        isNew = true
        let slug = generateSlug(name)
        // Check if slug exists at any level - if so, make it unique by appending level
        const slugExists = await SubCategory.findOne({ slug })
        if (slugExists) {
          slug = `${slug}-${level}`
          // If even that exists, append parent category id
          const stillExists = await SubCategory.findOne({ slug })
          if (stillExists) {
            slug = `${generateSlug(name)}-${level}-${parentCategoryId.toString().slice(-4)}`
          }
        }
        
        existing = await SubCategory.create({
          name: name.trim(),
          slug,
          category: parentCategoryId,
          parentSubCategory: parentSubId || null,
          level,
          createdBy: req.user?._id,
        })
      }
      const result = { id: existing._id, isNew, name: existing.name, slug: existing.slug }
      cache.set(key, result)
      return result
    }

    for (const [i, row] of csvData.entries()) {
      if (Object.values(row).every((v) => !v)) {
        invalidRows.push({ row: i + 2, reason: "Empty row", data: row })
        continue
      }
      const parentName = getField(row, ["parent_category", "parentCategory"]) || ""
      if (!row.name || !parentName) {
        invalidRows.push({ row: i + 2, reason: "Missing required fields (name, parent_category)", data: row })
        continue
      }
      
      const rowSKU = getField(row, ["sku"])
      const rowBarcode = getField(row, ["barcode"])
      
      // Check if this is an UPDATE (existing product by SKU or name)
      let willUpdate = false
      let existingProduct = null
      
      if (rowSKU && existingBySKU.has(rowSKU)) {
        existingProduct = existingBySKU.get(rowSKU)
        willUpdate = true
      } else if (existingByName.has(row.name)) {
        existingProduct = existingByName.get(row.name)
        willUpdate = true
      }
      
      // Check for duplicates WITHIN this batch (not updates)
      if (!willUpdate) {
        if (seenNames.has(row.name)) {
          invalidRows.push({ row: i + 2, reason: "Duplicate product name in this file", data: row })
          continue
        }
        if (rowSKU && seenSKUs.has(rowSKU)) {
          invalidRows.push({ row: i + 2, reason: `Duplicate SKU in this file: ${rowSKU}`, data: row })
          continue
        }
        if (rowBarcode && seenBarcodes.has(rowBarcode)) {
          invalidRows.push({ row: i + 2, reason: `Duplicate Barcode in this file: ${rowBarcode}`, data: row })
          continue
        }
      }
      
      // Track what we've seen in this batch
      seenNames.add(row.name)
      if (rowSKU) seenSKUs.add(rowSKU)
      if (rowBarcode) seenBarcodes.add(rowBarcode)
      const parentCategoryId = parentCategoryMap.get(parentName.trim().toLowerCase())
      const level1Name = getField(row, ["category", "subcategory", "sub_category", "category1", "category_level_1"])
      const level2Name = getField(row, ["sub_category_2", "subcategory2", "subCategory2", "category2", "category_level_2"])
      const level3Name = getField(row, ["sub_category_3", "subcategory3", "subCategory3", "category3", "category_level_3"])
      const level4Name = getField(row, ["sub_category_4", "subcategory4", "subCategory4", "category4", "category_level_4"])
      const level1Id = level1Name ? level1Map.get(level1Name.trim().toLowerCase()) : undefined
      const level2Data = await ensureSubCategory(level2Name, parentCategoryId, level1Id, 2)
      const level3Data = await ensureSubCategory(level3Name, parentCategoryId, level2Data.id || level1Id, 3)
      const level4Data = await ensureSubCategory(level4Name, parentCategoryId, level3Data.id || level2Data.id || level1Id, 4)

      let stockStatus = row.stockStatus || "In Stock"
      if (!allowedStockStatus.includes(stockStatus)) stockStatus = "In Stock"
      const brandId = row.brand ? brandMap.get(String(row.brand).trim().toLowerCase()) : undefined
      const taxId = row.tax ? taxMap.get(String(row.tax).trim().toLowerCase()) : undefined
      const unitId = row.unit ? unitMap.get(String(row.unit).trim().toLowerCase()) : undefined

      // Auto-calculate discount percentage from price and offerPrice
      const price = Number.parseFloat(row.price) || 0
      const offerPrice = Number.parseFloat(row.offerPrice) || 0
      let discount = 0
      if (price > 0 && offerPrice > 0 && offerPrice < price) {
        discount = Math.round(((price - offerPrice) / price) * 100)
      }

      previewProducts.push({
        name: row.name || "",
        slug: row.slug || generateSlug(row.name || ""),
        sku: row.sku || "",
        barcode: row.barcode || "",
        parentCategory: parentCategoryId,
        category: level1Id,
        subCategory2: level2Data?.id,
        subCategory3: level3Data?.id,
        subCategory4: level4Data?.id,
        categoryStatus: {
          level2: level2Data?.isNew ? 'new' : (level2Data?.id ? 'existing' : null),
          level3: level3Data?.isNew ? 'new' : (level3Data?.id ? 'existing' : null),
          level4: level4Data?.isNew ? 'new' : (level4Data?.id ? 'existing' : null),
        },
        brand: brandId,
        buyingPrice: Number.parseFloat(row.buyingPrice) || 0,
        price,
        offerPrice,
        discount,
        tax: taxId,
        stockStatus,
        showStockOut: row.showStockOut === "true" || row.showStockOut === true,
        canPurchase: row.canPurchase === "true" || row.canPurchase === true,
        refundable: row.refundable === "true" || row.refundable === true,
        maxPurchaseQty: Number.parseInt(row.maxPurchaseQty) || 10,
        lowStockWarning: Number.parseInt(row.lowStockWarning) || 5,
        unit: unitId,
        weight: Number.parseFloat(row.weight) || 0,
        tags: row.tags
          ? String(row.tags)
              .split(",")
              .map((t) => t.trim())
          : [],
        description: row.description || "",
        shortDescription: row.shortDescription || "",
        specifications: row.specifications ? [{ key: "Specifications", value: row.specifications }] : [],
        details: row.details || "",
        countInStock: Number.parseInt(row.countInStock) || 0,
        isActive: true,
        featured: false,
        willUpdate, // Flag to indicate this will update an existing product
      })
    }

    // Populate for preview
    const populatedPreviewProducts = await Promise.all(
      previewProducts.map(async (prod) => {
        const populated = { ...prod }
        if (prod.parentCategory) {
          const cat = await Category.findById(prod.parentCategory).select("name slug")
          if (cat) populated.parentCategory = { _id: cat._id, name: cat.name, slug: cat.slug }
        }
        const populateSub = async (id) => (id ? await SubCategory.findById(id).select("name slug") : null)
        if (prod.category) {
          const s1 = await populateSub(prod.category)
          if (s1) populated.category = { _id: s1._id, name: s1.name, slug: s1.slug }
        }
        if (prod.subCategory2) {
          const s2 = await populateSub(prod.subCategory2)
          if (s2) {
            const status = prod.categoryStatus?.level2 === 'new' ? ' 🆕' : prod.categoryStatus?.level2 === 'existing' ? ' ✅' : ''
            populated.subCategory2 = { _id: s2._id, name: s2.name + status, slug: s2.slug }
          }
        }
        if (prod.subCategory3) {
          const s3 = await populateSub(prod.subCategory3)
          if (s3) {
            const status = prod.categoryStatus?.level3 === 'new' ? ' 🆕' : prod.categoryStatus?.level3 === 'existing' ? ' ✅' : ''
            populated.subCategory3 = { _id: s3._id, name: s3.name + status, slug: s3.slug }
          }
        }
        if (prod.subCategory4) {
          const s4 = await populateSub(prod.subCategory4)
          if (s4) {
            const status = prod.categoryStatus?.level4 === 'new' ? ' 🆕' : prod.categoryStatus?.level4 === 'existing' ? ' ✅' : ''
            populated.subCategory4 = { _id: s4._id, name: s4.name + status, slug: s4.slug }
          }
        }
        if (prod.brand) {
          const b = await Brand.findById(prod.brand).select("name slug")
          if (b) populated.brand = { _id: b._id, name: b.name, slug: b.slug }
        }
        return populated
      }),
    )

    res.json({
      previewProducts: populatedPreviewProducts,
      invalidRows,
      total: csvData.length,
      valid: previewProducts.length,
      invalid: invalidRows.length,
    })
  }),
)

// @desc    Bulk save products to database (CREATE or UPDATE)
// @route   POST /api/products/bulk-save
// @access  Private/Admin
router.post(
  "/bulk-save",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const products = req.body.products
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "No products to save" })
    }

    const results = []
    let success = 0
    let failed = 0
    let created = 0
    let updated = 0
    const allowedStockStatus = ["In Stock", "Out of Stock", "PreOrder"]

    // Collect all unique brand names to create missing ones
    const brandNames = new Set()
    products.forEach(prod => {
      if (prod.brand) {
        if (typeof prod.brand === 'string') {
          const cleanName = prod.brand.replace(/\s+/g, ' ').trim()
          if (cleanName) brandNames.add(cleanName)
        } else if (prod.brand?.name) {
          const cleanName = prod.brand.name.replace(/\s+/g, ' ').trim()
          if (cleanName) brandNames.add(cleanName)
        }
      }
    })

    console.log('Brand names to process:', Array.from(brandNames))

    // Fetch existing brands and create missing ones
    const existingBrands = await Brand.find({ 
      name: { $in: Array.from(brandNames).map(n => new RegExp(`^${n}$`, 'i')) } 
    })
    const brandMap = new Map()
    existingBrands.forEach(b => {
      brandMap.set(b.name.trim().toLowerCase(), b._id)
      console.log(`Existing brand: ${b.name} -> ${b._id}`)
    })

    for (const name of brandNames) {
      const key = name.trim().toLowerCase()
      if (!brandMap.has(key)) {
        console.log(`Creating new brand: ${name}`)
        const slug = generateSlug(name)
        
        // Translate brand fields
        const nameAr = await translateText(name.trim());
        
        const newBrand = await Brand.create({ 
          name: name.trim(), 
          nameAr,
          slug, 
          createdBy: req.user._id 
        })
        brandMap.set(key, newBrand._id)
        console.log(`Created brand: ${newBrand.name} -> ${newBrand._id}`)
      }
    }

    for (const [i, prod] of products.entries()) {
      try {
        // Skip row if all fields are empty/falsy
        if (Object.values(prod).every((v) => !v)) {
          console.log(`Product ${i}: Skipped - Empty row`)
          results.push({ index: i, status: "failed", reason: "Empty row", product: prod })
          failed++
          continue
        }

        // Validate required fields
        if (!prod.name || !prod.parentCategory) {
          console.log(`Product ${i}: Failed - Missing required fields (name: ${prod.name}, parentCategory: ${prod.parentCategory})`)
          results.push({ index: i, status: "failed", reason: "Missing required fields (name, parentCategory)", product: prod })
          failed++
          continue
        }

        // Check if product exists by SKU (primary identifier) or name
        let existing = null
        
        if (prod.sku && prod.sku.trim() !== "") {
          existing = await Product.findOne({ sku: prod.sku.trim() })
        }
        
        // If no SKU match, try by name
        if (!existing) {
          existing = await Product.findOne({ name: prod.name })
        }

        // Use defaults for missing fields
        let stockStatus = prod.stockStatus || "In Stock"
        if (!allowedStockStatus.includes(stockStatus)) stockStatus = "In Stock"

        // Extract IDs from populated objects or use direct IDs
        const parentCategoryId = prod.parentCategory?._id || prod.parentCategory
        const categoryId = prod.category?._id || prod.category // level 1
        const subCategory2Id = prod.subCategory2?._id || prod.subCategory2
        const subCategory3Id = prod.subCategory3?._id || prod.subCategory3
        const subCategory4Id = prod.subCategory4?._id || prod.subCategory4
        
        // Resolve brand - from map if string, or extract ID if object
        let brandId = null
        
        if (mongoose.Types.ObjectId.isValid(prod.brand)) {
          // Brand is already an ObjectId
          brandId = prod.brand
          console.log(`Product ${i} - Brand is already ObjectId: ${brandId}`)
        } else if (prod.brand?._id && mongoose.Types.ObjectId.isValid(prod.brand._id)) {
          // Brand is an object with _id (from preview)
          brandId = prod.brand._id
          console.log(`Product ${i} - Brand extracted from object: ${brandId}`)
        } else if (typeof prod.brand === 'string') {
          // Brand is a string name, look up in brandMap
          const cleanName = prod.brand.replace(/\s+/g, ' ').trim()
          brandId = brandMap.get(cleanName.toLowerCase())
          console.log(`Product ${i} - Resolving brand string "${prod.brand}" -> cleaned "${cleanName}" -> ID: ${brandId}`)
        } else if (prod.brand?.name) {
          // Brand is an object with name property
          const cleanName = prod.brand.name.replace(/\s+/g, ' ').trim()
          brandId = brandMap.get(cleanName.toLowerCase()) || prod.brand._id
          console.log(`Product ${i} - Resolving brand object "${prod.brand.name}" -> cleaned "${cleanName}" -> ID: ${brandId}`)
        }
        
        if (!brandId) {
          console.log(`Product ${i} - WARNING: No brandId resolved from:`, prod.brand)
        }
        
        const taxId = prod.tax?._id || prod.tax
        const unitId = prod.unit?._id || prod.unit

        // Auto-calculate discount percentage from price and offerPrice
        const price = prod.price || 0
        const offerPrice = prod.offerPrice || 0
        let discount = 0
        if (price > 0 && offerPrice > 0 && offerPrice < price) {
          discount = Math.round(((price - offerPrice) / price) * 100)
        }

        // Translate product fields
        const nameAr = await translateText(prod.name);
        const descriptionAr = await translateText(prod.description || "");
        const shortDescriptionAr = await translateText(prod.shortDescription || "");
        const stockStatusAr = await translateText(stockStatus);
        
        let tagsAr = [];
        if (prod.tags && Array.isArray(prod.tags)) {
          tagsAr = await Promise.all(prod.tags.map(t => translateText(t)));
        }

        // Translate specifications
        if (prod.specifications && Array.isArray(prod.specifications)) {
          for (const spec of prod.specifications) {
            if (spec.key && !spec.keyAr) spec.keyAr = await translateText(spec.key);
            if (spec.value && !spec.valueAr) spec.valueAr = await translateText(spec.value);
          }
        }

        const productData = {
          name: prod.name || "",
          nameAr,
          slug: prod.slug || generateSlug(prod.name || ""),
          sku: (prod.sku && prod.sku.trim() !== "") ? prod.sku.trim() : undefined,
          barcode: (prod.barcode && prod.barcode.trim() !== "") ? prod.barcode.trim() : undefined,
          parentCategory: parentCategoryId, // Main category
          category: categoryId, // Level 1
          subCategory: categoryId, // Backward compatibility
          subCategory2: subCategory2Id,
          subCategory3: subCategory3Id,
          subCategory4: subCategory4Id,
          brand: brandId,
          buyingPrice: prod.buyingPrice || 0,
          price,
          offerPrice,
          discount,
          tax: taxId,
          stockStatus,
          stockStatusAr,
          showStockOut: prod.showStockOut !== undefined ? Boolean(prod.showStockOut) : true,
          canPurchase: prod.canPurchase !== undefined ? Boolean(prod.canPurchase) : true,
          refundable: prod.refundable !== undefined ? Boolean(prod.refundable) : true,
          maxPurchaseQty: prod.maxPurchaseQty || 10,
          lowStockWarning: prod.lowStockWarning || 5,
          unit: unitId,
          weight: prod.weight || 0,
          tags: prod.tags || [],
          tagsAr,
          description: prod.description || "",
          descriptionAr,
          shortDescription: prod.shortDescription || "",
          shortDescriptionAr,
          specifications: prod.specifications || [],
          countInStock: prod.countInStock !== undefined ? prod.countInStock : 0,
          isActive: prod.isActive !== undefined ? Boolean(prod.isActive) : true,
          featured: prod.featured !== undefined ? Boolean(prod.featured) : false,
        }

        let product

        if (existing) {
          // UPDATE existing product
          Object.assign(existing, productData)
          product = await existing.save()
          console.log(`Product ${i} (${prod.name}): UPDATED`)
          results.push({ index: i, status: "success", action: "updated", product: product })
          updated++
          success++
        } else {
          // CREATE new product
          productData.createdBy = req.user._id
          product = new Product(productData)
          await product.save()
          console.log(`Product ${i} (${prod.name}): CREATED`)
          results.push({ index: i, status: "success", action: "created", product: product })
          created++
          success++
        }
      } catch (error) {
        console.log(`Product ${i} (${prod.name}): FAILED - ${error.message}`)
        results.push({ index: i, status: "failed", reason: error.message, product: prod })
        failed++
      }
    }

    console.log(`\n=== BULK SAVE SUMMARY ===`)
    console.log(`Total: ${products.length}, Success: ${success}, Failed: ${failed}`)
    console.log(`Created: ${created}, Updated: ${updated}`)
    console.log(`========================\n`)

    // Populate category, subcategory, and brand in the results
    const populatedResults = await Promise.all(
      results.map(async (result) => {
        if (!result.product || result.status === "failed") return result

        const prod = { ...result.product.toObject() }

        if (prod.parentCategory) {
          const cat = await Category.findById(prod.parentCategory).select("name slug")
          if (cat) prod.parentCategory = { _id: cat._id, name: cat.name, slug: cat.slug }
        }

        if (prod.category) {
          const sub = await SubCategory.findById(prod.category).select("name slug")
          if (sub) prod.category = { _id: sub._id, name: sub.name, slug: sub.slug }
        }

        if (prod.brand) {
          const brand = await Brand.findById(prod.brand).select("name slug")
          if (brand) prod.brand = { _id: brand._id, name: brand.name, slug: brand.slug }
        }

        return { ...result, product: prod }
      }),
    )

    // Invalidate cache after bulk create/update operations
    await invalidateCache("products")

    res.json({
      message: `Bulk save complete: ${created} created, ${updated} updated, ${failed} failed`,
      total: products.length,
      success,
      failed,
      created,
      updated,
      results: populatedResults,
      cacheHint: { productsUpdated: true, timestamp: Date.now() },
    })
  }),
)

// @desc    Bulk import products with ObjectId tracking (improved version)
// @route   POST /api/products/bulk-import-with-id
// @access  Private/Admin
router.post(
  "/bulk-import-with-id",
  protect,
  admin,
  excelUpload.single("file"),
  asyncHandler(async (req, res) => {
    console.log("--- BULK IMPORT WITH OBJECTID START ---")
    
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" })
    }
    
    try {
      // Read Excel from memory buffer
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet)
      console.log("Excel rows loaded:", rows.length)

      const results = []
      let created = 0
      let updated = 0
      let failed = 0
      const errors = []

      // Track ObjectIds in this batch to detect duplicates
      const seenObjectIds = new Map()
      const duplicateObjectIds = new Set()

      // First pass: Detect duplicate ObjectIds within the Excel file
      for (const [i, row] of rows.entries()) {
        const rowNum = i + 2 // Excel row number (accounting for header)
        const objectId = row._id || row.id || row.ID || row['_id']
        
        if (objectId && objectId.trim() !== '') {
          const cleanId = objectId.trim()
          
          // Check if we've seen this ObjectId before in this file
          if (seenObjectIds.has(cleanId)) {
            duplicateObjectIds.add(cleanId)
            errors.push({
              row: rowNum,
              productName: row.name || 'Unknown',
              objectId: cleanId,
              error: `Duplicate ObjectId found in Excel file. First occurrence at row ${seenObjectIds.get(cleanId)}`,
            })
          } else {
            seenObjectIds.set(cleanId, rowNum)
          }
        }
      }

      // If we found any duplicate ObjectIds, return error
      if (duplicateObjectIds.size > 0) {
        return res.status(400).json({
          message: `Found ${duplicateObjectIds.size} duplicate ObjectId(s) in the Excel file. Please fix these duplicates before importing.`,
          duplicates: Array.from(duplicateObjectIds),
          errors,
          total: rows.length,
          failed: errors.length,
        })
      }

      // Helper to resolve category/brand by name only (no ID support)
      const resolveCategoryOrBrand = async (Model, nameValue, createIfMissing = true, userId = null) => {
        if (!nameValue) return null
        
        // Try by name
        if (nameValue && nameValue.trim() !== '') {
          const found = await Model.findOne({ name: nameValue.trim() })
          if (found) return found._id
          
          // Create new if requested
          if (createIfMissing) {
            const slug = generateSlug(nameValue.trim())
            
            // Translate name for Arabic field
            const nameAr = await translateText(nameValue.trim());
            
            const newDoc = await Model.create({
              name: nameValue.trim(),
              nameAr,
              slug,
              isActive: true,
              createdBy: userId,
            })
            return newDoc._id
          }
        }
        
        return null
      }

      // Helper to resolve subcategory by name (with level support)
      const resolveSubCategory = async (nameValue, parentCategoryId, parentSubId, level, userId = null) => {
        if (!nameValue) return null
        
        // Try by name and parent
        if (nameValue && nameValue.trim() !== '') {
          const query = { name: nameValue.trim() }
          if (parentCategoryId) query.category = parentCategoryId
          
          const found = await SubCategory.findOne(query)
          if (found) return found._id
          
          // Create new subcategory
          const slug = generateSlug(nameValue.trim())
          
          // Translate name for Arabic field
          const nameAr = await translateText(nameValue.trim());
          
          const newSub = await SubCategory.create({
            name: nameValue.trim(),
            nameAr,
            slug,
            category: parentCategoryId,
            parentSubCategory: parentSubId || null,
            level,
            isActive: true,
            createdBy: userId,
          })
          return newSub._id
        }
        
        return null
      }

      // Second pass: Process products
      for (const [i, row] of rows.entries()) {
        const rowNum = i + 2
        
        try {
          // Skip empty rows
          if (Object.values(row).every((v) => !v || String(v).trim() === '')) {
            continue
          }

          const objectId = row._id || row.id || row.ID || row['_id']
          const productName = row.name
          
          if (!productName || productName.trim() === '') {
            errors.push({
              row: rowNum,
              productName: 'Unknown',
              error: 'Product name is required',
            })
            failed++
            continue
          }

          let product = null
          let isUpdate = false

          // If ObjectId is provided, try to find existing product
          if (objectId && objectId.trim() !== '' && mongoose.Types.ObjectId.isValid(objectId.trim())) {
            product = await Product.findById(objectId.trim())
            if (product) {
              isUpdate = true
            } else {
              // ObjectId provided but product not found - treat as error
              errors.push({
                row: rowNum,
                productName,
                objectId: objectId.trim(),
                error: 'Product with provided ObjectId not found in database',
              })
              failed++
              continue
            }
          }

          // Resolve parent category (by name only)
          const parentCategoryId = await resolveCategoryOrBrand(
            Category,
            row.parent_category,
            true,
            req.user._id
          )

          if (!parentCategoryId) {
            errors.push({
              row: rowNum,
              productName,
              error: 'Parent category is required',
            })
            failed++
            continue
          }

          // Resolve brand (by name only)
          const brandId = await resolveCategoryOrBrand(
            Brand,
            row.brand,
            true,
            req.user._id
          )

          // Resolve category levels (by name only)
          const level1Id = await resolveSubCategory(
            row.category_level_1,
            parentCategoryId,
            null,
            1,
            req.user._id
          )

          const level2Id = await resolveSubCategory(
            row.category_level_2,
            parentCategoryId,
            level1Id,
            2,
            req.user._id
          )

          const level3Id = await resolveSubCategory(
            row.category_level_3,
            parentCategoryId,
            level2Id || level1Id,
            3,
            req.user._id
          )

          const level4Id = await resolveSubCategory(
            row.category_level_4,
            parentCategoryId,
            level3Id || level2Id || level1Id,
            4,
            req.user._id
          )

          // Prepare product data
          const productData = {
            name: productName.trim(),
            slug: row.slug || generateSlug(productName.trim()),
            sku: row.sku && row.sku.trim() !== '' ? row.sku.trim() : undefined,
            barcode: row.barcode && row.barcode.trim() !== '' ? row.barcode.trim() : undefined,
            parentCategory: parentCategoryId,
            category: level1Id,
            subCategory: level1Id, // for backward compatibility
            subCategory2: level2Id,
            subCategory3: level3Id,
            subCategory4: level4Id,
            brand: brandId,
            buyingPrice: parseFloat(row.buyingPrice) || 0,
            price: parseFloat(row.price) || 0,
            offerPrice: parseFloat(row.offerPrice) || 0,
            discount: parseFloat(row.discount) || 0,
            stockStatus: row.stockStatus || 'In Stock',
            countInStock: parseInt(row.countInStock) || 0,
            showStockOut: row.showStockOut === 'true' || row.showStockOut === true,
            canPurchase: row.canPurchase !== 'false' && row.canPurchase !== false,
            refundable: row.refundable !== 'false' && row.refundable !== false,
            maxPurchaseQty: parseInt(row.maxPurchaseQty) || 10,
            lowStockWarning: parseInt(row.lowStockWarning) || 5,
            weight: parseFloat(row.weight) || 0,
            tags: row.tags ? String(row.tags).split(',').map(t => t.trim()).filter(Boolean) : [],
            description: row.description || '',
            shortDescription: row.shortDescription || '',
            specifications: parseSpecificationsInput(row.specifications),
            details: row.details || '',
            isActive: true,
          }

          // Translate product fields
          const nameAr = await translateText(productData.name);
          const descriptionAr = await translateText(productData.description || "");
          const shortDescriptionAr = await translateText(productData.shortDescription || "");
          const stockStatusAr = await translateText(productData.stockStatus);
          
          let tagsAr = [];
          if (productData.tags && Array.isArray(productData.tags)) {
            tagsAr = await Promise.all(productData.tags.map(t => translateText(t)));
          }

          Object.assign(productData, {
            nameAr,
            descriptionAr,
            shortDescriptionAr,
            stockStatusAr,
            tagsAr
          })

          if (isUpdate) {
            // UPDATE existing product
            Object.assign(product, productData)
            await product.save()
            
            results.push({
              row: rowNum,
              action: 'updated',
              productId: product._id,
              productName: product.name,
              sku: product.sku,
            })
            updated++
          } else {
            // CREATE new product (no ObjectId provided)
            productData.createdBy = req.user._id
            
            // Check for duplicate SKU/barcode/slug before creating
            if (productData.sku) {
              const existingBySku = await Product.findOne({ sku: productData.sku })
              if (existingBySku) {
                errors.push({
                  row: rowNum,
                  productName,
                  error: `Product with SKU '${productData.sku}' already exists`,
                })
                failed++
                continue
              }
            }

            const newProduct = await Product.create(productData)
            
            results.push({
              row: rowNum,
              action: 'created',
              productId: newProduct._id,
              productName: newProduct.name,
              sku: newProduct.sku,
            })
            created++
          }
        } catch (error) {
          console.error(`Error processing row ${rowNum}:`, error)
          errors.push({
            row: rowNum,
            productName: row.name || 'Unknown',
            error: error.message,
          })
          failed++
        }
      }

      console.log(`\n=== BULK IMPORT SUMMARY ===`)
      console.log(`Total rows: ${rows.length}`)
      console.log(`Created: ${created}`)
      console.log(`Updated: ${updated}`)
      console.log(`Failed: ${failed}`)
      console.log(`==========================\n`)

      // Invalidate cache after bulk import operations
      await invalidateCache("products")

      res.json({
        message: `Bulk import complete: ${created} created, ${updated} updated, ${failed} failed`,
        total: rows.length,
        created,
        updated,
        failed,
        results,
        errors,
      })
    } catch (error) {
      console.error("Bulk import error:", error)
      res.status(500).json({
        message: "Bulk import failed",
        error: error.message,
      })
    }
  }),
)

// @desc    Bulk create products
// @route   POST /api/products/bulk
// @access  Private/Admin
router.post(
  "/bulk",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { products } = req.body

    if (!products || !Array.isArray(products) || products.length === 0) {
      res.status(400)
      throw new Error("No products provided")
    }

    const results = []
    let successCount = 0
    let failedCount = 0

    for (let i = 0; i < products.length; i++) {
      const productData = products[i]

      try {
        // Find or create parent category
        let parentCategory = null
        if (productData.parentCategory) {
          const parentCategoryStr = String(productData.parentCategory).trim()

          if (mongoose.Types.ObjectId.isValid(parentCategoryStr)) {
            parentCategory = await Category.findById(parentCategoryStr)
          } else {
            parentCategory = await Category.findOne({
              name: parentCategoryStr,
              isDeleted: { $ne: true },
            })

            if (!parentCategory) {
              const slug = parentCategoryStr
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, "")
                .replace(/\s+/g, "-")
                .replace(/-+/g, "-")
                .trim()

              // Translate category fields
              const parentNameAr = await translateText(parentCategoryStr);

              parentCategory = new Category({
                name: parentCategoryStr,
                nameAr: parentNameAr,
                slug: slug,
                isActive: true,
                createdBy: req.user._id,
              })
              await parentCategory.save()
            }
          }
        }

        // Find or create subcategory
        let subCategory = null
        if (productData.category) {
          const categoryStr = String(productData.category).trim()

          if (mongoose.Types.ObjectId.isValid(categoryStr)) {
            subCategory = await SubCategory.findById(categoryStr)
          } else if (parentCategory) {
            subCategory = await SubCategory.findOne({
              name: categoryStr,
              category: parentCategory._id,
              isDeleted: { $ne: true },
            })

            if (!subCategory) {
              const slug = categoryStr
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, "")
                .replace(/\s+/g, "-")
                .replace(/-+/g, "-")
                .trim()

              // Translate subcategory fields
              const subNameAr = await translateText(categoryStr);

              subCategory = new SubCategory({
                name: categoryStr,
                nameAr: subNameAr,
                slug: slug,
                category: parentCategory._id,
                isActive: true,
                createdBy: req.user._id,
              })
              await subCategory.save()
            }
          }
        }

        // Find or create brand
        let brand = null
        if (productData.brand) {
          const brandStr = String(productData.brand).trim()

          if (mongoose.Types.ObjectId.isValid(brandStr)) {
            brand = await Brand.findById(brandStr)
          } else {
            brand = await Brand.findOne({
              name: brandStr,
              isDeleted: { $ne: true },
            })

            if (!brand) {
              const slug = brandStr
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, "")
                .replace(/\s+/g, "-")
                .replace(/-+/g, "-")
                .trim()

              // Translate brand fields
              const brandNameAr = await translateText(brandStr);

              brand = new Brand({
                name: brandStr,
                nameAr: brandNameAr,
                slug: slug,
                isActive: true,
                createdBy: req.user._id,
              })
              await brand.save()
            }
          }
        }

        // Handle tax - Find or create tax record
        let tax = null
        if (productData.tax) {
          const taxStr = String(productData.tax).trim()

          if (mongoose.Types.ObjectId.isValid(taxStr)) {
            tax = await Tax.findById(taxStr)
          } else {
            // Try to find existing tax by name
            tax = await Tax.findOne({
              name: taxStr,
              isDeleted: { $ne: true },
            })

            if (!tax) {
              // Create new tax record
              tax = new Tax({
                name: taxStr,
                percentage: taxStr.includes("5") ? 5 : 0, // Extract percentage if possible
                isActive: true,
                createdBy: req.user._id,
              })
              await tax.save()
            }
          }
        }

        // Handle unit - Find or create unit record
        let unit = null
        if (productData.unit) {
          const unitStr = String(productData.unit).trim()

          if (mongoose.Types.ObjectId.isValid(unitStr)) {
            unit = await Unit.findById(unitStr)
          } else {
            unit = await Unit.findOne({
              name: unitStr,
              isDeleted: { $ne: true },
            })

            if (!unit) {
              unit = new Unit({
                name: unitStr,
                isActive: true,
                createdBy: req.user._id,
              })
              await unit.save()
            }
          }
        }

        // Generate unique slug
        const productName = String(productData.name || "").trim()
        const baseSlug =
          productData.slug ||
          productName
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .trim()

        // Ensure slug is unique
        let productSlug = baseSlug
        let counter = 1
        while (await Product.findOne({ slug: productSlug })) {
          productSlug = `${baseSlug}-${counter}`
          counter++
        }

        // Check if product with same name, slug, SKU, or barcode already exists
        const duplicateQuery = [
          { name: productName },
          { slug: productSlug }
        ]
        
        // Only check SKU/barcode if they have values
        const trimmedSKU = String(productData.sku || "").trim()
        const trimmedBarcode = String(productData.barcode || "").trim()
        
        if (trimmedSKU !== "") {
          duplicateQuery.push({ sku: trimmedSKU })
        }
        if (trimmedBarcode !== "") {
          duplicateQuery.push({ barcode: trimmedBarcode })
        }
        
        const existingProduct = await Product.findOne({ $or: duplicateQuery })
        if (existingProduct) {
          let reason = "Duplicate product"
          if (existingProduct.name === productName) reason = "Duplicate product name"
          else if (existingProduct.slug === productSlug) reason = "Duplicate product slug"
          else if (existingProduct.sku === trimmedSKU) reason = `Duplicate SKU: ${trimmedSKU}`
          else if (existingProduct.barcode === trimmedBarcode) reason = `Duplicate Barcode: ${trimmedBarcode}`
          
          results.push({
            status: "error",
            product: productData,
            message: reason,
            originalIndex: i,
          })
          failedCount++
          continue
        }

        // Translate product fields
        const nameAr = await translateText(productName);
        const descriptionAr = await translateText(productData.description || "");
        const shortDescriptionAr = await translateText(productData.shortDescription || "");
        const stockStatusAr = await translateText(productData.stockStatus || "In Stock");
        
        let tagsAr = [];
        if (productData.tags && Array.isArray(productData.tags)) {
          tagsAr = await Promise.all(productData.tags.map(t => translateText(t)));
        } else if (productData.tags && typeof productData.tags === 'string') {
          const tagList = productData.tags.split(",").map(t => t.trim()).filter(Boolean);
          tagsAr = await Promise.all(tagList.map(t => translateText(t)));
        }

        // Translate specifications
        const specifications = productData.specifications
          ? [
              {
                key: "Specifications",
                keyAr: await translateText("Specifications"),
                value: String(productData.specifications).trim(),
                valueAr: await translateText(String(productData.specifications).trim()),
              },
            ]
          : [];

        // Create the product with proper ObjectId references
        const product = new Product({
          name: productName,
          nameAr,
          slug: productSlug,
          sku: trimmedSKU !== "" ? trimmedSKU : undefined,
          parentCategory: parentCategory?._id,
          category: subCategory?._id,
          brand: brand?._id,
          tax: tax?._id, // Use ObjectId reference
          unit: unit?._id, // Use ObjectId reference
          buyingPrice: Number(productData.buyingPrice) || 0,
          price: Number(productData.price) || 0,
          offerPrice: Number(productData.offerPrice) || 0,
          stockStatus: String(productData.stockStatus || "In Stock").trim(),
          stockStatusAr,
          showStockOut: productData.showStockOut !== undefined ? Boolean(productData.showStockOut) : true,
          canPurchase: productData.canPurchase !== undefined ? Boolean(productData.canPurchase) : true,
          refundable: productData.refundable !== undefined ? Boolean(productData.refundable) : true,
          maxPurchaseQty: Number(productData.maxPurchaseQty) || 10,
          lowStockWarning: Number(productData.lowStockWarning) || 5,
          weight: Number(productData.weight) || 0,
          tags: productData.tags
            ? String(productData.tags)
                .split(",")
                .map((tag) => tag.trim())
                .filter((tag) => tag)
            : [],
          tagsAr,
          description: String(productData.description || "").trim(),
          descriptionAr,
          discount: Number(productData.discount) || 0,
          specifications,
          details: String(productData.details || "").trim(),
          shortDescription: String(productData.shortDescription || "").trim(),
          shortDescriptionAr,
          barcode: trimmedBarcode !== "" ? trimmedBarcode : undefined,
          isActive: true,
          countInStock: Number(productData.countInStock) || 0,
          createdBy: req.user._id,
        })

        await product.save()

        results.push({
          status: "success",
          product: {
            _id: product._id,
            name: product.name,
            sku: product.sku,
          },
          originalIndex: i,
        })
        successCount++
      } catch (error) {
        console.error(`Error creating product ${i + 1}:`, error)
        results.push({
          status: "error",
          product: productData,
          message: error.message || "Failed to create product",
          details: error.stack,
          originalIndex: i,
        })
        failedCount++
      }
    }

    // Invalidate cache after bulk product creation
    await invalidateCache("products")

    res.json({
      success: true,
      message: `Bulk import completed. ${successCount} products created, ${failedCount} failed.`,
      successCount,
      failedCount,
      results,
      summary: {
        total: products.length,
        success: successCount,
        failed: failedCount,
      },
    })
  }),
)

export default router
