// // import express from "express"
// // import axios from "axios"
// // import Order from "../models/orderModel.js"
// // import { protect } from "../middleware/authMiddleware.js"

// // const router = express.Router()

// // // Tamara Payment Routes
// // router.post("/tamara/checkout", protect, async (req, res) => {
// //   try {
// //     const tamaraConfig = {
// //       headers: {
// //         Authorization: `Bearer ${process.env.TAMARA_API_KEY}`,
// //         "Content-Type": "application/json",
// //       },
// //     }

// //     const tamaraResponse = await axios.post(`${process.env.TAMARA_API_URL}/checkout`, req.body, tamaraConfig)

// //     res.json(tamaraResponse.data)
// //   } catch (error) {
// //     console.error("Tamara payment error:", error.response?.data || error.message)
// //     res.status(500).json({
// //       message: "Tamara payment failed",
// //       error: error.response?.data || error.message,
// //     })
// //   }
// // })

// // router.post("/tamara/webhook", async (req, res) => {
// //   try {
// //     const { order_id, order_status, payment_status, order_reference_id } = req.body

// //     // Find and update order (support both old and new reference)
// //     let order = await Order.findOne({ "paymentResult.tamara_order_id": order_id })
// //     if (!order && order_reference_id) {
// //       order = await Order.findById(order_reference_id)
// //     }
// //     if (order) {
// //       order.paymentResult = {
// //         ...order.paymentResult,
// //         status: payment_status,
// //         update_time: new Date().toISOString(),
// //       }
// //       order.isPaid = payment_status === "approved"
// //       order.paidAt = payment_status === "approved" ? new Date() : null
// //       await order.save()
// //     }

// //     res.status(200).json({ received: true })
// //   } catch (error) {
// //     console.error("Tamara webhook error:", error)
// //     res.status(500).json({ error: "Webhook processing failed" })
// //   }
// // })

// // // Tabby Payment Routes
// // router.post("/tabby/sessions", protect, async (req, res) => {
// //   try {
// //     const tabbyConfig = {
// //       headers: {
// //         Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
// //         "Content-Type": "application/json",
// //       },
// //     }

// //     const tabbyResponse = await axios.post(`${process.env.TABBY_API_URL}/api/v2/checkout`, req.body, tabbyConfig)

// //     res.json(tabbyResponse.data)
// //   } catch (error) {
// //     console.error("Tabby payment error:", error.response?.data || error.message)
// //     res.status(500).json({
// //       message: "Tabby payment failed",
// //       error: error.response?.data || error.message,
// //     })
// //   }
// // })

// // router.post("/tabby/webhook", async (req, res) => {
// //   try {
// //     const { id, status, order } = req.body
// //     // Try to get reference_id from order or meta
// //     const referenceId = order?.reference_id || order?.meta?.order_id

// //     // Find and update order (support both old and new reference)
// //     let dbOrder = await Order.findOne({ "paymentResult.tabby_payment_id": id })
// //     if (!dbOrder && referenceId) {
// //       dbOrder = await Order.findById(referenceId)
// //     }
// //     if (dbOrder) {
// //       dbOrder.paymentResult = {
// //         ...dbOrder.paymentResult,
// //         status: status,
// //         update_time: new Date().toISOString(),
// //       }
// //       dbOrder.isPaid = status === "AUTHORIZED"
// //       dbOrder.paidAt = status === "AUTHORIZED" ? new Date() : null
// //       await dbOrder.save()
// //     }

// //     res.status(200).json({ received: true })
// //   } catch (error) {
// //     console.error("Tabby webhook error:", error)
// //     res.status(500).json({ error: "Webhook processing failed" })
// //   }
// // })

// // // N-Genius Payment Routes
// // // Keep the existing N-Genius webhook
// // router.post("/ngenius/webhook", async (req, res) => {
// //   try {
// //     const { orderReference, state, amount, orderId } = req.body

// //     // Find and update order (support both old and new reference)
// //     let order = await Order.findOne({ "paymentResult.ngenius_order_ref": orderReference })
// //     if (!order && orderId) {
// //       order = await Order.findById(orderId)
// //     }
// //     if (order) {
// //       order.paymentResult = {
// //         ...order.paymentResult,
// //         status: state,
// //         update_time: new Date().toISOString(),
// //       }
// //       order.isPaid = state === "PURCHASED"
// //       order.paidAt = state === "PURCHASED" ? new Date() : null
// //       await order.save()
// //     }

// //     res.status(200).json({ received: true })
// //   } catch (error) {
// //     console.error("N-Genius webhook error:", error)
// //     res.status(500).json({ error: "Webhook processing failed" })
// //   }
// // })

// // export default router























































































// import express from "express"
// import axios from "axios"
// import crypto from "crypto"
// import Order from "../models/orderModel.js"
// import { protect } from "../middleware/authMiddleware.js"

// const router = express.Router()

// // Tamara Payment Routes
// router.post("/tamara/checkout", protect, async (req, res) => {
//   try {
//     const {
//       total_amount,
//       shipping_amount,
//       tax_amount,
//       order_reference_id,
//       order_number,
//       consumer,
//       shipping_address,
//       items,
//       merchant_url,
//     } = req.body

//     // Validate required fields
//     if (!total_amount || !consumer || !items || !merchant_url) {
//       return res.status(400).json({
//         message: "Missing required fields for Tamara checkout",
//         required: ["total_amount", "consumer", "items", "merchant_url"],
//       })
//     }

//     const tamaraConfig = {
//       headers: {
//         Authorization: `Bearer ${process.env.TAMARA_API_KEY}`,
//         "Content-Type": "application/json",
//       },
//     }

