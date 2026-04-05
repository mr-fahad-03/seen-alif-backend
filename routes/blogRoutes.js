import express from "express"
import asyncHandler from "express-async-handler"
import mongoose from "mongoose"
import Blog from "../models/blogModel.js"
import BlogCategory from "../models/blogCategoryModel.js"
import BlogTopic from "../models/blogTopicModel.js"
import BlogBrand from "../models/blogBrandModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { logActivity } from "../middleware/permissionMiddleware.js"
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js"

const router = express.Router()

const toBool = (value) => String(value).toLowerCase() === "true"

const stripHtml = (html = "") =>
  String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const toSummaryBlog = (blog) => {
  const source = blog?.toObject ? blog.toObject() : blog
  return {
    ...source,
    description: stripHtml(source?.description || "").slice(0, 320),
  }
}

const parseSort = (sortValue) => {
  if (!sortValue || typeof sortValue !== "string") {
    return { createdAt: -1 }
  }

  const field = sortValue.startsWith("-") ? sortValue.slice(1) : sortValue
  const order = sortValue.startsWith("-") ? -1 : 1
  const normalizedField = field === "publishedAt" ? "createdAt" : field
  return { [normalizedField]: order }
}

// Ensure all blog models are registered (lazy initialization)
let modelsInitialized = false
const ensureModelsInitialized = () => {
  if (!modelsInitialized) {
    // Access the models to trigger lazy initialization
    // This registers them on the blog connection
    try {
      BlogCategory.find
      BlogTopic.find
      BlogBrand.find
      modelsInitialized = true
    } catch (err) {
      console.error("Error initializing blog models:", err.message)
    }
  }
}

// @desc    Get featured blogs
// @route   GET /api/blogs/featured
// @access  Public
router.get(
  "/featured",
  asyncHandler(async (req, res) => {
    ensureModelsInitialized() // Ensure models are registered before populate
    
    const featuredBlogs = await Blog.find({ 
      status: "published", 
      featured: true 
    })
      .populate("blogCategory", "name slug")
      .populate("topic", "name slug color")
      .populate("brand", "name slug logo")
      .sort({ createdAt: -1 })
      .limit(10)

    res.json(featuredBlogs)
  }),
)

// @desc    Get trending blogs
// @route   GET /api/blogs/trending
// @access  Public
router.get(
  "/trending",
  cacheMiddleware("blogs", { keyPrefix: "trending", ttl: 300 }),
  asyncHandler(async (req, res) => {
    ensureModelsInitialized() // Ensure models are registered before populate
    
    const { limit = 20, summary = "false" } = req.query
    const isSummary = toBool(summary)
    
    let trendingQuery = Blog.find({ 
      status: "published", 
      trending: true 
    })
      .populate("blogCategory", "name slug")
      .populate("topic", "name slug color")
      .populate("brand", "name slug logo")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))

    if (isSummary) {
      trendingQuery = trendingQuery
        .select(
          "blogName title slug status featured trending blogCategory mainCategory subCategory1 subCategory2 subCategory3 subCategory4 topic brand mainImage readMinutes postedBy description views likes shares createdAt updatedAt",
        )
        .lean()
    }

    const trendingBlogs = await trendingQuery

    res.json(isSummary ? trendingBlogs.map(toSummaryBlog) : trendingBlogs)
  }),
)

