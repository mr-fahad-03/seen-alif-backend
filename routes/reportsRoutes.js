import express from "express"
import asyncHandler from "express-async-handler"
import { protect, admin } from "../middleware/authMiddleware.js"
import { superAdmin, checkPermission } from "../middleware/permissionMiddleware.js"
import ActivityLog from "../models/activityLogModel.js"
import User from "../models/userModel.js"
import Order from "../models/orderModel.js"
import Product from "../models/productModel.js"
import Category from "../models/categoryModel.js"
import Review from "../models/reviewModel.js"
import Blog from "../models/blogModel.js"
import Coupon from "../models/couponModel.js"

const router = express.Router()

// ============ COMPREHENSIVE REPORTS ============

// @desc    Get dashboard overview report
// @route   GET /api/reports/overview
// @access  Private/SuperAdmin
router.get(
  "/overview",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query
    
    const dateFilter = {}
    if (startDate) dateFilter.$gte = new Date(startDate)
    if (endDate) dateFilter.$lte = new Date(endDate)
    
    const createdAtFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}
    
    // Get counts
    const [
      totalOrders,
      totalProducts,
      totalUsers,
      totalCategories,
      totalReviews,
      totalBlogs,
      totalAdmins,
      totalSuperAdmins,
    ] = await Promise.all([
      Order.countDocuments(createdAtFilter),
      Product.countDocuments(createdAtFilter),
      User.countDocuments({ ...createdAtFilter, isAdmin: false }),
      Category.countDocuments(createdAtFilter),
      Review.countDocuments(createdAtFilter),
      Blog.countDocuments(createdAtFilter),
      User.countDocuments({ isAdmin: true, isSuperAdmin: false }),
      User.countDocuments({ isSuperAdmin: true }),
    ])
    
    // Get revenue
    const revenueData = await Order.aggregate([
      { $match: { ...createdAtFilter, status: { $in: ["delivered", "completed"] } } },
      { $group: { _id: null, totalRevenue: { $sum: "$totalPrice" } } }
    ])
    
    const totalRevenue = revenueData[0]?.totalRevenue || 0
    
    res.json({
      overview: {
        totalOrders,
        totalProducts,
        totalUsers,
        totalCategories,
        totalReviews,
        totalBlogs,
        totalAdmins,
        totalSuperAdmins,
        totalRevenue,
      },
      generatedAt: new Date().toISOString(),
    })
  })
)

// @desc    Get admin activity report (what each admin did)
// @route   GET /api/reports/admin-activity
// @access  Private/SuperAdmin
router.get(
  "/admin-activity",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { startDate, endDate, adminId, page = 1, limit = 50 } = req.query
    
    const query = {}
    
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }
    
    if (adminId) {
      query.user = adminId
    }
    
    // Get all admin users for the filter
    const admins = await User.find({ $or: [{ isAdmin: true }, { isSuperAdmin: true }] })
      .select("_id name email isSuperAdmin")
      .sort({ name: 1 })
    
    // Get activity grouped by admin
    const activityByAdmin = await ActivityLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$user",
          userName: { $first: "$userName" },
          userEmail: { $first: "$userEmail" },
          totalActions: { $sum: 1 },
          creates: { $sum: { $cond: [{ $eq: ["$action", "CREATE"] }, 1, 0] } },
          updates: { $sum: { $cond: [{ $eq: ["$action", "UPDATE"] }, 1, 0] } },
          deletes: { $sum: { $cond: [{ $eq: ["$action", "DELETE"] }, 1, 0] } },
          logins: { $sum: { $cond: [{ $eq: ["$action", "LOGIN"] }, 1, 0] } },
          lastActivity: { $max: "$createdAt" },
        }
      },
      { $sort: { totalActions: -1 } },
    ])
    
    // Enhance with super admin status
    const enhancedActivity = activityByAdmin.map(activity => {
      const admin = admins.find(a => a._id.toString() === activity._id?.toString())
      return {
        ...activity,
        isSuperAdmin: admin?.isSuperAdmin || false,
      }
    })
    
    // Get detailed logs with pagination
    const logs = await ActivityLog.find(query)
      .populate("user", "name email isSuperAdmin")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    
    const total = await ActivityLog.countDocuments(query)
    
    res.json({
      admins,
      activityByAdmin: enhancedActivity,
      logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
      generatedAt: new Date().toISOString(),
    })
  })
)