//     // Enhanced payload with proper structure
//     const tamaraPayload = {
//       total_amount: {
//         amount: Number.parseFloat(total_amount.amount),
//         currency: total_amount.currency || "AED",
//       },
//       shipping_amount: {
//         amount: Number.parseFloat(shipping_amount?.amount || 0),
//         currency: shipping_amount?.currency || "AED",
//       },
//       tax_amount: {
//         amount: Number.parseFloat(tax_amount?.amount || 0),
//         currency: tax_amount?.currency || "AED",
//       },
//       order_reference_id: order_reference_id,
//       order_number: order_number || order_reference_id,
//       consumer: {
//         first_name: consumer.first_name,
//         last_name: consumer.last_name,
//         phone_number: consumer.phone_number,
//         email: consumer.email,
//         date_of_birth: consumer.date_of_birth || null,
//         national_id: consumer.national_id || null,
//       },
//       shipping_address: {
//         first_name: shipping_address?.first_name || consumer.first_name,
//         last_name: shipping_address?.last_name || consumer.last_name,
//         line1: shipping_address.line1,
//         line2: shipping_address?.line2 || null,
//         city: shipping_address.city,
//         region: shipping_address?.region || shipping_address.city,
//         postal_code: shipping_address?.postal_code || null,
//         country_code: shipping_address?.country_code || "AE",
//       },
//       billing_address: shipping_address, // Use same as shipping for simplicity
//       items: items.map((item) => ({
//         name: item.name,
//         type: item.type || "Physical",
//         reference_id: item.reference_id,
//         sku: item.sku || item.reference_id,
//         quantity: Number.parseInt(item.quantity),
//         unit_price: {
//           amount: Number.parseFloat(item.unit_price.amount),
//           currency: item.unit_price.currency || "AED",
//         },
//         total_amount: {
//           amount: Number.parseFloat(item.total_amount.amount),
//           currency: item.total_amount.currency || "AED",
//         },
//         discount_amount: {
//           amount: Number.parseFloat(item.discount_amount?.amount || 0),
//           currency: item.discount_amount?.currency || "AED",
//         },
//         tax_amount: {
//           amount: Number.parseFloat(item.tax_amount?.amount || 0),
//           currency: item.tax_amount?.currency || "AED",
//         },
//       })),
//       merchant_url: {
//         success: merchant_url.success,
//         failure: merchant_url.failure,
//         cancel: merchant_url.cancel,
//         notification: merchant_url.notification,
//       },
//       platform: "Web",
//       is_mobile: false,
//       locale: "en_US",
//     }

//     console.log("🔄 Creating Tamara checkout session:", {
//       order_reference_id,
//       total_amount: tamaraPayload.total_amount,
//       consumer_email: consumer.email,
//     })

//     const tamaraResponse = await axios.post(`${process.env.TAMARA_API_URL}/checkout`, tamaraPayload, tamaraConfig)

//     // Store Tamara order details in our database
//     if (order_reference_id) {
//       try {
//         const order = await Order.findById(order_reference_id)
//         if (order) {
//           order.paymentResult = {
//             ...order.paymentResult,
//             tamara_order_id: tamaraResponse.data.order_id,
//             tamara_checkout_id: tamaraResponse.data.checkout_id,
//             status: tamaraResponse.data.status || "new",
//             update_time: new Date().toISOString(),
//           }
//           await order.save()
//           console.log("✅ Updated order with Tamara details:", order_reference_id)
//         }
//       } catch (dbError) {
//         console.error("⚠️ Failed to update order with Tamara details:", dbError.message)
//       }
//     }

//     console.log("✅ Tamara checkout created successfully:", {
//       order_id: tamaraResponse.data.order_id,
//       checkout_id: tamaraResponse.data.checkout_id,
//       status: tamaraResponse.data.status,
//     })

//     res.json({
//       success: true,
//       ...tamaraResponse.data,
//     })
//   } catch (error) {
//     console.error("❌ Tamara payment error:", {
//       message: error.message,
//       response: error.response?.data,
//       status: error.response?.status,
//     })

//     res.status(error.response?.status || 500).json({
//       success: false,
//       message: "Tamara payment failed",
//       error: error.response?.data || error.message,
//     })
//   }
// })

// router.post("/tamara/webhook", async (req, res) => {
//   try {
//     const signature = req.headers["x-tamara-signature"]
//     const payload = JSON.stringify(req.body)

//     // Verify webhook signature if secret is configured
//     if (process.env.TAMARA_WEBHOOK_SECRET && signature) {
//       const expectedSignature = crypto
//         .createHmac("sha256", process.env.TAMARA_WEBHOOK_SECRET)
//         .update(payload)
//         .digest("hex")

//       if (signature !== expectedSignature) {
//         console.error("❌ Invalid Tamara webhook signature")
//         return res.status(401).json({ error: "Invalid signature" })
//       }
//     }

//     const { order_id, order_reference_id, order_number, event_type, data } = req.body

//     console.log("🔔 Tamara webhook received:", {
//       event_type,
//       order_id,
//       order_reference_id,
//       order_number,
//     })

//     // Find order by multiple possible identifiers
//     let order = null
//     if (order_reference_id) {
//       order = await Order.findById(order_reference_id)
//     }
//     if (!order && order_id) {
//       order = await Order.findOne({ "paymentResult.tamara_order_id": order_id })
//     }
//     if (!order && order_number) {
//       order = await Order.findOne({ orderNumber: order_number })
//     }

//     if (!order) {
//       console.error("❌ Order not found for Tamara webhook:", {
//         order_id,
//         order_reference_id,
//         order_number,
//       })
//       return res.status(404).json({ error: "Order not found" })
//     }

//     // Update order based on event type
//     const previousStatus = order.paymentResult?.status
//     let newStatus = event_type
//     let isPaid = false
//     let paidAt = null