// @desc    Get all blogs
// @route   GET /api/blogs
// @access  Public
router.get(
  "/",
  cacheMiddleware("blogs", { keyPrefix: "list", ttl: 300 }),
  asyncHandler(async (req, res) => {
    ensureModelsInitialized() // Ensure models are registered before populate
    
    const { status, category, topic, search, page = 1, limit = 10, summary = "false", sort } = req.query
    const isSummary = toBool(summary)

    const query = {}

    // Filter by status
    if (status && status !== "all") {
      query.status = status
    }

    // Filter by category
    if (category && category !== "all") {
      query.blogCategory = category
    }

    // Filter by topic
    if (topic && topic !== "all") {
      query.topic = topic
    }

    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ]
    }

    let blogsQuery = Blog.find(query)
      .populate("blogCategory", "name slug")
      .populate("topic", "name slug color")
      .populate("brand", "name slug logo")
      .sort(parseSort(sort))
      .limit(limit * 1)
      .skip((page - 1) * limit)

    if (isSummary) {
      blogsQuery = blogsQuery
        .select(
          "blogName title slug status featured trending blogCategory mainCategory subCategory1 subCategory2 subCategory3 subCategory4 topic brand mainImage readMinutes postedBy description views likes shares createdAt updatedAt",
        )
        .lean()
    }

    const blogs = await blogsQuery
    const total = await Blog.countDocuments(query)
    
    const currentPage = parseInt(page)
    const itemsPerPage = parseInt(limit)
    const totalPages = Math.ceil(total / itemsPerPage)

    res.json({
      blogs: isSummary ? blogs.map(toSummaryBlog) : blogs,
      pagination: {
        current: currentPage,
        total: totalPages,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
        totalBlogs: total
      }
    })
  }),
)

// @desc    Get single blog
// @route   GET /api/blogs/:id
// @access  Public
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    ensureModelsInitialized() // Ensure models are registered before populate
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400)
      throw new Error("Invalid blog ID format")
    }
    
    const blog = await Blog.findById(req.params.id)
      .populate("blogCategory", "name slug")
      .populate("topic", "name slug color")
      .populate("brand", "name slug logo")

    if (!blog) {
      res.status(404)
      throw new Error("Blog not found")
    }

    // Increment views
    blog.views += 1
    await blog.save()

    res.json(blog)
  }),
)

// @desc    Get blog by slug
// @route   GET /api/blogs/slug/:slug
// @access  Public
router.get(
  "/slug/:slug",
  asyncHandler(async (req, res) => {
    ensureModelsInitialized() // Ensure models are registered before populate
    
    const blog = await Blog.findOne({ slug: req.params.slug })
      .populate("blogCategory", "name slug")
      .populate("topic", "name slug color")
      .populate("brand", "name slug logo")

    if (!blog) {
      res.status(404)
      throw new Error("Blog not found")
    }

    // Increment views
    blog.views += 1
    await blog.save()

    res.json(blog)
  }),
)

// @desc    Create new blog
// @route   POST /api/blogs
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    ensureModelsInitialized() // Ensure models are registered before populate
    
    const {
      blogName,
      title,
      slug,
      status,
      featured,
      trending,
      blogCategory,
      mainCategory,
      subCategory1,
      subCategory2,
      subCategory3,
      subCategory4,
      topic,
      brand,
      mainImage,
      additionalImage,
      readMinutes,
      postedBy,
      description,
      metaTitle,
      metaDescription,
      schema,
      tags,
    } = req.body

    // Check if slug already exists
    const existingBlog = await Blog.findOne({ slug })
    if (existingBlog) {
      res.status(400)
      throw new Error("Slug already exists")
    }

    const blog = new Blog({
      blogName,
      title,
      slug,
      status,
      featured: featured || false,
      trending: trending || false,
      blogCategory: blogCategory || null,
      topic: topic || null,
      brand: brand || null,
      mainImage,
      additionalImage,
      readMinutes,
      postedBy,
      description,
      metaTitle,
      metaDescription,
      schema,
      tags,
    })

    const createdBlog = await blog.save()

    // Populate the created blog before returning
    const populatedBlog = await Blog.findById(createdBlog._id)
      .populate("blogCategory", "name slug")
      .populate("topic", "name slug color")
      .populate("brand", "name slug")

    // Log activity
    if (req.user) {
      await logActivity({
        user: req.user,
        action: "CREATE",
        module: "BLOGS",
        description: `Created blog: ${title}`,
        targetId: createdBlog._id.toString(),
        targetName: title,
        newData: { title, slug, status },
        req,
      })
    }
    
    await invalidateCache(["blogs", "blogCategories", "blogTopics", "blogBrands"])

    res.status(201).json(populatedBlog)
  }),
)

