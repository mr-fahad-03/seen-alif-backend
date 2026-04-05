import express from "express"
import asyncHandler from "express-async-handler"
import Unit from "../models/unitModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"

const router = express.Router()

// @desc    Fetch all units (Admin only - includes inactive)
// @route   GET /api/units/admin
// @access  Private/Admin
router.get(
  "/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const units = await Unit.find({ isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 })
    res.json(units)
  }),
)

// @desc    Fetch all units
// @route   GET /api/units
// @access  Public
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const units = await Unit.find({ isActive: true, isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 })
    res.json(units)
  }),
)

// @desc    Create a unit
// @route   POST /api/units
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, symbol, type } = req.body

    const unit = new Unit({
      name,
      symbol,
      type,
      createdBy: req.user._id,
    })

    const createdUnit = await unit.save()
    res.status(201).json(createdUnit)
  }),
)

// @desc    Update a unit
// @route   PUT /api/units/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const unit = await Unit.findById(req.params.id)

    if (unit) {
      const { name, symbol, type, isActive } = req.body

      unit.name = name || unit.name
      unit.symbol = symbol || unit.symbol
      unit.type = type || unit.type
      unit.isActive = isActive !== undefined ? isActive : unit.isActive

      const updatedUnit = await unit.save()
      res.json(updatedUnit)
    } else {
      res.status(404)
      throw new Error("Unit not found")
    }
  }),
)

// @desc    Delete a unit
// @route   DELETE /api/units/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const unit = await Unit.findById(req.params.id)

    if (unit) {
      await unit.deleteOne()
      res.json({ message: "Unit removed" })
    } else {
      res.status(404)
      throw new Error("Unit not found")
    }
  }),
)

export default router
