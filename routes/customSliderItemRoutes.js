import express from "express"
import CustomSliderItem from "../models/customSliderItemModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { translateEnToAr } from "../utils/translateWithFallback.js"

const router = express.Router()

const translateText = translateEnToAr

// @desc    Get all custom slider items
// @route   GET /api/custom-slider-items
// @access  Public
router.get("/", async (req, res) => {
  try {
    const items = await CustomSliderItem.find().sort({ order: 1, createdAt: -1 })
    res.json(items)
  } catch (error) {
    console.error("Error fetching custom slider items:", error)
    res.status(500).json({ message: "Error fetching custom slider items" })
  }
})

// @desc    Get active custom slider items (for frontend)
// @route   GET /api/custom-slider-items/active
// @access  Public
router.get("/active", async (req, res) => {
  try {
    const items = await CustomSliderItem.find({ isActive: true }).sort({ order: 1, createdAt: -1 })
    res.json(items)
  } catch (error) {
    console.error("Error fetching active custom slider items:", error)
    res.status(500).json({ message: "Error fetching custom slider items" })
  }
})

// @desc    Create custom slider item
// @route   POST /api/custom-slider-items
// @access  Private/Admin
router.post("/", protect, admin, async (req, res) => {
  try {
    const { name, image, redirectUrl, isActive, order } = req.body

    if (!name || !image || !redirectUrl) {
      return res.status(400).json({ message: "Name, image, and redirect URL are required" })
    }

    const item = await CustomSliderItem.create({
      name,
      nameAr: await translateText(name),
      image,
      redirectUrl,
      isActive: isActive !== undefined ? isActive : true,
      order: order || 0,
    })

    res.status(201).json(item)
  } catch (error) {
    console.error("Error creating custom slider item:", error)
    res.status(500).json({ message: "Error creating custom slider item" })
  }
})

// @desc    Update custom slider item
// @route   PUT /api/custom-slider-items/:id
// @access  Private/Admin
router.put("/:id", protect, admin, async (req, res) => {
  try {
    const item = await CustomSliderItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({ message: "Custom slider item not found" })
    }

    const { name, image, redirectUrl, isActive, order } = req.body

    if (name !== undefined) {
      item.name = name
      item.nameAr = await translateText(name)
    }
    if (image !== undefined) item.image = image
    if (redirectUrl !== undefined) item.redirectUrl = redirectUrl
    if (isActive !== undefined) item.isActive = isActive
    if (order !== undefined) item.order = order

    const updatedItem = await item.save()
    res.json(updatedItem)
  } catch (error) {
    console.error("Error updating custom slider item:", error)
    res.status(500).json({ message: "Error updating custom slider item" })
  }
})

// @desc    Delete custom slider item
// @route   DELETE /api/custom-slider-items/:id
// @access  Private/Admin
router.delete("/:id", protect, admin, async (req, res) => {
  try {
    const item = await CustomSliderItem.findById(req.params.id)

    if (!item) {
      return res.status(404).json({ message: "Custom slider item not found" })
    }

    await item.deleteOne()
    res.json({ message: "Custom slider item deleted successfully" })
  } catch (error) {
    console.error("Error deleting custom slider item:", error)
    res.status(500).json({ message: "Error deleting custom slider item" })
  }
})

export default router
