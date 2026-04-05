import express from "express"
import asyncHandler from "express-async-handler"
import BlogRating from "../models/blogRatingModel.js"
import Blog from "../models/blogModel.js"
import mongoose from "mongoose"
import { protect, admin } from "../middleware/authMiddleware.js"

const router = express.Router()

// @desc    Get all blog ratings
// @route   GET /api/blog-ratings
// @access  Private/Admin
router.get(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const ratings = await BlogRating.find({})
      .populate("blog", "title slug")
      .sort({ createdAt: -1 })

    res.json(ratings)
  }),
)

// @desc    Get rating stats
// @route   GET /api/blog-ratings/stats
// @access  Private/Admin
router.get(
  "/stats",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const totalRatings = await BlogRating.countDocuments({})
    const totalComments = await BlogRating.countDocuments({ comment: { $exists: true, $ne: "" } })
    const totalViews = await Blog.aggregate([{ $group: { _id: null, totalViews: { $sum: "$views" } } }])

    const avgRatingResult = await BlogRating.aggregate([{ $group: { _id: null, avgRating: { $avg: "$rating" } } }])

    const stats = {
      totalRatings,
      averageRating: avgRatingResult[0]?.avgRating || 0,
      totalComments,
      totalViews: totalViews[0]?.totalViews || 0,
    }

    res.json(stats)
  }),
)

// @desc    Get ratings for a specific blog
// @route   GET /api/blog-ratings/blog/:blogId
// @access  Public
router.get(
  "/blog/:blogId",
  asyncHandler(async (req, res) => {
    const ratings = await BlogRating.find({
      blog: req.params.blogId,
      isApproved: true,
    })
      .sort({ createdAt: -1 })

    const avgRating = await BlogRating.aggregate([
      { $match: { blog: new mongoose.Types.ObjectId(req.params.blogId), isApproved: true } },
      { $group: { _id: null, avgRating: { $avg: "$rating" }, totalRatings: { $sum: 1 } } },
    ])

    res.json({
      ratings,
      avgRating: avgRating[0]?.avgRating || 0,
      totalRatings: avgRating[0]?.totalRatings || 0,
    })
  }),
)

// @desc    Create blog rating
// @route   POST /api/blog-ratings
// @access  Private
router.post(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    const { blog, rating, comment } = req.body

    // Check if user already rated this blog
    const existingRating = await BlogRating.findOne({
      blog,
      user: req.user._id,
    })

    if (existingRating) {
      res.status(400)
      throw new Error("You have already rated this blog")
    }

    const blogRating = new BlogRating({
      blog,
      user: req.user._id,
      rating,
      comment,
    })

    const createdRating = await blogRating.save()
    res.status(201).json(createdRating)
  }),
)

// @desc    Update rating approval status
// @route   PATCH /api/blog-ratings/:id/approve
// @access  Private/Admin
router.patch(
  "/:id/approve",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { isApproved } = req.body

    const rating = await BlogRating.findByIdAndUpdate(req.params.id, { isApproved }, { new: true })

    if (!rating) {
      res.status(404)
      throw new Error("Rating not found")
    }

    res.json(rating)
  }),
)

// @desc    Delete blog rating
// @route   DELETE /api/blog-ratings/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const rating = await BlogRating.findById(req.params.id)

    if (!rating) {
      res.status(404)
      throw new Error("Rating not found")
    }

    await rating.deleteOne()
    res.json({ message: "Rating deleted successfully" })
  }),
)

export default router