// @desc    Get module-wise activity report
// @route   GET /api/reports/module-activity
// @access  Private/SuperAdmin
router.get(
  "/module-activity",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { startDate, endDate, module } = req.query
    
    const query = {}
    
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }
    
    if (module) {
      query.module = module
    }
    
    // Get activity by module
    const byModule = await ActivityLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$module",
          totalActions: { $sum: 1 },
          creates: { $sum: { $cond: [{ $eq: ["$action", "CREATE"] }, 1, 0] } },
          updates: { $sum: { $cond: [{ $eq: ["$action", "UPDATE"] }, 1, 0] } },
          deletes: { $sum: { $cond: [{ $eq: ["$action", "DELETE"] }, 1, 0] } },
          lastActivity: { $max: "$createdAt" },
        }
      },
      { $sort: { totalActions: -1 } },
    ])
    
    // Get activity by day for chart
    const byDay = await ActivityLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ])
    
    res.json({
      byModule,
      byDay,
      generatedAt: new Date().toISOString(),
    })
  })
)

// @desc    Get order reports
// @route   GET /api/reports/orders
// @access  Private/SuperAdmin
router.get(
  "/orders",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query
    
    const dateFilter = {}
    if (startDate) dateFilter.$gte = new Date(startDate)
    if (endDate) dateFilter.$lte = new Date(endDate)
    
    const createdAtFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}
    
    // Orders by status
    const byStatus = await Order.aggregate([
      { $match: createdAtFilter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalPrice" },
        }
      },
      { $sort: { count: -1 } },
    ])
    
    // Orders by day
    const byDay = await Order.aggregate([
      { $match: createdAtFilter },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
          revenue: { $sum: "$totalPrice" },
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ])
    
    // Top products
    const topProducts = await Order.aggregate([
      { $match: createdAtFilter },
      { $unwind: "$orderItems" },
      {
        $group: {
          _id: "$orderItems.product",
          name: { $first: "$orderItems.name" },
          totalSold: { $sum: "$orderItems.qty" },
          totalRevenue: { $sum: { $multiply: ["$orderItems.price", "$orderItems.qty"] } },
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
    ])
    
    res.json({
      byStatus,
      byDay,
      topProducts,
      generatedAt: new Date().toISOString(),
    })
  })
)

// @desc    Get user reports
// @route   GET /api/reports/users
// @access  Private/SuperAdmin
router.get(
  "/users",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query
    
    const dateFilter = {}
    if (startDate) dateFilter.$gte = new Date(startDate)
    if (endDate) dateFilter.$lte = new Date(endDate)
    
    const createdAtFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}
    
    // User registrations by day
    const registrationsByDay = await User.aggregate([
      { $match: { ...createdAtFilter, isAdmin: false } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ])
    
    // Top customers by orders
    const topCustomers = await Order.aggregate([
      { $match: createdAtFilter },
      {
        $group: {
          _id: "$user",
          orderCount: { $sum: 1 },
          totalSpent: { $sum: "$totalPrice" },
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      { $unwind: "$userDetails" },
      {
        $project: {
          _id: 1,
          orderCount: 1,
          totalSpent: 1,
          name: "$userDetails.name",
          email: "$userDetails.email",
        }
      },
    ])
    
    res.json({
      registrationsByDay,
      topCustomers,
      generatedAt: new Date().toISOString(),
    })
  })
)

// @desc    Get comprehensive activity report for export
// @route   GET /api/reports/export/activity
// @access  Private/SuperAdmin
router.get(
  "/export/activity",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { startDate, endDate, format = "json", adminId, module, action } = req.query
    
    const query = {}
    
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }
    
    if (adminId) query.user = adminId
    if (module) query.module = module
    if (action) query.action = action
    
    const logs = await ActivityLog.find(query)
      .populate("user", "name email isSuperAdmin")
      .sort({ createdAt: -1 })
      .limit(5000) // Limit for export
    
    // Transform for export
    const exportData = logs.map(log => ({
      id: log._id,
      date: log.createdAt,
      adminName: log.userName,
      adminEmail: log.userEmail,
      isSuperAdmin: log.user?.isSuperAdmin ? "Yes" : "No",
      action: log.action,
      module: log.module,
      description: log.description,
      targetName: log.targetName || "-",
      ipAddress: log.ipAddress || "-",
      userAgent: log.userAgent || "-",
    }))
    
    if (format === "csv") {
      // Generate CSV
      const headers = Object.keys(exportData[0] || {}).join(",")
      const rows = exportData.map(row => 
        Object.values(row).map(val => 
          typeof val === "string" ? `"${val.replace(/"/g, '""')}"` : val
        ).join(",")
      ).join("\n")
      
      res.setHeader("Content-Type", "text/csv")
      res.setHeader("Content-Disposition", `attachment; filename=activity-report-${new Date().toISOString().split('T')[0]}.csv`)
      res.send(`${headers}\n${rows}`)
      return
    }
    
    res.json({
      data: exportData,
      total: exportData.length,
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate, adminId, module, action },
    })
  })
)

