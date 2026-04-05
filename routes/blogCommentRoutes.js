import express from "express"
import asyncHandler from "express-async-handler"
import BlogComment from "../models/blogCommentModel.js"
import Blog from "../models/blogModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"

const router = express.Router()

// @desc    Get all blog comments (Admin)
// @route   GET /api/blog-comments
// @access  Private/Admin
router.get(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { status, blog, search, page = 1, limit = 50 } = req.query

    const query = {}

    // Filter by status
    if (status && status !== "all") {
      query.status = status
    }

    // Filter by blog
    if (blog && blog !== "all") {
      query.blog = blog
    }

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { comment: { $regex: search, $options: "i" } },
      ]
    }

    const comments = await BlogComment.find(query)
      .populate("blog", "title slug")
      .populate("parentComment", "name comment")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await BlogComment.countDocuments(query)

    res.json({
      comments,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    })
  }),
)

// @desc    Get comments for a specific blog (Public)
// @route   GET /api/blog-comments/blog/:blogId
// @access  Public
router.get(
  "/blog/:blogId",
  asyncHandler(async (req, res) => {
    const comments = await BlogComment.find({
      blog: req.params.blogId,
      status: "approved",
      parentComment: null, // Only get top-level comments
    })
      .sort({ createdAt: -1 })

    // Get replies for each comment
    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        const replies = await BlogComment.find({
          parentComment: comment._id,
          status: "approved",
        })
          .sort({ createdAt: 1 })

        return {
          ...comment.toObject(),
          replies,
        }
      }),
    )

    res.json(commentsWithReplies)
  }),
)

// @desc    Get single blog comment
// @route   GET /api/blog-comments/:id
// @access  Private/Admin
router.get(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const comment = await BlogComment.findById(req.params.id)
      .populate("blog", "title slug")
      .populate("parentComment", "name comment")

    if (!comment) {
      res.status(404)
      throw new Error("Comment not found")
    }

    res.json(comment)
  }),
)

// @desc    Create new blog comment (Public)
// @route   POST /api/blog-comments
// @access  Public
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { blog, name, email, comment, parentComment, rating, user } = req.body

    // Verify blog exists
    const blogExists = await Blog.findById(blog)
    if (!blogExists) {
      res.status(404)
      throw new Error("Blog not found")
    }

    // Get IP address
    const ipAddress = req.headers["x-forwarded-for"] || req.connection.remoteAddress

    const newComment = new BlogComment({
      blog,
      name,
      email,
      comment,
      parentComment: parentComment || null,
      rating,
      user: user || null,
      ipAddress,
      status: "pending", // All comments start as pending
    })

    const createdComment = await newComment.save()
    res.status(201).json(createdComment)
  }),
)

// @desc    Update blog comment status
// @route   PUT /api/blog-comments/:id/status
// @access  Private/Admin
router.put(
  "/:id/status",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const comment = await BlogComment.findById(req.params.id)

    if (!comment) {
      res.status(404)
      throw new Error("Comment not found")
    }

    const { status } = req.body

    if (!["pending", "approved", "rejected", "spam"].includes(status)) {
      res.status(400)
      throw new Error("Invalid status")
    }

    comment.status = status
    const updatedComment = await comment.save()

    res.json(updatedComment)
  }),
)

// @desc    Update blog comment (Admin)
// @route   PUT /api/blog-comments/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const comment = await BlogComment.findById(req.params.id)

    if (!comment) {
      res.status(404)
      throw new Error("Comment not found")
    }

    const { name, email, comment: commentText, status, adminReply, rating } = req.body

    comment.name = name || comment.name
    comment.email = email || comment.email
    comment.comment = commentText || comment.comment
    comment.status = status || comment.status
    comment.adminReply = adminReply !== undefined ? adminReply : comment.adminReply
    comment.rating = rating !== undefined ? rating : comment.rating

    const updatedComment = await comment.save()
    res.json(updatedComment)
  }),
)

// @desc    Delete blog comment
// @route   DELETE /api/blog-comments/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const comment = await BlogComment.findById(req.params.id)

    if (!comment) {
      res.status(404)
      throw new Error("Comment not found")
    }

    // Also delete all replies to this comment
    await BlogComment.deleteMany({ parentComment: req.params.id })

    await BlogComment.findByIdAndDelete(req.params.id)
    res.json({ message: "Comment and replies deleted successfully" })
  }),
)

// @desc    Bulk delete blog comments
// @route   POST /api/blog-comments/bulk-delete
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

    // Delete comments and their replies
    await BlogComment.deleteMany({
      $or: [{ _id: { $in: ids } }, { parentComment: { $in: ids } }],
    })

    res.json({ message: `Comments deleted successfully` })
  }),
)

// @desc    Bulk update comment status
// @route   POST /api/blog-comments/bulk-status
// @access  Private/Admin
router.post(
  "/bulk-status",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { ids, status } = req.body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400)
      throw new Error("Please provide an array of IDs")
    }

    if (!["pending", "approved", "rejected", "spam"].includes(status)) {
      res.status(400)
      throw new Error("Invalid status")
    }

    await BlogComment.updateMany({ _id: { $in: ids } }, { status })

    res.json({ message: `${ids.length} comment(s) updated successfully` })
  }),
)

export default router