//     switch (event_type) {
//       case "order_approved":
//         newStatus = "approved"
//         isPaid = true
//         paidAt = new Date()
//         console.log("✅ Tamara payment approved:", order_id)
//         break

//       case "order_declined":
//         newStatus = "declined"
//         isPaid = false
//         paidAt = null
//         console.log("❌ Tamara payment declined:", order_id)
//         break

//       case "order_expired":
//         newStatus = "expired"
//         isPaid = false
//         paidAt = null
//         console.log("⏰ Tamara payment expired:", order_id)
//         break

//       case "order_canceled":
//         newStatus = "canceled"
//         isPaid = false
//         paidAt = null
//         console.log("🚫 Tamara payment canceled:", order_id)
//         break

//       case "order_authorised":
//         newStatus = "authorised"
//         isPaid = true
//         paidAt = new Date()
//         console.log("🔐 Tamara payment authorised:", order_id)
//         break

//       case "order_captured":
//         newStatus = "fully_captured"
//         isPaid = true
//         paidAt = paidAt || new Date()
//         console.log("💰 Tamara payment captured:", order_id)
//         break

//       case "order_refunded":
//         newStatus = data?.refund_amount ? "partially_refunded" : "fully_refunded"
//         console.log("💸 Tamara payment refunded:", order_id)
//         break

//       default:
//         console.log("ℹ️ Unknown Tamara event type:", event_type)
//         newStatus = event_type
//     }

//     // Update order with new status
//     order.paymentResult = {
//       ...order.paymentResult,
//       status: newStatus,
//       event_type: event_type,
//       tamara_order_id: order_id,
//       update_time: new Date().toISOString(),
//       webhook_data: data,
//     }

//     order.isPaid = isPaid
//     if (paidAt) {
//       order.paidAt = paidAt
//     }

//     // Update order status based on payment status
//     if (isPaid && order.orderStatus === "pending") {
//       order.orderStatus = "confirmed"
//     } else if (newStatus === "declined" || newStatus === "expired" || newStatus === "canceled") {
//       order.orderStatus = "cancelled"
//     }

//     await order.save()

//     console.log("✅ Order updated successfully:", {
//       orderId: order._id,
//       previousStatus,
//       newStatus,
//       isPaid,
//       orderStatus: order.orderStatus,
//     })

//     res.status(200).json({
//       received: true,
//       order_id: order._id,
//       status: newStatus,
//     })
//   } catch (error) {
//     console.error("❌ Tamara webhook error:", error)
//     res.status(500).json({ error: "Webhook processing failed" })
//   }
// })

// router.get("/tamara/order/:orderId", protect, async (req, res) => {
//   try {
//     const { orderId } = req.params

//     const tamaraConfig = {
//       headers: {
//         Authorization: `Bearer ${process.env.TAMARA_API_KEY}`,
//         "Content-Type": "application/json",
//       },
//     }

//     const response = await axios.get(`${process.env.TAMARA_API_URL}/orders/${orderId}`, tamaraConfig)

//     res.json({
//       success: true,
//       order: response.data,
//     })
//   } catch (error) {
//     console.error("❌ Tamara order status error:", error.response?.data || error.message)
//     res.status(error.response?.status || 500).json({
//       success: false,
//       message: "Failed to get Tamara order status",
//       error: error.response?.data || error.message,
//     })
//   }
// })

// router.post("/tamara/capture/:orderId", protect, async (req, res) => {
//   try {
//     const { orderId } = req.params
//     const { total_amount, shipping_info } = req.body

//     const tamaraConfig = {
//       headers: {
//         Authorization: `Bearer ${process.env.TAMARA_API_KEY}`,
//         "Content-Type": "application/json",
//       },
//     }

//     const capturePayload = {
//       total_amount: {
//         amount: Number.parseFloat(total_amount.amount),
//         currency: total_amount.currency || "AED",
//       },
//       shipping_info: shipping_info || {},
//     }

//     const response = await axios.post(
//       `${process.env.TAMARA_API_URL}/orders/${orderId}/capture`,
//       capturePayload,
//       tamaraConfig,
//     )

//     // Update local order status
//     const order = await Order.findOne({ "paymentResult.tamara_order_id": orderId })
//     if (order) {
//       order.paymentResult = {
//         ...order.paymentResult,
//         status: "captured",
//         capture_id: response.data.capture_id,
//         update_time: new Date().toISOString(),
//       }
//       await order.save()
//     }

//     console.log("✅ Tamara payment captured:", orderId)

//     res.json({
//       success: true,
//       ...response.data,
//     })
//   } catch (error) {
//     console.error("❌ Tamara capture error:", error.response?.data || error.message)
//     res.status(error.response?.status || 500).json({
//       success: false,
//       message: "Failed to capture Tamara payment",
//       error: error.response?.data || error.message,
//     })
//   }
// })

// router.post("/tamara/refund/:orderId", protect, async (req, res) => {
//   try {
//     const { orderId } = req.params
//     const { total_amount, comment } = req.body

//     const tamaraConfig = {
//       headers: {
//         Authorization: `Bearer ${process.env.TAMARA_API_KEY}`,
//         "Content-Type": "application/json",
//       },
//     }

//     const refundPayload = {
//       total_amount: {
//         amount: Number.parseFloat(total_amount.amount),
//         currency: total_amount.currency || "AED",
//       },
//       comment: comment || "Refund requested by merchant",
//     }

//     const response = await axios.post(
//       `${process.env.TAMARA_API_URL}/orders/${orderId}/refund`,
//       refundPayload,
//       tamaraConfig,
//     )

//     // Update local order status
//     const order = await Order.findOne({ "paymentResult.tamara_order_id": orderId })
//     if (order) {
//       order.paymentResult = {
//         ...order.paymentResult,
//         status: "refunded",
//         refund_id: response.data.refund_id,
//         update_time: new Date().toISOString(),
//       }
//       await order.save()
//     }