// @desc    Get comprehensive site report for export
// @route   GET /api/reports/export/site
// @access  Private/SuperAdmin
router.get(
  "/export/site",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query
    
    const dateFilter = {}
    if (startDate) dateFilter.$gte = new Date(startDate)
    if (endDate) dateFilter.$lte = new Date(endDate)
    
    const createdAtFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}
    
    // Gather all data
    const [
      orderStats,
      productStats,
      userStats,
      reviewStats,
      activityStats,
      recentOrders,
      adminActivity,
    ] = await Promise.all([
      // Order stats
      Order.aggregate([
        { $match: createdAtFilter },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$totalPrice" },
            avgOrderValue: { $avg: "$totalPrice" },
          }
        }
      ]),
      // Product stats
      Product.aggregate([
        { $match: createdAtFilter },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            avgPrice: { $avg: "$price" },
            totalStock: { $sum: "$countInStock" },
          }
        }
      ]),
      // User stats
      User.aggregate([
        { $match: { ...createdAtFilter, isAdmin: false } },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            verifiedUsers: { $sum: { $cond: ["$isEmailVerified", 1, 0] } },
          }
        }
      ]),
      // Review stats
      Review.aggregate([
        { $match: createdAtFilter },
        {
          $group: {
            _id: null,
            totalReviews: { $sum: 1 },
            avgRating: { $avg: "$rating" },
          }
        }
      ]),
      // Activity stats
      ActivityLog.aggregate([
        { $match: createdAtFilter },
        {
          $group: {
            _id: null,
            totalActivities: { $sum: 1 },
          }
        }
      ]),
      // Recent orders
      Order.find(createdAtFilter)
        .sort({ createdAt: -1 })
        .limit(100)
        .select("orderNumber totalPrice status createdAt user")
        .populate("user", "name email"),
      // Admin activity summary
      ActivityLog.aggregate([
        { $match: createdAtFilter },
        {
          $group: {
            _id: "$user",
            userName: { $first: "$userName" },
            userEmail: { $first: "$userEmail" },
            totalActions: { $sum: 1 },
            modules: { $addToSet: "$module" },
          }
        },
        { $sort: { totalActions: -1 } },
      ]),
    ])
    
    res.json({
      report: {
        title: "Comprehensive Site Report",
        generatedAt: new Date().toISOString(),
        period: {
          startDate: startDate || "All time",
          endDate: endDate || "Present",
        },
        summary: {
          orders: orderStats[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
          products: productStats[0] || { totalProducts: 0, avgPrice: 0, totalStock: 0 },
          users: userStats[0] || { totalUsers: 0, verifiedUsers: 0 },
          reviews: reviewStats[0] || { totalReviews: 0, avgRating: 0 },
          activities: activityStats[0] || { totalActivities: 0 },
        },
        recentOrders: recentOrders.map(o => ({
          orderNumber: o.orderNumber,
          customer: o.user?.name || "Guest",
          email: o.user?.email || "-",
          total: o.totalPrice,
          status: o.status,
          date: o.createdAt,
        })),
        adminActivity: adminActivity.map(a => ({
          name: a.userName,
          email: a.userEmail,
          totalActions: a.totalActions,
          modulesAccessed: a.modules?.length || 0,
        })),
      },
    })
  })
)

// @desc    Get all available report types
// @route   GET /api/reports/types
// @access  Private/SuperAdmin
router.get(
  "/types",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const reportTypes = [
      {
        id: "overview",
        name: "Site Overview",
        description: "General overview of site statistics including orders, products, users, and revenue",
        icon: "LayoutDashboard",
      },
      {
        id: "admin-activity",
        name: "Admin Activity Report",
        description: "Detailed report of all admin and super admin activities",
        icon: "UserCog",
      },
      {
        id: "module-activity",
        name: "Module Activity Report",
        description: "Activity breakdown by module/section of the admin panel",
        icon: "Layers",
      },
      {
        id: "orders",
        name: "Orders Report",
        description: "Order statistics, revenue, and top selling products",
        icon: "ShoppingCart",
      },
      {
        id: "users",
        name: "Users Report",
        description: "User registration trends and top customers",
        icon: "Users",
      },
      {
        id: "site-export",
        name: "Full Site Report",
        description: "Comprehensive exportable report with all site data",
        icon: "FileText",
      },
    ]
    
    res.json(reportTypes)
  })
)

export default router
