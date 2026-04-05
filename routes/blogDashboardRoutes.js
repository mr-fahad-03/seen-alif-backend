import express from "express"
import asyncHandler from "express-async-handler"
import Blog from "../models/blogModel.js"
import BlogCategory from "../models/blogCategoryModel.js"
import BlogTopic from "../models/blogTopicModel.js"
import BlogBrand from "../models/blogBrandModel.js"
import BlogComment from "../models/blogCommentModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"

const router = express.Router()

// @desc    Get blog dashboard statistics
// @route   GET /api/blog-dashboard/stats
// @access  Private/Admin
router.get(
  "/stats",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    // Get all stats in parallel
    const [
      totalBlogs,
      publishedBlogs,
      draftBlogs,
      archivedBlogs,
      totalCategories,
      activeCategories,
      totalTopics,
      activeTopics,
      totalBrands,
      activeBrands,
      totalComments,
      pendingComments,
      approvedComments,
      rejectedComments,
      totalViews,
      totalLikes,
      recentBlogs,
      popularBlogs,
      recentComments,
    ] = await Promise.all([
      // Blog stats
      Blog.countDocuments(),
      Blog.countDocuments({ status: "published" }),
      Blog.countDocuments({ status: "draft" }),
      Blog.countDocuments({ status: "archived" }),

      // Category stats
      BlogCategory.countDocuments(),
      BlogCategory.countDocuments({ isActive: true }),

      // Topic stats
      BlogTopic.countDocuments(),
      BlogTopic.countDocuments({ isActive: true }),

      // Brand stats
      BlogBrand.countDocuments(),
      BlogBrand.countDocuments({ isActive: true }),

      // Comment stats
      BlogComment.countDocuments(),
      BlogComment.countDocuments({ status: "pending" }),
      BlogComment.countDocuments({ status: "approved" }),
      BlogComment.countDocuments({ status: "rejected" }),

      // Engagement stats
      Blog.aggregate([{ $group: { _id: null, total: { $sum: "$views" } } }]),
      Blog.aggregate([{ $group: { _id: null, total: { $sum: "$likes" } } }]),

      // Recent blogs
      Blog.find().sort({ createdAt: -1 }).limit(5).populate("blogCategory", "name").populate("topic", "name"),

      // Popular blogs (by views)
      Blog.find().sort({ views: -1 }).limit(5).populate("blogCategory", "name").populate("topic", "name"),

      // Recent comments
      BlogComment.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("blog", "title"),
    ])

    // Get category distribution
    const categoryDistribution = await Blog.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$blogCategory", count: { $sum: 1 } } },
      { $lookup: { from: "blogcategories", localField: "_id", foreignField: "_id", as: "category" } },
      { $unwind: "$category" },
      { $project: { name: "$category.name", count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ])

    // Get topic distribution
    const topicDistribution = await Blog.aggregate([
      { $match: { status: "published", topic: { $ne: null } } },
      { $group: { _id: "$topic", count: { $sum: 1 } } },
      { $lookup: { from: "blogtopics", localField: "_id", foreignField: "_id", as: "topic" } },
      { $unwind: "$topic" },
      { $project: { name: "$topic.name", count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ])

    // Get monthly blog creation trend (last 6 months)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const monthlyTrend = await Blog.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ])

    res.json({
      overview: {
        totalBlogs,
        publishedBlogs,
        draftBlogs,
        archivedBlogs,
        totalCategories,
        activeCategories,
        totalTopics,
        activeTopics,
        totalBrands,
        activeBrands,
        totalComments,
        pendingComments,
        approvedComments,
        rejectedComments,
        totalViews: totalViews[0]?.total || 0,
        totalLikes: totalLikes[0]?.total || 0,
      },
      recentBlogs,
      popularBlogs,
      recentComments,
      categoryDistribution,
      topicDistribution,
      monthlyTrend,
    })
  }),
)

export default router
