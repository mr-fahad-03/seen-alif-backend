import express from "express"
import asyncHandler from "express-async-handler"
import Volume from "../models/volumeModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"

const router = express.Router()

// @desc    Fetch all volumes (Admin only - includes inactive)
// @route   GET /api/volumes/admin
// @access  Private/Admin
router.get(
  "/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const volumes = await Volume.find({ isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 })
    res.json(volumes)
  }),
)

// @desc    Fetch all volumes
// @route   GET /api/volumes
// @access  Public
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const volumes = await Volume.find({ isActive: true, isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 })
    res.json(volumes)
  }),
)

// @desc    Create a volume
// @route   POST /api/volumes
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, value, unit } = req.body

    const volume = new Volume({
      name,
      value,
      unit,
      createdBy: req.user._id,
    })

    const createdVolume = await volume.save()
    res.status(201).json(createdVolume)
  }),
)

// @desc    Update a volume
// @route   PUT /api/volumes/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const volume = await Volume.findById(req.params.id)

    if (volume) {
      const { name, value, unit, isActive } = req.body

      volume.name = name || volume.name
      volume.value = value || volume.value
      volume.unit = unit || volume.unit
      volume.isActive = isActive !== undefined ? isActive : volume.isActive

      const updatedVolume = await volume.save()
      res.json(updatedVolume)
    } else {
      res.status(404)
      throw new Error("Volume not found")
    }
  }),
)

// @desc    Delete a volume
// @route   DELETE /api/volumes/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const volume = await Volume.findById(req.params.id)

    if (volume) {
      await volume.deleteOne()
      res.json({ message: "Volume removed" })
    } else {
      res.status(404)
      throw new Error("Volume not found")
    }
  }),
)

export default router
