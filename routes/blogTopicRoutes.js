import express from "express"
import asyncHandler from "express-async-handler"
import BlogTopic from "../models/blogTopicModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js"

const router = express.Router()

// @desc    Get all blog topics
// @route   GET /api/blog-topics
// @access  Public
router.get(
  "/",
  cacheMiddleware("blogTopics", { ttl: 300 }),
  asyncHandler(async (req, res) => {
    const topics = await BlogTopic.find({ isActive: true }).sort({ name: 1 })
    res.json(topics)
  }),
)

// @desc    Get single blog topic
// @route   GET /api/blog-topics/:id
// @access  Public
router.get(
  "/:id",
  cacheMiddleware("blogTopics", { keyPrefix: "byId", ttl: 300 }),
  asyncHandler(async (req, res) => {
    const topic = await BlogTopic.findById(req.params.id)

    if (!topic) {
      res.status(404)
      throw new Error("Topic not found")
    }

    res.json(topic)
  }),
)

// @desc    Create blog topic
// @route   POST /api/blog-topics
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, slug, description, color } = req.body

    // Check if slug already exists
    const existingTopic = await BlogTopic.findOne({ slug })
    if (existingTopic) {
      res.status(400)
      throw new Error("Slug already exists")
    }

    const topic = new BlogTopic({
      name,
      slug,
      description,
      color,
    })

    const createdTopic = await topic.save()
    await invalidateCache(["blogs", "blogTopics"])
    res.status(201).json(createdTopic)
  }),
)

// @desc    Update blog topic
// @route   PUT /api/blog-topics/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const topic = await BlogTopic.findById(req.params.id)

    if (!topic) {
      res.status(404)
      throw new Error("Topic not found")
    }

    Object.assign(topic, req.body)
    const updatedTopic = await topic.save()
    await invalidateCache(["blogs", "blogTopics"])

    res.json(updatedTopic)
  }),
)

// @desc    Delete blog topic
// @route   DELETE /api/blog-topics/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const topic = await BlogTopic.findById(req.params.id)

    if (!topic) {
      res.status(404)
      throw new Error("Topic not found")
    }

    await topic.deleteOne()
    await invalidateCache(["blogs", "blogTopics"])
    res.json({ message: "Topic deleted successfully" })
  }),
)

export default router