//     console.log("✅ Tamara payment refunded:", orderId)

//     res.json({
//       success: true,
//       ...response.data,
//     })
//   } catch (error) {
//     console.error("❌ Tamara refund error:", error.response?.data || error.message)
//     res.status(error.response?.status || 500).json({
//       success: false,
//       message: "Failed to refund Tamara payment",
//       error: error.response?.data || error.message,
//     })
//   }
// })

// // Tabby Payment Routes
// router.post("/tabby/sessions", protect, async (req, res) => {
//   try {
//     const tabbyConfig = {
//       headers: {
//         Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
//         "Content-Type": "application/json",
//       },
//     }

//     const tabbyResponse = await axios.post(`${process.env.TABBY_API_URL}/api/v2/checkout`, req.body, tabbyConfig)

//     res.json(tabbyResponse.data)
//   } catch (error) {
//     console.error("Tabby payment error:", error.response?.data || error.message)
//     res.status(500).json({
//       message: "Tabby payment failed",
//       error: error.response?.data || error.message,
//     })
//   }
// })

// router.post("/tabby/webhook", async (req, res) => {
//   try {
//     const { id, status, order } = req.body
//     // Try to get reference_id from order or meta
//     const referenceId = order?.reference_id || order?.meta?.order_id

//     // Find and update order (support both old and new reference)
//     let dbOrder = await Order.findOne({ "paymentResult.tabby_payment_id": id })
//     if (!dbOrder && referenceId) {
//       dbOrder = await Order.findById(referenceId)
//     }
//     if (dbOrder) {
//       dbOrder.paymentResult = {
//         ...dbOrder.paymentResult,
//         status: status,
//         update_time: new Date().toISOString(),
//       }
//       dbOrder.isPaid = status === "AUTHORIZED"
//       dbOrder.paidAt = status === "AUTHORIZED" ? new Date() : null
//       await dbOrder.save()
//     }

//     res.status(200).json({ received: true })
//   } catch (error) {
//     console.error("Tabby webhook error:", error)
//     res.status(500).json({ error: "Webhook processing failed" })
//   }
// })

// // N-Genius Payment Routes
// router.post("/ngenius/card", async (req, res) => {
//   const { amount, currencyCode = "AED" } = req.body

//   if (!amount) {
//     return res.status(400).json({ error: "Amount is required" })
//   }

//   try {
//     const basicToken =
//       "Njk1NWExNDItMjA3ZC00MWZiLTk5NjQtZTM5OWY5MmVjMjRmOjhmZGM1NThhLTM0ZWYtNDFjMC05M2NjLTk5OWNhZjM5ZTA2OQ=="

//     // Step 1: Get access token
//     const tokenRes = await axios.post(
//       `${process.env.NGENIUS_API_URL}/identity/auth/access-token`,
//       {}, // required: empty object, not null
//       {
//         headers: {
//           Authorization: `Basic ${basicToken}`,
//           "Content-Type": "application/vnd.ni-identity.v1+json",
//         },
//       },
//     )

//     const accessToken = tokenRes.data.access_token
//     if (!accessToken) {
//       return res.status(500).json({ error: "Access token not received" })
//     }

//     console.log("Access token:", accessToken.slice(0, 12) + "...")

//     // Step 2: Create order
//     const orderPayload = {
//       action: "PURCHASE",
//       amount: {
//         currencyCode,
//         value: Math.round(amount * 100), // AED 10 → 1000 fils
//       },
//       merchantAttributes: {
//         redirectUrl: "https://graba2z.ae/payment/success", // ✅ required
//         cancelUrl: "https://graba2z.ae/payment/cancel", // optional
//       },
//     }

//     const orderRes = await axios.post(
//       `${process.env.NGENIUS_API_URL}/transactions/outlets/${process.env.NG_OUTLET_ID}/orders`,
//       orderPayload,
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "Content-Type": "application/vnd.ni-payment.v2+json",
//           Accept: "application/vnd.ni-payment.v2+json",
//         },
//       },
//     )

//     const { _links } = orderRes.data
//     const redirectUrl = _links?.payment?.href

//     if (!redirectUrl) {
//       return res.status(500).json({ error: "No redirect URL found in response" })
//     }

//     res.status(200).json({
//       paymentUrl: redirectUrl,
//       orderData: orderRes.data,
//     })
//   } catch (err) {
//     console.error("Hosted Payment Flow Error:", err.response?.data || err.message)
//     res.status(500).json({
//       error: "Hosted payment flow failed",
//       details: err.response?.data || err.message,
//     })
//   }
// })

// // Keep the existing N-Genius webhook
// router.post("/ngenius/webhook", async (req, res) => {
//   try {
//     const { orderReference, state, amount, orderId } = req.body

//     // Find and update order (support both old and new reference)
//     let order = await Order.findOne({ "paymentResult.ngenius_order_ref": orderReference })
//     if (!order && orderId) {
//       order = await Order.findById(orderId)
//     }
//     if (order) {
//       order.paymentResult = {
//         ...order.paymentResult,
//         status: state,
//         update_time: new Date().toISOString(),
//       }
//       order.isPaid = state === "PURCHASED"
//       order.paidAt = state === "PURCHASED" ? new Date() : null
//       await order.save()
//     }

//     res.status(200).json({ received: true })
//   } catch (error) {
//     console.error("N-Genius webhook error:", error)
//     res.status(500).json({ error: "Webhook processing failed" })
//   }
// })

// export default router




































































































import express from "express"
import axios from "axios"
import jwt from "jsonwebtoken"
import asyncHandler from "express-async-handler"
import Order from "../models/orderModel.js"
import User from "../models/userModel.js"
import { protect } from "../middleware/authMiddleware.js"
import TamaraService from "../services/tamaraService.js"

