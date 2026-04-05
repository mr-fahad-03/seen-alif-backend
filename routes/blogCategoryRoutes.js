import express from "express"
import asyncHandler from "express-async-handler"
import BlogCategory from "../models/blogCategoryModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js"

const router = express.Router()

// @desc    Get all blog categories
// @route   GET /api/blog-categories
// @access  Public
router.get(
  "/",
  cacheMiddleware("blogCategories", { ttl: 300 }),
  asyncHandler(async (req, res) => {
    const categories = await BlogCategory.find({ isActive: true })
      .populate("parentCategory", "name slug")
      .sort({ name: 1 })

    res.json(categories)
  }),
)

// @desc    Get single blog category
// @route   GET /api/blog-categories/:id
// @access  Public
router.get(
  "/:id",
  cacheMiddleware("blogCategories", { keyPrefix: "byId", ttl: 300 }),
  asyncHandler(async (req, res) => {
    const category = await BlogCategory.findById(req.params.id).populate("parentCategory", "name slug")

    if (!category) {
      res.status(404)
      throw new Error("Category not found")
    }

    res.json(category)
  }),
)

// @desc    Create blog category
// @route   POST /api/blog-categories
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, slug, description, image, parentCategory, metaTitle, metaDescription } = req.body

    // Check if slug already exists
    const existingCategory = await BlogCategory.findOne({ slug })
    if (existingCategory) {
      res.status(400)
      throw new Error("Slug already exists")
    }

    const category = new BlogCategory({
      name,
      slug,
      description,
      image,
      parentCategory,
      metaTitle,
      metaDescription,
    })

    const createdCategory = await category.save()
    await invalidateCache(["blogs", "blogCategories"])
    res.status(201).json(createdCategory)
  }),
)

// @desc    Update blog category
// @route   PUT /api/blog-categories/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const category = await BlogCategory.findById(req.params.id)

    if (!category) {
      res.status(404)
      throw new Error("Category not found")
    }

    Object.assign(category, req.body)
    const updatedCategory = await category.save()
    await invalidateCache(["blogs", "blogCategories"])

    res.json(updatedCategory)
  }),
)

// @desc    Delete blog category
// @route   DELETE /api/blog-categories/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const category = await BlogCategory.findById(req.params.id)

    if (!category) {
      res.status(404)
      throw new Error("Category not found")
    }

    await category.deleteOne()
    await invalidateCache(["blogs", "blogCategories"])
    res.json({ message: "Category deleted successfully" })
  }),
)

export default router
