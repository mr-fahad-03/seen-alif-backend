import express from "express"
import asyncHandler from "express-async-handler"
import User from "../models/userModel.js"
import ActivityLog from "../models/activityLogModel.js"
import generateToken from "../utils/generateToken.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { superAdmin, checkPermission, logActivity } from "../middleware/permissionMiddleware.js"
import bcrypt from "bcryptjs"

const router = express.Router()

// ============ SUPER ADMIN ROUTES ============

// @desc    Get all admin users
// @route   GET /api/super-admin/admins
// @access  Private/SuperAdmin
router.get(
  "/admins",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search = "" } = req.query

    const query = {
      $or: [{ isAdmin: true }, { isSuperAdmin: true }],
    }

    if (search) {
      query.$and = [
        { $or: [{ isAdmin: true }, { isSuperAdmin: true }] },
        {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        },
      ]
      delete query.$or
    }

    const admins = await User.find(query)
      .select("-password")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await User.countDocuments(query)

    res.json({
      admins,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    })
  })
)

// @desc    Check if user exists by email
// @route   POST /api/super-admin/check-user
// @access  Private/SuperAdmin
router.post(
  "/check-user",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { email } = req.body

    if (!email) {
      res.status(400)
      throw new Error("Email is required")
    }

    const user = await User.findOne({ email }).select("-password")

    if (user) {
      res.json({
        exists: true,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin,
          isSuperAdmin: user.isSuperAdmin,
        },
      })
    } else {
      res.json({
        exists: false,
      })
    }
  })
)

// @desc    Promote existing user to admin
// @route   PUT /api/super-admin/promote-to-admin/:id
// @access  Private/SuperAdmin
router.put(
  "/promote-to-admin/:id",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { isSuperAdmin: makeSuperAdmin, permissions } = req.body

    const user = await User.findById(req.params.id)

    if (!user) {
      res.status(404)
      throw new Error("User not found")
    }

    if (user.isAdmin) {
      res.status(400)
      throw new Error("User is already an admin")
    }

    // Promote user to admin
    user.isAdmin = true
    user.isSuperAdmin = makeSuperAdmin || false
    user.adminPermissions = permissions || { fullAccess: false }
    user.isEmailVerified = true

    const updatedUser = await user.save()

    // Log activity
    await logActivity({
      user: req.user,
      action: "UPDATE",
      module: "ADMIN_MANAGEMENT",
      description: `Promoted user to admin: ${updatedUser.email}`,
      targetId: updatedUser._id.toString(),
      targetName: updatedUser.name,
      oldData: { isAdmin: false },
      newData: { isAdmin: true, isSuperAdmin: makeSuperAdmin, permissions },
      req,
    })

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
      isSuperAdmin: updatedUser.isSuperAdmin,
      adminPermissions: updatedUser.adminPermissions,
      message: "User promoted to admin successfully",
    })
  })
)

// @desc    Create new admin user
// @route   POST /api/super-admin/admins
// @access  Private/SuperAdmin
router.post(
  "/admins",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { name, email, password, permissions, isSuperAdmin: makeSuperAdmin } = req.body

    // Check if user exists
    const userExists = await User.findOne({ email })
    if (userExists) {
      res.status(400)
      throw new Error("User already exists with this email")
    }

    // Create admin user
    const user = await User.create({
      name,
      email,
      password,
      isAdmin: true,
      isSuperAdmin: makeSuperAdmin || false,
      adminPermissions: permissions || { fullAccess: false },
      isEmailVerified: true, // Admin users don't need email verification
      createdBy: req.user._id,
    })

    if (user) {
      // Log activity
      await logActivity({
        user: req.user,
        action: "CREATE",
        module: "ADMIN_MANAGEMENT",
        description: `Created new admin user: ${user.email}`,
        targetId: user._id.toString(),
        targetName: user.name,
        newData: { name, email, permissions, isSuperAdmin: makeSuperAdmin },
        req,
      })

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        isSuperAdmin: user.isSuperAdmin,
        adminPermissions: user.adminPermissions,
        createdAt: user.createdAt,
      })
    } else {
      res.status(400)
      throw new Error("Invalid user data")
    }
  })
)

// @desc    Update admin user
// @route   PUT /api/super-admin/admins/:id
// @access  Private/SuperAdmin
router.put(
  "/admins/:id",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)

    if (!user) {
      res.status(404)
      throw new Error("User not found")
    }

    // Prevent super admin from modifying themselves through this route
    if (user._id.toString() === req.user._id.toString()) {
      res.status(400)
      throw new Error("Cannot modify your own admin account through this route")
    }

    const previousData = {
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin,
      adminPermissions: user.adminPermissions,
    }

    const { name, email, password, permissions, isAdmin, isSuperAdmin: makeSuperAdmin, isActive } = req.body

    user.name = name || user.name
    user.email = email || user.email
    
    if (password) {
      user.password = password
    }
    
    if (typeof isAdmin === "boolean") {
      user.isAdmin = isAdmin
    }
    
    if (typeof makeSuperAdmin === "boolean") {
      user.isSuperAdmin = makeSuperAdmin
    }
    
    if (permissions) {
      user.adminPermissions = permissions
    }

    const updatedUser = await user.save()

    // Log activity
    await logActivity({
      user: req.user,
      action: "UPDATE",
      module: "ADMIN_MANAGEMENT",
      description: `Updated admin user: ${updatedUser.email}`,
      targetId: updatedUser._id.toString(),
      targetName: updatedUser.name,
      previousData,
      newData: { name, email, permissions, isAdmin, isSuperAdmin: makeSuperAdmin },
      req,
    })

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
      isSuperAdmin: updatedUser.isSuperAdmin,
      adminPermissions: updatedUser.adminPermissions,
      createdAt: updatedUser.createdAt,
    })
  })
)

