import express from "express"
import asyncHandler from "express-async-handler"
import DeliveryCharge from "../models/deliveryChargeModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"

const router = express.Router()

// @desc    Get all delivery charges
// @route   GET /api/delivery-charges
// @access  Public
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const deliveryCharges = await DeliveryCharge.find({ isActive: true }).sort({ createdAt: -1 })
    res.json(deliveryCharges)
  }),
)

// @desc    Get all delivery charges (Admin)
// @route   GET /api/delivery-charges/admin
// @access  Private/Admin
router.get(
  "/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const deliveryCharges = await DeliveryCharge.find({}).populate("createdBy", "name email").sort({ createdAt: -1 })
    res.json(deliveryCharges)
  }),
)

// @desc    Get single delivery charge
// @route   GET /api/delivery-charges/:id
// @access  Public
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const deliveryCharge = await DeliveryCharge.findById(req.params.id)

    if (deliveryCharge) {
      res.json(deliveryCharge)
    } else {
      res.status(404)
      throw new Error("Delivery charge not found")
    }
  }),
)

// @desc    Create delivery charge
// @route   POST /api/delivery-charges
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, description, charge, minOrderAmount, maxOrderAmount, applicableAreas, deliveryTime } = req.body

    const deliveryChargeData = {
      name,
      description,
      charge: Number(charge),
      minOrderAmount: Number(minOrderAmount) || 0,
      maxOrderAmount: maxOrderAmount ? Number(maxOrderAmount) : null,
      applicableAreas: applicableAreas || [],
      deliveryTime: deliveryTime || "1-2 business days",
      createdBy: req.user._id,
    }

    const deliveryChargeExists = await DeliveryCharge.findOne({ name: { $regex: new RegExp(`^${name}$`, "i") } })

    if (deliveryChargeExists) {
      res.status(400)
      throw new Error("Delivery charge with this name already exists")
    }

    const deliveryCharge = await DeliveryCharge.create(deliveryChargeData)
    res.status(201).json(deliveryCharge)
  }),
)

// @desc    Update delivery charge
// @route   PUT /api/delivery-charges/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, description, charge, minOrderAmount, maxOrderAmount, applicableAreas, deliveryTime, isActive } =
      req.body

    const deliveryCharge = await DeliveryCharge.findById(req.params.id)

    if (deliveryCharge) {
      // Check if name already exists (excluding current record)
      if (name && name !== deliveryCharge.name) {
        const nameExists = await DeliveryCharge.findOne({
          name: { $regex: new RegExp(`^${name}$`, "i") },
          _id: { $ne: req.params.id },
        })

        if (nameExists) {
          res.status(400)
          throw new Error("Delivery charge with this name already exists")
        }
      }

      deliveryCharge.name = name || deliveryCharge.name
      deliveryCharge.description = description || deliveryCharge.description
      deliveryCharge.charge = charge !== undefined ? Number(charge) : deliveryCharge.charge
      deliveryCharge.minOrderAmount =
        minOrderAmount !== undefined ? Number(minOrderAmount) : deliveryCharge.minOrderAmount
      deliveryCharge.maxOrderAmount =
        maxOrderAmount !== undefined ? (maxOrderAmount ? Number(maxOrderAmount) : null) : deliveryCharge.maxOrderAmount
      deliveryCharge.applicableAreas = applicableAreas || deliveryCharge.applicableAreas
      deliveryCharge.deliveryTime = deliveryTime || deliveryCharge.deliveryTime
      deliveryCharge.isActive = isActive !== undefined ? isActive : deliveryCharge.isActive

      const updatedDeliveryCharge = await deliveryCharge.save()
      res.json(updatedDeliveryCharge)
    } else {
      res.status(404)
      throw new Error("Delivery charge not found")
    }
  }),
)

// @desc    Delete delivery charge
// @route   DELETE /api/delivery-charges/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const deliveryCharge = await DeliveryCharge.findById(req.params.id)

    if (deliveryCharge) {
      await deliveryCharge.deleteOne()
      res.json({ message: "Delivery charge removed successfully" })
    } else {
      res.status(404)
      throw new Error("Delivery charge not found")
    }
  }),
)

// @desc    Toggle delivery charge status
// @route   PATCH /api/delivery-charges/:id/toggle
// @access  Private/Admin
router.patch(
  "/:id/toggle",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const deliveryCharge = await DeliveryCharge.findById(req.params.id)

    if (deliveryCharge) {
      deliveryCharge.isActive = !deliveryCharge.isActive
      const updatedDeliveryCharge = await deliveryCharge.save()
      res.json(updatedDeliveryCharge)
    } else {
      res.status(404)
      throw new Error("Delivery charge not found")
    }
  }),
)

export default router
