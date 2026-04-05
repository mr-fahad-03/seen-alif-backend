import express from "express"
import asyncHandler from "express-async-handler"
import Redirect from "../models/redirectModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"

const router = express.Router()

// @desc    Check if redirect exists for a path (Public)
// @route   GET /api/redirects/check
// @access  Public
router.get(
  "/check",
  asyncHandler(async (req, res) => {
    let { path } = req.query

    if (!path) {
      res.status(400)
      throw new Error("Path parameter is required")
    }

    // Decode and normalize the path
    try {
      path = decodeURIComponent(path)
    } catch (_) {
      // ignore decode errors, use raw
    }
    // Ensure leading slash for consistency
    if (!path.startsWith("/")) path = "/" + path
    // Remove trailing slash except for root
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)

    // Find active redirect for this path
    const redirect = await Redirect.findOne({
      redirectFrom: path.toLowerCase(),
      status: "Active",
    })

    if (redirect) {
      return res.json({
        found: true,
        redirectFrom: path,
        redirectTo: redirect.redirectTo,
        redirectType: redirect.redirectType,
      })
    }

    // Graceful 200 response when no redirect exists (avoid frontend 404 error spam)
    return res.json({
      found: false,
      redirectFrom: path,
      redirectTo: null,
      redirectType: null,
    })
  }),
)

// @desc    Get all redirects (Admin only)
// @route   GET /api/redirects
// @access  Private/Admin
router.get(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { status, search, sort } = req.query
    const filter = {}

    if (status) {
      filter.status = status
    }

    if (search) {
      filter.$or = [
        { redirectFrom: { $regex: search, $options: "i" } },
        { redirectTo: { $regex: search, $options: "i" } },
      ]
    }

    let sortBy = { createdAt: -1 }
    if (sort) {
      if (sort === "from") sortBy = { redirectFrom: 1 }
      if (sort === "to") sortBy = { redirectTo: 1 }
      if (sort === "newest") sortBy = { createdAt: -1 }
      if (sort === "oldest") sortBy = { createdAt: 1 }
    }

    const redirects = await Redirect.find(filter)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort(sortBy)

    res.json(redirects)
  }),
)

// @desc    Get single redirect
// @route   GET /api/redirects/:id
// @access  Private/Admin
router.get(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const redirect = await Redirect.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")

    if (redirect) {
      res.json(redirect)
    } else {
      res.status(404)
      throw new Error("Redirect not found")
    }
  }),
)

// @desc    Create new redirect
// @route   POST /api/redirects
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { redirectFrom, redirectTo, redirectType, status, description } = req.body

    if (!redirectFrom || !redirectTo) {
      res.status(400)
      throw new Error("Redirect From and Redirect To URLs are required")
    }

    // Validate URL format
    if (!redirectFrom.startsWith("/")) {
      res.status(400)
      throw new Error("Redirect From must start with /")
    }

    // Check if redirect already exists
    const existingRedirect = await Redirect.findOne({
      redirectFrom: redirectFrom.toLowerCase(),
    })

    if (existingRedirect) {
      res.status(400)
      throw new Error("A redirect with this 'From' URL already exists")
    }

    const redirect = new Redirect({
      redirectFrom: redirectFrom.toLowerCase(),
      redirectTo: redirectTo.toLowerCase(),
      redirectType: redirectType || "301",
      status: status || "Active",
      description: description || "",
      createdBy: req.user._id,
      updatedBy: req.user._id,
    })

    const createdRedirect = await redirect.save()
    await createdRedirect.populate("createdBy", "name email")
    await createdRedirect.populate("updatedBy", "name email")

    res.status(201).json(createdRedirect)
  }),
)

// @desc    Update redirect
// @route   PUT /api/redirects/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { redirectFrom, redirectTo, redirectType, status, description } = req.body

    const redirect = await Redirect.findById(req.params.id)

    if (!redirect) {
      res.status(404)
      throw new Error("Redirect not found")
    }

    // Check if new 'from' URL is unique (excluding current redirect)
    if (redirectFrom && redirectFrom.toLowerCase() !== redirect.redirectFrom) {
      const existingRedirect = await Redirect.findOne({
        redirectFrom: redirectFrom.toLowerCase(),
        _id: { $ne: req.params.id },
      })

      if (existingRedirect) {
        res.status(400)
        throw new Error("A redirect with this 'From' URL already exists")
      }

      if (!redirectFrom.startsWith("/")) {
        res.status(400)
        throw new Error("Redirect From must start with /")
      }
    }

    redirect.redirectFrom = redirectFrom?.toLowerCase() || redirect.redirectFrom
    redirect.redirectTo = redirectTo?.toLowerCase() || redirect.redirectTo
    redirect.redirectType = redirectType || redirect.redirectType
    redirect.status = status || redirect.status
    redirect.description = description !== undefined ? description : redirect.description
    redirect.updatedBy = req.user._id

    const updatedRedirect = await redirect.save()
    await updatedRedirect.populate("createdBy", "name email")
    await updatedRedirect.populate("updatedBy", "name email")

    res.json(updatedRedirect)
  }),
)

// @desc    Delete redirect
// @route   DELETE /api/redirects/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const redirect = await Redirect.findById(req.params.id)

    if (redirect) {
      await Redirect.findByIdAndDelete(req.params.id)
      res.json({ message: "Redirect removed" })
    } else {
      res.status(404)
      throw new Error("Redirect not found")
    }
  }),
)

export default router