// @desc    Delete admin user
// @route   DELETE /api/super-admin/admins/:id
// @access  Private/SuperAdmin
router.delete(
  "/admins/:id",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)

    if (!user) {
      res.status(404)
      throw new Error("User not found")
    }

    // Prevent super admin from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      res.status(400)
      throw new Error("Cannot delete your own account")
    }

    const userData = {
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      isSuperAdmin: user.isSuperAdmin,
    }

    await User.findByIdAndDelete(req.params.id)

    // Log activity
    await logActivity({
      user: req.user,
      action: "DELETE",
      module: "ADMIN_MANAGEMENT",
      description: `Deleted admin user: ${userData.email}`,
      targetId: req.params.id,
      targetName: userData.name,
      previousData: userData,
      req,
    })

    res.json({ message: "Admin user removed successfully" })
  })
)

// @desc    Get admin user by ID
// @route   GET /api/super-admin/admins/:id
// @access  Private/SuperAdmin
router.get(
  "/admins/:id",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("createdBy", "name email")

    if (!user) {
      res.status(404)
      throw new Error("User not found")
    }

    res.json(user)
  })
)

// @desc    Update admin permissions
// @route   PUT /api/super-admin/admins/:id/permissions
// @access  Private/SuperAdmin
router.put(
  "/admins/:id/permissions",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)

    if (!user) {
      res.status(404)
      throw new Error("User not found")
    }

    if (!user.isAdmin && !user.isSuperAdmin) {
      res.status(400)
      throw new Error("User is not an admin")
    }

    const previousPermissions = { ...user.adminPermissions }
    
    user.adminPermissions = req.body.permissions

    const updatedUser = await user.save()

    // Log activity
    await logActivity({
      user: req.user,
      action: "PERMISSION_CHANGE",
      module: "PERMISSIONS",
      description: `Updated permissions for admin: ${updatedUser.email}`,
      targetId: updatedUser._id.toString(),
      targetName: updatedUser.name,
      previousData: previousPermissions,
      newData: req.body.permissions,
      req,
    })

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      adminPermissions: updatedUser.adminPermissions,
    })
  })
)

// ============ ACTIVITY LOG ROUTES ============

// @desc    Get all activity logs
// @route   GET /api/super-admin/activity-logs
// @access  Private/SuperAdmin or Admin with activityLogs permission
router.get(
  "/activity-logs",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    // Check permission
    if (!req.user.isSuperAdmin && !req.user.adminPermissions?.activityLogs && !req.user.adminPermissions?.fullAccess) {
      res.status(403)
      throw new Error("Access denied - You don't have permission to view activity logs")
    }

    const {
      page = 1,
      limit = 50,
      userId,
      module,
      action,
      startDate,
      endDate,
      search,
    } = req.query

    const query = {}

    if (userId) {
      query.user = userId
    }

    if (module) {
      query.module = module
    }

    if (action) {
      query.action = action
    }

    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) {
        query.createdAt.$gte = new Date(startDate)
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate)
      }
    }

    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { targetName: { $regex: search, $options: "i" } },
      ]
    }

    const logs = await ActivityLog.find(query)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await ActivityLog.countDocuments(query)

    res.json({
      logs,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    })
  })
)

// @desc    Get activity logs for specific user
// @route   GET /api/super-admin/activity-logs/user/:userId
// @access  Private/SuperAdmin
router.get(
  "/activity-logs/user/:userId",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 50 } = req.query

    const logs = await ActivityLog.find({ user: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await ActivityLog.countDocuments({ user: req.params.userId })

    res.json({
      logs,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    })
  })
)

// @desc    Get activity log summary (total, today, week, month)
// @route   GET /api/super-admin/activity-logs/summary
// @access  Private/SuperAdmin
router.get(
  "/activity-logs/summary",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const now = new Date()
    
    // Start of today
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    // Start of this week (Sunday)
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    
    // Start of this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [totalLogs, todayLogs, weekLogs, monthLogs] = await Promise.all([
      ActivityLog.countDocuments({}),
      ActivityLog.countDocuments({ createdAt: { $gte: todayStart } }),
      ActivityLog.countDocuments({ createdAt: { $gte: weekStart } }),
      ActivityLog.countDocuments({ createdAt: { $gte: monthStart } }),
    ])

    res.json({
      totalLogs,
      todayLogs,
      weekLogs,
      monthLogs,
    })
  })
)