const router = express.Router()

const appendQueryParams = (url, params = {}) => {
  if (!url) return url
  try {
    const parsed = new URL(url)
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        parsed.searchParams.set(key, String(value))
      }
    })
    return parsed.toString()
  } catch (error) {
    return url
  }
}

const normalizeTamaraWebhookUrl = (url) => {
  const normalized = String(url || "").trim()
  if (!normalized) return normalized
  return normalized.replace(/\/api\/webhooks\/tamara\/?$/i, "/api/payment/tamara/webhook")
}

// Middleware to optionally protect routes (sets req.user if token exists, allows guest if not)
const optionalProtect = asyncHandler(async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1]
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      req.user = await User.findById(decoded.id).select('-password')
    } catch (error) {
      console.log('Optional auth failed:', error.message)
      // Don't throw error, just continue without user (guest checkout)
    }
  }
  next()
})

// Tamara Payment Routes - Supports both authenticated and guest checkout
router.post("/tamara/checkout", optionalProtect, async (req, res) => {
  try {
    const {
      total_amount,
      shipping_amount,
      tax_amount,
      order_reference_id,
      order_number,
      consumer,
      shipping_address,
      billing_address,
      items,
      merchant_url,
      discount,
      payment_type,
      instalments,
      country_code,
      description,
      platform,
      is_mobile,
      locale,
      risk_assessment,
      additional_data,
    } = req.body

    const missingFields = []
    if (!total_amount) missingFields.push("total_amount")
    if (!consumer) missingFields.push("consumer")
    if (!items || items.length === 0) missingFields.push("items")
    if (!billing_address) missingFields.push("billing_address")
    if (!shipping_address) missingFields.push("shipping_address")

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missingFields.join(", ")}`,
        required: ["total_amount", "consumer", "items", "billing_address", "shipping_address"],
        received: Object.keys(req.body),
      })
    }

    if (!process.env.TAMARA_API_KEY || process.env.TAMARA_API_KEY === "your_tamara_api_key_here") {
      console.error("❌ TAMARA_API_KEY not configured properly")
      return res.status(500).json({
        success: false,
        message: "Tamara API key not configured. Please check environment variables.",
      })
    }

    console.log("🔄 Creating Tamara checkout session:", {
      order_reference_id,
      total_amount,
      consumer_email: consumer.email,
      items_count: items.length,
    })

    const frontendBaseUrl = process.env.FRONTEND_URL || "https://www.graba2z.ae"
    const requestBaseUrl = `${req.protocol}://${req.get("host")}`
    const notificationUrl = normalizeTamaraWebhookUrl(
      merchant_url?.notification || `${requestBaseUrl}/api/payment/tamara/webhook`,
    )

    const tamaraPayload = {
      total_amount: {
        amount: Number.parseFloat(total_amount.amount),
        currency: total_amount.currency || "AED",
      },
      shipping_amount: {
        amount: Number.parseFloat(shipping_amount?.amount || 0),
        currency: shipping_amount?.currency || "AED",
      },
      tax_amount: {
        amount: Number.parseFloat(tax_amount?.amount || 0),
        currency: tax_amount?.currency || "AED",
      },
      order_reference_id: order_reference_id,
      order_number: order_number || `ORD_${order_reference_id}`,
      discount: discount || {
        amount: { amount: 0, currency: "AED" },
        name: "No discount",
      },
      items: items.map((item) => ({
        name: item.name,
        type: item.type || "Physical",
        reference_id: item.reference_id,
        sku: item.sku || item.reference_id,
        quantity: Number.parseInt(item.quantity),
        unit_price: {
          amount: Number.parseFloat(item.unit_price.amount),
          currency: item.unit_price.currency || "AED",
        },
        total_amount: {
          amount: Number.parseFloat(item.total_amount.amount),
          currency: item.total_amount.currency || "AED",
        },
        discount_amount: {
          amount: Number.parseFloat(item.discount_amount?.amount || 0),
          currency: item.discount_amount?.currency || "AED",
        },
        tax_amount: {
          amount: Number.parseFloat(item.tax_amount?.amount || 0),
          currency: item.tax_amount?.currency || "AED",
        },
      })),
      consumer: {
        email: consumer.email,
        first_name: consumer.first_name,
        last_name: consumer.last_name,
        phone_number: consumer.phone_number,
      },
      country_code: country_code || "AE",
      description: description || `Order for ${items.length} items from Graba2z`,
      merchant_url: {
        cancel: merchant_url?.cancel || `${frontendBaseUrl}/payment/cancel`,
        failure: merchant_url?.failure || `${frontendBaseUrl}/payment/cancel`,
        success: merchant_url?.success || `${frontendBaseUrl}/payment/success`,
        notification: notificationUrl,
      },
      payment_type: payment_type || "PAY_BY_INSTALMENTS",
      instalments: instalments || 3,
      billing_address: {
        city: billing_address.city,
        country_code: billing_address.country_code || "AE",
        first_name: billing_address.first_name,
        last_name: billing_address.last_name,
        line1: billing_address.line1,
        line2: billing_address.line2 || "",
        phone_number: billing_address.phone_number,
        region: billing_address.region,
      },
      shipping_address: {
        city: shipping_address.city,
        country_code: shipping_address.country_code || "AE",
        first_name: shipping_address.first_name,
        last_name: shipping_address.last_name,
        line1: shipping_address.line1,
        line2: shipping_address.line2 || "",
        phone_number: shipping_address.phone_number,
        region: shipping_address.region,
      },
      platform: platform || "Graba2z Online Store",
      is_mobile: is_mobile || false,
      locale: locale || "en_US",
      // Optional fields
      ...(risk_assessment && { risk_assessment }),
      ...(additional_data && { additional_data }),
    }

    const result = await TamaraService.createCheckout(tamaraPayload)

    if (!result.success) {
      console.error("❌ Tamara checkout failed:", result.error)
      return res.status(result.status || 500).json({
        success: false,
        message: "Payment URL not received from Tamara",
        error: result.error,
        details: result.status === 403 ? "API access denied. Please check your API key and account status." : undefined,
      })
    }

    if (!result.data || !result.data.checkout_url) {
      console.error("❌ Tamara API returned invalid response:", result.data)
      return res.status(500).json({
        success: false,
        message: "Payment URL not received from Tamara",
        error: "Invalid response from payment provider",
      })
    }

    // Store Tamara order details in our database
    if (order_reference_id) {
      try {
        const order = await Order.findById(order_reference_id)
        if (order) {
          order.paymentResult = {
            ...order.paymentResult,
            tamara_order_id: result.data.order_id,
            tamara_checkout_id: result.data.checkout_id,
            status: result.data.status || "new",
            update_time: new Date().toISOString(),
          }
          await order.save()
          console.log("✅ Updated order with Tamara details:", order_reference_id)
        }
      } catch (dbError) {
        console.error("⚠️ Failed to update order with Tamara details:", dbError.message)
      }
    }

    console.log("✅ Tamara checkout created successfully:", {
      order_id: result.data.order_id,
      checkout_id: result.data.checkout_id,
      status: result.data.status,
      has_checkout_url: !!result.data.checkout_url,
    })

    res.json({
      success: true,
      ...result.data,
    })
  } catch (error) {
    console.error("❌ Tamara payment error:", {
      message: error.message,
      stack: error.stack,
    })

    let errorMessage = "Payment URL not received from Tamara"
    if (error.message.includes("API key")) {
      errorMessage = "Invalid API configuration. Please check your Tamara API key."
    } else if (error.message.includes("Cloudflare")) {
      errorMessage = "Payment service temporarily unavailable. Please try again."
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

router.post("/tamara/webhook", async (req, res) => {
  try {
    const tamaraToken = req.query.tamaraToken || req.headers.authorization?.replace("Bearer ", "")

    if (process.env.TAMARA_WEBHOOK_SECRET && tamaraToken) {
      try {
        const decoded = jwt.verify(tamaraToken, process.env.TAMARA_WEBHOOK_SECRET, { algorithms: ["HS256"] })
        console.log("✅ Tamara webhook token validated:", decoded.iss)
      } catch (tokenError) {
        console.error("❌ Invalid Tamara webhook token:", tokenError.message)
        return res.status(401).json({ error: "Invalid webhook token" })
      }
    }

    const { order_id, order_reference_id, order_number, event_type, data } = req.body

    console.log("🔔 Tamara webhook received:", {
      event_type,
      order_id,
      order_reference_id,
      order_number,
    })

    // Find order by multiple possible identifiers
    let order = null
    if (order_reference_id) {
      order = await Order.findById(order_reference_id)
    }
    if (!order && order_id) {
      order = await Order.findOne({ "paymentResult.tamara_order_id": order_id })
    }
    if (!order && order_number) {
      order = await Order.findOne({ orderNumber: order_number })
    }

    if (!order) {
      console.error("❌ Order not found for Tamara webhook:", {
        order_id,
        order_reference_id,
        order_number,
      })
      return res.status(404).json({ error: "Order not found" })
    }

    if (event_type === "order_approved") {
      console.log("✅ Tamara payment approved, triggering authorization:", order_id)

      // Update order status to approved first
      order.paymentResult = {
        ...order.paymentResult,
        status: "approved",
        event_type: event_type,
        tamara_order_id: order_id,
        update_time: new Date().toISOString(),
        webhook_data: data,
      }
      order.isPaid = true
      if (!order.paidAt) {
        order.paidAt = new Date()
      }
      await order.save()

      // Automatically authorize the order
      try {
        const authResult = await TamaraService.authorizeOrder(order_id)
        if (authResult.success) {
          console.log("✅ Order automatically authorized:", order_id)
          order.paymentResult.status = "authorised"
          order.paymentResult.authorized_amount = authResult.data.authorized_amount
          order.paymentResult.order_expiry_time = authResult.data.order_expiry_time
          await order.save()
        }
      } catch (authError) {
        console.error("⚠️ Failed to auto-authorize order:", authError.message)
      }
    } else {
      // Handle other event types
      const previousStatus = order.paymentResult?.status
      let newStatus = event_type
      let isPaid = false

      switch (event_type) {
        case "order_declined":
          newStatus = "declined"
          isPaid = false
          break
        case "order_expired":
          newStatus = "expired"
          isPaid = false
          break
        case "order_canceled":
          newStatus = "canceled"
          isPaid = false
          break
        case "order_authorised":
          newStatus = "authorised"
          isPaid = true
          break
        case "order_captured":
          newStatus = "fully_captured"
          isPaid = true
          break
        case "order_refunded":
          newStatus = data?.refund_amount ? "partially_refunded" : "fully_refunded"
          break
        default:
          newStatus = event_type
      }

      // Update order with new status
      order.paymentResult = {
        ...order.paymentResult,
        status: newStatus,
        event_type: event_type,
        tamara_order_id: order_id,
        update_time: new Date().toISOString(),
        webhook_data: data,
      }

      order.isPaid = isPaid
      if (isPaid && !order.paidAt) {
        order.paidAt = new Date()
      }

      // Update order status based on payment status
      if (isPaid && order.orderStatus === "pending") {
        order.orderStatus = "confirmed"
      } else if (newStatus === "declined" || newStatus === "expired" || newStatus === "canceled") {
        order.orderStatus = "cancelled"
      }

      await order.save()

      console.log("✅ Order updated successfully:", {
        orderId: order._id,
        previousStatus,
        newStatus,
        isPaid,
        orderStatus: order.orderStatus,
      })
    }

    res.status(200).json({
      received: true,
      order_id: order._id,
      status: order.paymentResult.status,
    })
  } catch (error) {
    console.error("❌ Tamara webhook error:", error)
    res.status(500).json({ error: "Webhook processing failed" })
  }
})

router.post("/tamara/capture/:orderId", protect, async (req, res) => {
  try {
    const { orderId } = req.params
    const { total_amount, items, shipping_info, discount_amount, tax_amount } = req.body

    const capturePayload = {
      total_amount: {
        amount: Number.parseFloat(total_amount.amount),
        currency: total_amount.currency || "AED",
      },
      items: items || [],
      discount_amount: discount_amount || { amount: 0, currency: "AED" },
      shipping_amount: { amount: 0, currency: "AED" },
      shipping_info: shipping_info || {},
      tax_amount: tax_amount || { amount: 0, currency: "AED" },
    }

    const result = await TamaraService.capturePayment(orderId, capturePayload)

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to capture Tamara payment",
        error: result.error,
      })
    }

    // Update local order status
    const order = await Order.findOne({ "paymentResult.tamara_order_id": orderId })
    if (order) {
      order.paymentResult = {
        ...order.paymentResult,
        status: result.data.status,
        capture_id: result.data.capture_id,
        captured_amount: result.data.captured_amount,
        update_time: new Date().toISOString(),
      }
      await order.save()
    }

    console.log("✅ Tamara payment captured:", orderId)

    res.json({
      success: true,
      ...result.data,
    })
  } catch (error) {
    console.error("❌ Tamara capture error:", error.message)
    res.status(500).json({
      success: false,
      message: "Failed to capture Tamara payment",
      error: error.message,
    })
  }
})

