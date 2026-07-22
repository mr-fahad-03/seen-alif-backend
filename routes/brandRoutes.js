import express from "express"
import asyncHandler from "express-async-handler"
import axios from "axios"
import Brand from "../models/brandModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { deleteLocalFile, isCloudinaryUrl } from "../config/multer.js"
import { logActivity } from "../middleware/permissionMiddleware.js"
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js"

const router = express.Router()
import { translateEnToAr } from "../utils/translateWithFallback.js"
const ENABLE_BRAND_TRANSLATION = process.env.ENABLE_BRAND_TRANSLATION !== "false"

// Helper for translation
const translateText = async (text) => {
  if (!ENABLE_BRAND_TRANSLATION) return ""
  return await translateEnToAr(text)
}

const buildSlug = (value = "") =>
  value
    .toString()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

const runInBackground = (task, label) => {
  setImmediate(async () => {
    try {
      await task()
    } catch (error) {
      console.error(`${label} failed:`, error.message)
    }
  })
}

// @desc    Fetch all brands (Admin only - includes inactive)
// @route   GET /api/brands/admin
// @access  Private/Admin
router.get(
  "/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const brands = await Brand.find({ isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 })
    res.json(brands)
  }),
)

// @desc    Fetch all brands
// @route   GET /api/brands
// @access  Public
router.get(
  "/",
  cacheMiddleware('brands'),
  asyncHandler(async (req, res) => {
    const brands = await Brand.find({ isActive: true, isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 })
    res.json(brands)
  }),
)

// @desc    Create a brand
// @route   POST /api/brands
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, description, logo, website, sortOrder, isActive } = req.body
    const normalizedName = String(name || "").trim()

    if (!normalizedName) {
      res.status(400)
      throw new Error("Brand name is required")
    }

    // Generate slug from name
    const slug = buildSlug(normalizedName)
    if (!slug) {
      res.status(400)
      throw new Error("Please enter a valid brand name")
    }

    const existingBrand = await Brand.findOne({ $or: [{ name: normalizedName }, { slug }] })
    if (existingBrand) {
      res.status(400)
      throw new Error("Brand with this name already exists")
    }

    // Translate texts
    const [nameAr, descriptionAr] = await Promise.all([
      translateText(normalizedName),
      translateText(description || ""),
    ])

    const brand = new Brand({
      name: normalizedName,
      nameAr,
      slug,
      description,
      descriptionAr,
      logo,
      website,
      isActive: isActive !== undefined ? isActive : true,
      sortOrder,
      createdBy: req.user._id,
    })

    const createdBrand = await brand.save()

    res.status(201).json(createdBrand)

    runInBackground(
      () => logActivity(req, "CREATE", "BRANDS", `Created brand: ${createdBrand.name}`, createdBrand._id, createdBrand.name),
      "Brand create activity log",
    )
    runInBackground(() => invalidateCache(['brands', 'products']), "Brand create cache invalidation")
  }),
)

// @desc    Update a brand
// @route   PUT /api/brands/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const brand = await Brand.findById(req.params.id)

    if (brand) {
      const previousName = brand.name
      const { name, description, logo, website, isActive, sortOrder } = req.body

      brand.name = name || brand.name
      brand.description = description || brand.description
      brand.logo = logo || brand.logo
      brand.website = website || brand.website
      brand.isActive = isActive !== undefined ? isActive : brand.isActive
      brand.sortOrder = sortOrder !== undefined ? sortOrder : brand.sortOrder

      // Update slug if name changed
      if (name && name !== previousName) {
        const updatedSlug = buildSlug(name)
        if (!updatedSlug) {
          res.status(400)
          throw new Error("Please enter a valid brand name")
        }
        brand.slug = updatedSlug
      }

      // Translate updated fields
      if (name !== undefined || description !== undefined) {
        const [nextNameAr, nextDescriptionAr] = await Promise.all([
          name !== undefined ? translateText(brand.name) : Promise.resolve(brand.nameAr),
          description !== undefined ? translateText(brand.description) : Promise.resolve(brand.descriptionAr),
        ])
        brand.nameAr = nextNameAr
        brand.descriptionAr = nextDescriptionAr
      }

      const updatedBrand = await brand.save()

      res.json(updatedBrand)

      runInBackground(
        () => logActivity(req, "UPDATE", "BRANDS", `Updated brand: ${updatedBrand.name}`, updatedBrand._id, updatedBrand.name),
        "Brand update activity log",
      )
      runInBackground(() => invalidateCache(['brands', 'products']), "Brand update cache invalidation")
    } else {
      res.status(404)
      throw new Error("Brand not found")
    }
  }),
)

// @desc    Delete a brand
// @route   DELETE /api/brands/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const brand = await Brand.findById(req.params.id)

    if (brand) {
      const brandName = brand.name
      const brandId = brand._id

      // Delete brand logo
      if (brand.logo && !isCloudinaryUrl(brand.logo)) {
        try {
          await deleteLocalFile(brand.logo)
        } catch (err) {
          console.error("Error deleting brand logo:", err)
        }
      }

      await brand.deleteOne()

      res.json({ message: "Brand removed" })

      runInBackground(
        () => logActivity(req, "DELETE", "BRANDS", `Deleted brand: ${brandName}`, brandId, brandName),
        "Brand delete activity log",
      )
      runInBackground(() => invalidateCache(['brands', 'products']), "Brand delete cache invalidation")
    } else {
      res.status(404)
      throw new Error("Brand not found")
    }
  }),
)

// @desc    Get a single brand by ID
// @route   GET /api/brands/:id
// @access  Private/Admin
router.get(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const brand = await Brand.findById(req.params.id)
    if (brand) {
      res.json(brand)
    } else {
      res.status(404)
      throw new Error("Brand not found")
    }
  })
)

export default router