// @desc    Get activity log stats
// @route   GET /api/super-admin/activity-logs/stats
// @access  Private/SuperAdmin
router.get(
  "/activity-logs/stats",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { days = 7 } = req.query
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get activity by module
    const byModule = await ActivityLog.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: "$module", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])

    // Get activity by action
    const byAction = await ActivityLog.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: "$action", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])

    // Get activity by user
    const byUser = await ActivityLog.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: "$user",
          userName: { $first: "$userName" },
          userEmail: { $first: "$userEmail" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ])

    // Get activity by day
    const byDay = await ActivityLog.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])

    // Total count
    const totalCount = await ActivityLog.countDocuments({ createdAt: { $gte: startDate } })

    res.json({
      totalCount,
      byModule,
      byAction,
      byUser,
      byDay,
      period: `Last ${days} days`,
    })
  })
)

// @desc    Delete old activity logs
// @route   DELETE /api/super-admin/activity-logs/cleanup
// @access  Private/SuperAdmin
router.delete(
  "/activity-logs/cleanup",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const { days = 90 } = req.query
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const result = await ActivityLog.deleteMany({ createdAt: { $lt: cutoffDate } })

    // Log the cleanup action
    await logActivity({
      user: req.user,
      action: "DELETE",
      module: "ADMIN_MANAGEMENT",
      description: `Cleaned up ${result.deletedCount} activity logs older than ${days} days`,
      req,
    })

    res.json({
      message: `Deleted ${result.deletedCount} activity logs older than ${days} days`,
      deletedCount: result.deletedCount,
    })
  })
)

// @desc    Get available permissions list
// @route   GET /api/super-admin/permissions
// @access  Private/SuperAdmin
router.get(
  "/permissions",
  protect,
  superAdmin,
  asyncHandler(async (req, res) => {
    const permissions = [
      { key: "fullAccess", label: "Full Access", description: "Complete access to all admin features" },
      { key: "dashboard", label: "Dashboard", description: "View admin dashboard" },
      { key: "products", label: "Products", description: "Manage products" },
      { key: "categories", label: "Categories", description: "Manage categories" },
      { key: "subcategories", label: "Sub Categories", description: "Manage sub categories" },
      { key: "brands", label: "Brands", description: "Manage brands" },
      { key: "orders", label: "Orders", description: "Manage orders" },
      { key: "users", label: "Users", description: "View and manage regular users" },
      { key: "reviews", label: "Reviews", description: "Manage product reviews" },
      { key: "blogs", label: "Blogs", description: "Manage blog posts" },
      { key: "banners", label: "Banners", description: "Manage banners" },
      { key: "homeSections", label: "Home Sections", description: "Manage home page sections" },
      { key: "offerPages", label: "Offer Pages", description: "Manage offer pages" },
      { key: "gamingZone", label: "Gaming Zone", description: "Manage gaming zone" },
      { key: "coupons", label: "Coupons", description: "Manage discount coupons" },
      { key: "deliveryCharges", label: "Delivery Charges", description: "Manage delivery charges" },
      { key: "settings", label: "Settings", description: "Manage site settings" },
      { key: "emailTemplates", label: "Email Templates", description: "Manage email templates" },
      { key: "newsletter", label: "Newsletter", description: "Manage newsletter subscribers" },
      { key: "requestCallbacks", label: "Request Callbacks", description: "View callback requests" },
      { key: "bulkPurchase", label: "Bulk Purchase", description: "Manage bulk purchase requests" },
      { key: "buyerProtection", label: "Buyer Protection", description: "Manage buyer protection" },
      { key: "stockAdjustment", label: "Stock Adjustment", description: "Manage stock and price adjustments" },
      { key: "seoSettings", label: "SEO Settings", description: "Manage SEO and redirects" },
      { key: "cache", label: "Cache", description: "Reset and manage cache" },
      { key: "volumes", label: "Volumes", description: "Manage product volumes" },
      { key: "warranty", label: "Warranty", description: "Manage warranty options" },
      { key: "colors", label: "Colors", description: "Manage product colors" },
      { key: "units", label: "Units", description: "Manage product units" },
      { key: "tax", label: "Tax", description: "Manage tax settings" },
      { key: "sizes", label: "Sizes", description: "Manage product sizes" },
      { key: "adminManagement", label: "Admin Management", description: "Manage other admin users (requires Super Admin)" },
      { key: "activityLogs", label: "Activity Logs", description: "View activity logs" },
    ]

    res.json(permissions)
  })
)

// @desc    Get current admin's permissions
// @route   GET /api/super-admin/my-permissions
// @access  Private/Admin
router.get(
  "/my-permissions",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    res.json({
      isSuperAdmin: req.user.isSuperAdmin,
      isAdmin: req.user.isAdmin,
      permissions: req.user.adminPermissions || {},
    })
  })
)

export default router