// @desc    Update blog
// @route   PUT /api/blogs/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    ensureModelsInitialized() // Ensure models are registered before populate
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400)
      throw new Error("Invalid blog ID format")
    }
    
    const blog = await Blog.findById(req.params.id)

    if (!blog) {
      res.status(404)
      throw new Error("Blog not found")
    }

    const {
      blogName,
      title,
      slug,
      status,
      featured,
      trending,
      blogCategory,
      mainCategory,
      subCategory1,
      subCategory2,
      subCategory3,
      subCategory4,
      topic,
      brand,
      mainImage,
      additionalImage,
      readMinutes,
      postedBy,
      description,
      metaTitle,
      metaDescription,
      schema,
      tags,
    } = req.body

    // Update blog fields
    blog.blogName = blogName || blog.blogName
    blog.title = title || blog.title
    blog.slug = slug || blog.slug
    blog.status = status || blog.status
    blog.featured = featured !== undefined ? featured : blog.featured
    blog.trending = trending !== undefined ? trending : blog.trending
    blog.blogCategory = blogCategory || blog.blogCategory
    blog.topic = topic || blog.topic
    blog.brand = brand || blog.brand
    blog.mainImage = mainImage || blog.mainImage
    blog.additionalImage = additionalImage || blog.additionalImage
    blog.readMinutes = readMinutes || blog.readMinutes
    blog.postedBy = postedBy || blog.postedBy
    blog.description = description || blog.description
    blog.metaTitle = metaTitle || blog.metaTitle
    blog.metaDescription = metaDescription || blog.metaDescription
    blog.schema = schema !== undefined ? schema : blog.schema
    blog.tags = tags || blog.tags

    const updatedBlog = await blog.save()

    // Populate the updated blog before returning
    const populatedBlog = await Blog.findById(updatedBlog._id)
      .populate("blogCategory", "name slug")
      .populate("topic", "name slug color")
      .populate("brand", "name slug logo")

    // Log activity
    if (req.user) {
      await logActivity({
        user: req.user,
        action: "UPDATE",
        module: "BLOGS",
        description: `Updated blog: ${updatedBlog.title}`,
        targetId: updatedBlog._id.toString(),
        targetName: updatedBlog.title,
        newData: { title: updatedBlog.title, status: updatedBlog.status },
        req,
      })
    }
    
    await invalidateCache(["blogs", "blogCategories", "blogTopics", "blogBrands"])

    res.json(populatedBlog)
  }),
)

// @desc    Update blog status
// @route   PATCH /api/blogs/:id/status
// @access  Private/Admin
router.patch(
  "/:id/status",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400)
      throw new Error("Invalid blog ID format")
    }
    
    const { status } = req.body

    const blog = await Blog.findByIdAndUpdate(req.params.id, { status }, { new: true })
      .populate("blogCategory", "name slug")
      .populate("topic", "name slug color")
      .populate("brand", "name slug")

    if (!blog) {
      res.status(404)
      throw new Error("Blog not found")
    }

    await invalidateCache(["blogs", "blogCategories", "blogTopics", "blogBrands"])

    res.json(blog)
  }),
)

// @desc    Delete blog
// @route   DELETE /api/blogs/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400)
      throw new Error("Invalid blog ID format")
    }
    
    const blog = await Blog.findById(req.params.id)

    if (!blog) {
      res.status(404)
      throw new Error("Blog not found")
    }

    const blogTitle = blog.title
    await blog.deleteOne()

    // Log activity
    if (req.user) {
      await logActivity({
        user: req.user,
        action: "DELETE",
        module: "BLOGS",
        description: `Deleted blog: ${blogTitle}`,
        targetId: req.params.id,
        targetName: blogTitle,
        req,
      })
    }

    await invalidateCache(["blogs", "blogCategories", "blogTopics", "blogBrands"])

    res.json({ message: "Blog deleted successfully" })
  }),
)

export default router
