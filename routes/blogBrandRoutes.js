import express from "express"
import asyncHandler from "express-async-handler"
import BlogBrand from "../models/blogBrandModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"

const router = express.Router()

// @desc    Get all blog brands
// @route   GET /api/blog-brands
// @access  Public
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, search, page = 1, limit = 50 } = req.query

    const query = {}

    // Filter by status
    if (status && status !== "all") {
      query.isActive = status === "active"
    }

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ]
    }

    const blogBrands = await BlogBrand.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await BlogBrand.countDocuments(query)

    res.json({
      blogBrands,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    })
  }),
)

// @desc    Get single blog brand
// @route   GET /api/blog-brands/:id
// @access  Public
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const blogBrand = await BlogBrand.findById(req.params.id)

    if (!blogBrand) {
      res.status(404)
      throw new Error("Blog brand not found")
    }

    res.json(blogBrand)
  }),
)

// @desc    Get blog brand by slug
// @route   GET /api/blog-brands/slug/:slug
// @access  Public
router.get(
  "/slug/:slug",
  asyncHandler(async (req, res) => {
    const blogBrand = await BlogBrand.findOne({ slug: req.params.slug })

    if (!blogBrand) {
      res.status(404)
      throw new Error("Blog brand not found")
    }

    res.json(blogBrand)
  }),
)

// @desc    Create new blog brand
// @route   POST /api/blog-brands
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, slug, description, logo, website, isActive, metaTitle, metaDescription } = req.body

    // Check if slug already exists
    const existingBlogBrand = await BlogBrand.findOne({ slug })
    if (existingBlogBrand) {
      res.status(400)
      throw new Error("Slug already exists")
    }

    const blogBrand = new BlogBrand({
      name,
      slug,
      description,
      logo,
      website,
      isActive,
      metaTitle,
      metaDescription,
    })

    const createdBlogBrand = await blogBrand.save()
    res.status(201).json(createdBlogBrand)
  }),
)

// @desc    Update blog brand
// @route   PUT /api/blog-brands/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const blogBrand = await BlogBrand.findById(req.params.id)

    if (!blogBrand) {
      res.status(404)
      throw new Error("Blog brand not found")
    }

    const { name, slug, description, logo, website, isActive, metaTitle, metaDescription } = req.body

    // Check if slug is being changed and if new slug already exists
    if (slug && slug !== blogBrand.slug) {
      const existingBlogBrand = await BlogBrand.findOne({ slug })
      if (existingBlogBrand) {
        res.status(400)
        throw new Error("Slug already exists")
      }
    }

    blogBrand.name = name || blogBrand.name
    blogBrand.slug = slug || blogBrand.slug
    blogBrand.description = description || blogBrand.description
    blogBrand.logo = logo !== undefined ? logo : blogBrand.logo
    blogBrand.website = website || blogBrand.website
    blogBrand.isActive = isActive !== undefined ? isActive : blogBrand.isActive
    blogBrand.metaTitle = metaTitle || blogBrand.metaTitle
    blogBrand.metaDescription = metaDescription || blogBrand.metaDescription

    const updatedBlogBrand = await blogBrand.save()
    res.json(updatedBlogBrand)
  }),
)

// @desc    Delete blog brand
// @route   DELETE /api/blog-brands/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const blogBrand = await BlogBrand.findById(req.params.id)

    if (!blogBrand) {
      res.status(404)
      throw new Error("Blog brand not found")
    }

    await BlogBrand.findByIdAndDelete(req.params.id)
    res.json({ message: "Blog brand deleted successfully" })
  }),
)

// @desc    Bulk delete blog brands
// @route   POST /api/blog-brands/bulk-delete
// @access  Private/Admin
router.post(
  "/bulk-delete",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { ids } = req.body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400)
      throw new Error("Please provide an array of IDs")
    }

    await BlogBrand.deleteMany({ _id: { $in: ids } })
    res.json({ message: `${ids.length} blog brand(s) deleted successfully` })
  }),
)

export default router
