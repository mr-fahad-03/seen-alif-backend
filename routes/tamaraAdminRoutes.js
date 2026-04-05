import express from "express"
import { protect, admin } from "../middleware/authMiddleware.js"
import TamaraService from "../services/tamaraService.js"
import Order from "../models/orderModel.js"

const router = express.Router()

/**
 * Get Tamara orders with pagination and filtering
 */
router.get("/orders", protect, admin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, startDate, endDate, search } = req.query

    const query = {
      paymentMethod: "tamara",
      "paymentResult.tamara_order_id": { $exists: true },
    }

    // Filter by payment status
    if (status) {
      query["paymentResult.status"] = status
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    // Search by order ID or customer email
    if (search) {
      query.$or = [
        { _id: { $regex: search, $options: "i" } },
        { "shippingAddress.email": { $regex: search, $options: "i" } },
        { "paymentResult.tamara_order_id": { $regex: search, $options: "i" } },
      ]
    }

    const orders = await Order.find(query)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Order.countDocuments(query)

    res.json({
      success: true,
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    })
  } catch (error) {
    console.error("Error fetching Tamara orders:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch Tamara orders",
      error: error.message,
    })
  }
})

/**
 * Get specific Tamara order details
 */
router.get("/orders/:orderId", protect, admin, async (req, res) => {
  try {
    const { orderId } = req.params

    const order = await Order.findById(orderId).populate("user", "name email")
    if (!order || order.paymentMethod !== "tamara") {
      return res.status(404).json({
        success: false,
        message: "Tamara order not found",
      })
    }

    // Get latest status from Tamara
    let tamaraStatus = null
    if (order.paymentResult?.tamara_order_id) {
      const statusResult = await TamaraService.getOrderStatus(order.paymentResult.tamara_order_id)
      if (statusResult.success) {
        tamaraStatus = statusResult.data
      }
    }

    res.json({
      success: true,
      order,
      tamaraStatus,
    })
  } catch (error) {
    console.error("Error fetching Tamara order:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch Tamara order",
      error: error.message,
    })
  }
})

/**
 * Sync order status with Tamara
 */
router.post("/orders/:orderId/sync", protect, admin, async (req, res) => {
  try {
    const { orderId } = req.params

    const result = await TamaraService.syncOrderStatus(orderId)

    if (result.success) {
      res.json({
        success: true,
        message: "Order synced successfully",
        order: result.order,
        tamaraStatus: result.tamaraStatus,
      })
    } else {
      res.status(400).json({
        success: false,
        message: result.error,
      })
    }
  } catch (error) {
    console.error("Error syncing Tamara order:", error)
    res.status(500).json({
      success: false,
      message: "Failed to sync order",
      error: error.message,
    })
  }
})

/**
 * Capture Tamara payment
 */
router.post("/orders/:orderId/capture", protect, admin, async (req, res) => {
  try {
    const { orderId } = req.params
    const { total_amount, shipping_info } = req.body

    const order = await Order.findById(orderId)
    if (!order || !order.paymentResult?.tamara_order_id) {
      return res.status(404).json({
        success: false,
        message: "Tamara order not found",
      })
    }

    const captureData = {
      total_amount: {
        amount: Number.parseFloat(total_amount?.amount || order.totalPrice),
        currency: total_amount?.currency || "AED",
      },
      shipping_info: shipping_info || {
        shipped_at: new Date().toISOString(),
        shipping_company: "Default Shipping",
      },
    }

    const result = await TamaraService.capturePayment(order.paymentResult.tamara_order_id, captureData)

    if (result.success) {
      // Update local order
      order.paymentResult = {
        ...order.paymentResult,
        status: "captured",
        capture_id: result.data.capture_id,
        update_time: new Date().toISOString(),
      }
      order.orderStatus = "processing"
      await order.save()

      res.json({
        success: true,
        message: "Payment captured successfully",
        order,
        captureData: result.data,
      })
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to capture payment",
        error: result.error,
      })
    }
  } catch (error) {
    console.error("Error capturing Tamara payment:", error)
    res.status(500).json({
      success: false,
      message: "Failed to capture payment",
      error: error.message,
    })
  }
})

/**
 * Refund Tamara payment
 */
router.post("/orders/:orderId/refund", protect, admin, async (req, res) => {
  try {
    const { orderId } = req.params
    const { total_amount, comment } = req.body

    const order = await Order.findById(orderId)
    if (!order || !order.paymentResult?.tamara_order_id) {
      return res.status(404).json({
        success: false,
        message: "Tamara order not found",
      })
    }

    const refundData = {
      total_amount: {
        amount: Number.parseFloat(total_amount?.amount || order.totalPrice),
        currency: total_amount?.currency || "AED",
      },
      comment: comment || "Refund requested by admin",
    }

    const result = await TamaraService.refundPayment(order.paymentResult.tamara_order_id, refundData)

    if (result.success) {
      // Update local order
      order.paymentResult = {
        ...order.paymentResult,
        status: "refunded",
        refund_id: result.data.refund_id,
        update_time: new Date().toISOString(),
      }
      order.orderStatus = "refunded"
      order.isPaid = false
      await order.save()

      res.json({
        success: true,
        message: "Payment refunded successfully",
        order,
        refundData: result.data,
      })
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to refund payment",
        error: result.error,
      })
    }
  } catch (error) {
    console.error("Error refunding Tamara payment:", error)
    res.status(500).json({
      success: false,
      message: "Failed to refund payment",
      error: error.message,
    })
  }
})

/**
 * Get Tamara payment statistics
 */
router.get("/stats", protect, admin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const dateFilter = {}
    if (startDate || endDate) {
      dateFilter.createdAt = {}
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate)
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate)
    }

    const baseQuery = {
      paymentMethod: "tamara",
      "paymentResult.tamara_order_id": { $exists: true },
      ...dateFilter,
    }

    const [
      totalOrders,
      approvedOrders,
      declinedOrders,
      expiredOrders,
      capturedOrders,
      refundedOrders,
      totalAmount,
      approvedAmount,
    ] = await Promise.all([
      Order.countDocuments(baseQuery),
      Order.countDocuments({ ...baseQuery, "paymentResult.status": "approved" }),
      Order.countDocuments({ ...baseQuery, "paymentResult.status": "declined" }),
      Order.countDocuments({ ...baseQuery, "paymentResult.status": "expired" }),
      Order.countDocuments({ ...baseQuery, "paymentResult.status": "fully_captured" }),
      Order.countDocuments({ ...baseQuery, "paymentResult.status": "refunded" }),
      Order.aggregate([{ $match: baseQuery }, { $group: { _id: null, total: { $sum: "$totalPrice" } } }]),
      Order.aggregate([
        { $match: { ...baseQuery, isPaid: true } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),
    ])

    res.json({
      success: true,
      stats: {
        totalOrders,
        approvedOrders,
        declinedOrders,
        expiredOrders,
        capturedOrders,
        refundedOrders,
        totalAmount: totalAmount[0]?.total || 0,
        approvedAmount: approvedAmount[0]?.total || 0,
        approvalRate: totalOrders > 0 ? ((approvedOrders / totalOrders) * 100).toFixed(2) : 0,
        declineRate: totalOrders > 0 ? ((declinedOrders / totalOrders) * 100).toFixed(2) : 0,
      },
    })
  } catch (error) {
    console.error("Error fetching Tamara stats:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    })
  }
})

export default router