router.post("/tamara/refund/:orderId", protect, async (req, res) => {
  try {
    const { orderId } = req.params
    const { total_amount, comment } = req.body

    const refundPayload = {
      total_amount: {
        amount: Number.parseFloat(total_amount.amount),
        currency: total_amount.currency || "AED",
      },
      comment: comment || "Refund requested by merchant",
    }

    const result = await TamaraService.refundPayment(orderId, refundPayload)

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to refund Tamara payment",
        error: result.error,
      })
    }

    // Update local order status
    const order = await Order.findOne({ "paymentResult.tamara_order_id": orderId })
    if (order) {
      order.paymentResult = {
        ...order.paymentResult,
        status: "refunded",
        refund_amount: result.data.total_amount,
        update_time: new Date().toISOString(),
      }
      await order.save()
    }

    console.log("✅ Tamara payment refunded:", orderId)

    res.json({
      success: true,
      ...result.data,
    })
  } catch (error) {
    console.error("❌ Tamara refund error:", error.message)
    res.status(500).json({
      success: false,
      message: "Failed to refund Tamara payment",
      error: error.message,
    })
  }
})

router.get("/tamara/order/:orderId", protect, async (req, res) => {
  try {
    const { orderId } = req.params

    const tamaraConfig = {
      headers: {
        Authorization: `Bearer ${process.env.TAMARA_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Graba2z-Ecommerce/1.0; +https://graba2z.ae)",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      timeout: 30000,
    }

    const response = await axios.get(`${process.env.TAMARA_API_URL}/orders/${orderId}`, tamaraConfig)

    res.json({
      success: true,
      order: response.data,
    })
  } catch (error) {
    console.error("❌ Tamara order status error:", error.response?.data || error.message)
    res.status(error.response?.status || 500).json({
      success: false,
      message: "Failed to get Tamara order status",
      error: error.response?.data || error.message,
    })
  }
})

router.post("/tamara/authorize/:orderId", protect, async (req, res) => {
  try {
    const { orderId } = req.params

    console.log("🔐 Authorizing Tamara order:", orderId)

    const result = await TamaraService.authorizeOrder(orderId)

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to authorize Tamara order",
        error: result.error,
      })
    }

    // Update local order status
    const order = await Order.findOne({ "paymentResult.tamara_order_id": orderId })
    if (order) {
      order.paymentResult = {
        ...order.paymentResult,
        status: "authorised",
        authorized_amount: result.data.authorized_amount,
        order_expiry_time: result.data.order_expiry_time,
        update_time: new Date().toISOString(),
      }
      order.isPaid = true
      if (!order.paidAt) {
        order.paidAt = new Date()
      }
      await order.save()
    }

    console.log("✅ Tamara order authorized successfully:", orderId)

    res.json({
      success: true,
      ...result.data,
    })
  } catch (error) {
    console.error("❌ Tamara authorization error:", error.message)
    res.status(500).json({
      success: false,
      message: "Failed to authorize Tamara order",
      error: error.message,
    })
  }
})

const handleTabbyCheckout = async (req, res) => {
  try {
    const tabbyConfig = {
      headers: {
        Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    }

    const tabbyResponse = await axios.post(`${process.env.TABBY_API_URL}/api/v2/checkout`, req.body, tabbyConfig)

    res.json(tabbyResponse.data)
  } catch (error) {
    console.error("Tabby payment error:", error.response?.data || error.message)
    res.status(500).json({
      message: "Tabby payment failed",
      error: error.response?.data || error.message,
    })
  }
}

// Tabby Payment Routes - Supports both authenticated and guest checkout
router.post("/tabby/sessions", optionalProtect, handleTabbyCheckout)
// Backward-compatible alias used by some clients
router.post("/tabby/checkout", optionalProtect, handleTabbyCheckout)

router.post("/tabby/webhook", async (req, res) => {
  try {
    const { id, status, order } = req.body
    // Try to get reference_id from order or meta
    const referenceId = order?.reference_id || order?.meta?.order_id

    // Find and update order (support both old and new reference)
    let dbOrder = await Order.findOne({ "paymentResult.tabby_payment_id": id })
    if (!dbOrder && referenceId) {
      dbOrder = await Order.findById(referenceId)
    }
    if (dbOrder) {
      const normalizedStatus = String(status || "").toUpperCase()
      const paidStatuses = new Set(["AUTHORIZED", "AUTHORISED", "CAPTURED", "PAID", "CLOSED"])
      const isPaid = paidStatuses.has(normalizedStatus)

      dbOrder.paymentResult = {
        ...dbOrder.paymentResult,
        status: normalizedStatus || status,
        tabby_payment_id: id,
        update_time: new Date().toISOString(),
      }
      dbOrder.isPaid = isPaid
      dbOrder.paidAt = isPaid ? dbOrder.paidAt || new Date() : null
      await dbOrder.save()
    }

    res.status(200).json({ received: true })
  } catch (error) {
    console.error("Tabby webhook error:", error)
    res.status(500).json({ error: "Webhook processing failed" })
  }
})

// N-Genius Payment Routes
router.post("/ngenius/card", async (req, res) => {
  const {
    amount,
    currencyCode = "AED",
    orderId,
    redirectUrl,
    cancelUrl,
    paymentMethod = "card",
  } = req.body

  if (!amount) {
    return res.status(400).json({ error: "Amount is required" })
  }

  try {
    const basicToken =
      "Njk1NWExNDItMjA3ZC00MWZiLTk5NjQtZTM5OWY5MmVjMjRmOjhmZGM1NThhLTM0ZWYtNDFjMC05M2NjLTk5OWNhZjM5ZTA2OQ=="

    // Step 1: Get access token
    const tokenRes = await axios.post(
      `${process.env.NGENIUS_API_URL}/identity/auth/access-token`,
      {},
      {
        headers: {
          Authorization: `Basic ${basicToken}`,
          "Content-Type": "application/vnd.ni-identity.v1+json",
        },
      },
    )

    const accessToken = tokenRes.data.access_token
    if (!accessToken) {
      return res.status(500).json({ error: "Access token not received" })
    }

    const defaultFrontendUrl = process.env.FRONTEND_URL || "https://www.graba2z.ae"
    const redirectWithParams = appendQueryParams(redirectUrl || `${defaultFrontendUrl}/payment/success`, {
      orderId,
      payment_method: paymentMethod,
      amount,
    })
    const cancelWithParams = appendQueryParams(cancelUrl || `${defaultFrontendUrl}/payment/cancel`, {
      orderId,
      payment_method: paymentMethod,
    })

    // Step 2: Create payment order
    const orderPayload = {
      action: "PURCHASE",
      amount: {
        currencyCode,
        value: Math.round(amount * 100),
      },
      merchantAttributes: {
        redirectUrl: redirectWithParams,
        cancelUrl: cancelWithParams,
      },
    }

    const orderRes = await axios.post(
      `${process.env.NGENIUS_API_URL}/transactions/outlets/${process.env.NG_OUTLET_ID}/orders`,
      orderPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/vnd.ni-payment.v2+json",
          Accept: "application/vnd.ni-payment.v2+json",
        },
      },
    )

    const { _links } = orderRes.data
    const paymentUrl = _links?.payment?.href
    const ngeniusReference = orderRes.data?.reference || orderRes.data?._id

    if (!paymentUrl) {
      return res.status(500).json({ error: "No redirect URL found in response" })
    }

    if (orderId) {
      try {
        const order = await Order.findById(orderId)
        if (order) {
          order.paymentResult = {
            ...order.paymentResult,
            id: orderRes.data?._id || order.paymentResult?.id,
            ngenius_order_ref: ngeniusReference,
            status: orderRes.data?.state || "PENDING",
            update_time: new Date().toISOString(),
          }
          await order.save()
        }
      } catch (dbError) {
        console.error("Failed to save N-Genius reference on order:", dbError.message)
      }
    }

    res.status(200).json({
      paymentUrl,
      reference: ngeniusReference,
      orderData: orderRes.data,
    })
  } catch (err) {
    console.error("Hosted Payment Flow Error:", err.response?.data || err.message)
    res.status(500).json({
      error: "Hosted payment flow failed",
      details: err.response?.data || err.message,
    })
  }
})

// Keep the existing N-Genius webhook
router.post("/ngenius/webhook", async (req, res) => {
  try {
    const { orderReference, state, amount, orderId } = req.body
    const ngeniusRef = orderReference || req.body?.reference || req.body?.order?.reference
    const fallbackOrderId = orderId || req.body?.order_id || req.body?.merchantOrderId
    const normalizedState = String(state || "").toUpperCase()
    const paidStates = new Set(["PURCHASED", "CAPTURED", "AUTHORIZED", "AUTHORISED", "PAID"])

    // Find and update order (support both old and new reference)
    let order = null
    if (ngeniusRef) {
      order = await Order.findOne({ "paymentResult.ngenius_order_ref": ngeniusRef })
    }
    if (!order && fallbackOrderId) {
      order = await Order.findById(fallbackOrderId)
    }
    if (order) {
      order.paymentResult = {
        ...order.paymentResult,
        ngenius_order_ref: ngeniusRef || order.paymentResult?.ngenius_order_ref,
        status: normalizedState || state,
        update_time: new Date().toISOString(),
      }
      order.isPaid = paidStates.has(normalizedState)
      if (order.isPaid) {
        order.paidAt = order.paidAt || new Date()
      } else if (["FAILED", "DECLINED", "CANCELED", "CANCELLED", "EXPIRED"].includes(normalizedState)) {
        order.paidAt = null
      }
      await order.save()
    }

    res.status(200).json({ received: true })
  } catch (error) {
    console.error("N-Genius webhook error:", error)
    res.status(500).json({ error: "Webhook processing failed" })
  }
})

export default router
