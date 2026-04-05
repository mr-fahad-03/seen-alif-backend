import express from "express"
import asyncHandler from "express-async-handler"
import Settings from "../models/settingsModel.js"
import User from "../models/userModel.js"
import bcrypt from "bcryptjs"
import { protect, admin } from "../middleware/authMiddleware.js"
import { logActivity } from "../middleware/permissionMiddleware.js"
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js"

const router = express.Router()

// @desc    Get settings
// @route   GET /api/settings
// @access  Public
router.get(
  "/",
  cacheMiddleware('settings'),
  asyncHandler(async (req, res) => {
    let settings = await Settings.findOne({})

    if (!settings) {
      // Create default settings if none exist
      settings = new Settings({})
      await settings.save()
    }

    res.json(settings)
  }),
)

// @desc    Update settings
// @route   PUT /api/settings
// @access  Private/Admin
router.put(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    let settings = await Settings.findOne({})

    if (!settings) {
      settings = new Settings({})
    }

    // Update settings fields
    Object.keys(req.body).forEach((key) => {
      if (key !== "updatedBy") {
        settings[key] = req.body[key]
      }
    })

    settings.updatedBy = req.user._id
    const updatedSettings = await settings.save()

    // Log activity
    await logActivity(req, "UPDATE", "SETTINGS", `Updated site settings`, updatedSettings._id, "Site Settings")

    // Invalidate settings cache
    await invalidateCache('settings')

    res.json(updatedSettings)
  }),
)

// @desc    Change admin password
// @route   PUT /api/settings/password
// @access  Private/Admin
router.put(
  "/password",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body

    const user = await User.findById(req.user._id)

    if (user && (await user.matchPassword(currentPassword))) {
      // Hash new password
      const salt = await bcrypt.genSalt(10)
      user.password = await bcrypt.hash(newPassword, salt)

      await user.save()

      // Log activity
      await logActivity(req, "UPDATE", "SETTINGS", `Changed admin password`, user._id, user.name)

      res.json({ message: "Password updated successfully" })
    } else {
      res.status(400)
      throw new Error("Current password is incorrect")
    }
  }),
)

export default router
