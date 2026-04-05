import express from "express"
import asyncHandler from "express-async-handler"
import Warranty from "../models/warrantyModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"

const router = express.Router()

// @desc    Fetch all warranties (Admin only - includes inactive)
// @route   GET /api/warranty/admin
// @access  Private/Admin
router.get(
  "/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const warranties = await Warranty.find({ isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 })
    res.json(warranties)
  }),
)

// @desc    Fetch all warranties
// @route   GET /api/warranty
// @access  Public
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const warranties = await Warranty.find({ isActive: true, isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 })
    res.json(warranties)
  }),
)

// @desc    Create a warranty
// @route   POST /api/warranty
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, duration, durationType, description } = req.body

    const warranty = new Warranty({
      name,
      duration,
      durationType,
      description,
      createdBy: req.user._id,
    })

    const createdWarranty = await warranty.save()
    res.status(201).json(createdWarranty)
  }),
)

// @desc    Update a warranty
// @route   PUT /api/warranty/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const warranty = await Warranty.findById(req.params.id)

    if (warranty) {
      const { name, duration, durationType, description, isActive } = req.body

      warranty.name = name || warranty.name
      warranty.duration = duration || warranty.duration
      warranty.durationType = durationType || warranty.durationType
      warranty.description = description || warranty.description
      warranty.isActive = isActive !== undefined ? isActive : warranty.isActive

      const updatedWarranty = await warranty.save()
      res.json(updatedWarranty)
    } else {
      res.status(404)
      throw new Error("Warranty not found")
    }
  }),
)

// @desc    Delete a warranty
// @route   DELETE /api/warranty/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const warranty = await Warranty.findById(req.params.id)

    if (warranty) {
      await warranty.deleteOne()
      res.json({ message: "Warranty removed" })
    } else {
      res.status(404)
      throw new Error("Warranty not found")
    }
  }),
)

export default router
