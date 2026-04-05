import express from "express"
import asyncHandler from "express-async-handler"
import Banner from "../models/bannerModel.js"
import Category from "../models/categoryModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { logActivity } from "../middleware/permissionMiddleware.js"
import { uploadBanner, deleteLocalFile, isCloudinaryUrl } from "../config/multer.js"
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js"

const router = express.Router()

const debugBanners = (...args) => {
  if (process.env.DEBUG_BANNERS === "true") {
    console.log("[DEBUG_BANNERS]", ...args)
  }
}

// @desc    Get all banners (public)
// @route   GET /api/banners
// @access  Public
router.get(
  "/",
  asyncHandler(async (req, res) => {
    // Banners need to reflect admin edits immediately.
    // Avoid server/proxy caching here (especially important on serverless environments).
    res.set('Cache-Control', 'no-store, max-age=0, must-revalidate')

    const { position, category, active } = req.query

    const query = {}

    if (position) {
      query.position = position
    }

    if (category) {
      query.category = category
    }

    if (active !== undefined) {
      query.isActive = active === "true"
    }

    const banners = await Banner.find(query).populate("category", "name slug").sort({ sortOrder: 1, createdAt: -1 })

    res.json(banners)
  }),
)

// @desc    Get all banners (admin)
// @route   GET /api/banners/admin
// @access  Private/Admin
router.get(
  "/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const banners = await Banner.find({})
      .populate("category", "name slug")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })

    res.json(banners)
  }),
)

// @desc    Get single banner
// @route   GET /api/banners/:id
// @access  Public
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const banner = await Banner.findById(req.params.id)
      .populate("category", "name slug")
      .populate("createdBy", "name email")

    if (banner) {
      res.json(banner)
    } else {
      res.status(404)
      throw new Error("Banner not found")
    }
  }),
)

// @desc    Create banner
// @route   POST /api/banners
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  uploadBanner.single("image"),
  asyncHandler(async (req, res) => {
    const { category, ...bannerData } = req.body

    debugBanners("POST /api/banners payload", {
      position: bannerData.position,
      section: bannerData.section,
      deviceType: bannerData.deviceType,
      buttonLink: bannerData.buttonLink,
      link: bannerData.link,
      title: bannerData.title,
    })

    // Verify category exists if provided and position is category
    if (bannerData.position === "category" && category) {
      const categoryExists = await Category.findById(category)
      if (!categoryExists) {
        res.status(400)
        throw new Error("Invalid category")
      }
    }

    const banner = new Banner({
      ...bannerData,
      category: bannerData.position === "category" ? category : null,
      createdBy: req.user._id,
    })

    // Hero banners should always use buttonLink as the banner link
    // (no separate direct link field for hero position)
    if ((banner.position || "hero") === "hero") {
      banner.link = banner.buttonLink
      debugBanners("Hero create: mirrored link from buttonLink", {
        bannerId: banner._id?.toString?.(),
        buttonLink: banner.buttonLink,
        link: banner.link,
      })
    }

    const createdBanner = await banner.save()
    debugBanners("POST /api/banners saved", {
      id: createdBanner._id?.toString?.(),
      position: createdBanner.position,
      section: createdBanner.section,
      deviceType: createdBanner.deviceType,
      buttonLink: createdBanner.buttonLink,
      link: createdBanner.link,
    })
    const populatedBanner = await Banner.findById(createdBanner._id)
      .populate("category", "name slug")
      .populate("createdBy", "name email")

    // Log activity
    if (req.user) {
      await logActivity({
        user: req.user,
        action: "CREATE",
        module: "BANNERS",
        description: `Created banner: ${createdBanner.title || 'Untitled'} (${createdBanner.position})`,
        targetId: createdBanner._id.toString(),
        targetName: createdBanner.title || createdBanner.position,
        newData: { title: createdBanner.title, position: createdBanner.position },
        req,
      })
    }

    // Invalidate banner cache
    await invalidateCache(['banners', 'homeSections'])

    res.status(201).json(populatedBanner)
  }),
)

// @desc    Update banner
// @route   PUT /api/banners/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const banner = await Banner.findById(req.params.id)

    if (banner) {
      const { category, ...updateData } = req.body

      debugBanners("PUT /api/banners/:id payload", {
        id: req.params.id,
        position: updateData.position,
        section: updateData.section,
        deviceType: updateData.deviceType,
        buttonLink: updateData.buttonLink,
        link: updateData.link,
        title: updateData.title,
      })

      // Hero banners should always use buttonLink as the banner link
      const finalPosition = updateData.position ?? banner.position

      // Verify category exists if provided and position is category
      if (updateData.position === "category" && category) {
        const categoryExists = await Category.findById(category)
        if (!categoryExists) {
          res.status(400)
          throw new Error("Invalid category")
        }
      }

      // Update banner fields
      Object.keys(updateData).forEach((key) => {
        banner[key] = updateData[key]
      })

      if (finalPosition === "hero") {
        // Mirror current buttonLink into link after applying updates
        banner.link = banner.buttonLink
        debugBanners("Hero update: mirrored link from buttonLink", {
          id: req.params.id,
          buttonLink: banner.buttonLink,
          link: banner.link,
        })
      }

      banner.category = updateData.position === "category" ? category : null

      const updatedBanner = await banner.save()
      debugBanners("PUT /api/banners/:id saved", {
        id: updatedBanner._id?.toString?.(),
        position: updatedBanner.position,
        section: updatedBanner.section,
        deviceType: updatedBanner.deviceType,
        buttonLink: updatedBanner.buttonLink,
        link: updatedBanner.link,
      })
      const populatedBanner = await Banner.findById(updatedBanner._id)
        .populate("category", "name slug")
        .populate("createdBy", "name email")

      // Log activity
      if (req.user) {
        await logActivity({
          user: req.user,
          action: "UPDATE",
          module: "BANNERS",
          description: `Updated banner: ${updatedBanner.title || 'Untitled'}`,
          targetId: updatedBanner._id.toString(),
          targetName: updatedBanner.title || updatedBanner.position,
          req,
        })
      }

      // Invalidate banner cache
      await invalidateCache(['banners', 'homeSections'])

      res.json(populatedBanner)
    } else {
      res.status(404)
      throw new Error("Banner not found")
    }
  }),
)

// @desc    Delete banner
// @route   DELETE /api/banners/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const banner = await Banner.findById(req.params.id)

    if (banner) {
      // Delete banner image from server
      if (banner.image && !isCloudinaryUrl(banner.image)) {
        try {
          await deleteLocalFile(banner.image)
        } catch (err) {
          console.error("Error deleting banner image:", err)
        }
      }

      const bannerTitle = banner.title || banner.position
      await banner.deleteOne()

      // Log activity
      if (req.user) {
        await logActivity({
          user: req.user,
          action: "DELETE",
          module: "BANNERS",
          description: `Deleted banner: ${bannerTitle}`,
          targetId: req.params.id,
          targetName: bannerTitle,
          req,
        })
      }

      // Invalidate banner cache
      await invalidateCache(['banners', 'homeSections'])

      res.json({ message: "Banner removed" })
    } else {
      res.status(404)
      throw new Error("Banner not found")
    }
  }),
)

export default router
