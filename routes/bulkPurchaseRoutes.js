import express from "express"
import BulkPurchase from "../models/bulkPurchaseModel.js"
import User from "../models/userModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { sendEmail } from "../utils/emailService.js"

const router = express.Router()

// @desc    Send OTP for bulk purchase inquiry (for non-logged-in users)
// @route   POST /api/bulk-purchase/send-otp
// @access  Public
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ message: "Email is required" })
    }

    // Create a temporary bulk purchase record with OTP
    const bulkPurchase = new BulkPurchase({
      email,
      name: "Pending",
      phone: "Pending",
      company: "Pending",
      isVerified: false,
    })

    const otpCode = bulkPurchase.generateOTP()
    await bulkPurchase.save()

    // Send OTP email
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="https://www.graba2z.ae/logo.png" alt="Graba2z Logo" style="max-width: 200px; height: auto;">
        </div>
        <h2 style="color: #2c3e50; text-align: center;">Bulk Purchase Inquiry Verification</h2>
        <p>Thank you for your interest in bulk purchasing from Graba2z.</p>
        <p>Please verify your email address by entering the verification code below:</p>
        <div style="background: #f5f5f5; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
          <div style="font-size: 32px; font-weight: bold; color: #84cc16; letter-spacing: 4px;">${otpCode}</div>
        </div>
        <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
        <p style="color: #888; font-size: 12px; margin-top: 32px;">&copy; ${new Date().getFullYear()} Graba2z. All rights reserved.</p>
      </div>
    `

    await sendEmail(email, "Verify Your Bulk Purchase Inquiry - Graba2z", html, "support")

    res.status(200).json({
      success: true,
      message: "OTP sent to your email",
      tempId: bulkPurchase._id,
    })
  } catch (error) {
    console.error("Error sending OTP:", error)
    res.status(500).json({ message: "Failed to send OTP" })
  }
})

// @desc    Submit bulk purchase inquiry
// @route   POST /api/bulk-purchase
// @access  Public
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, company, note, otp, tempId, userId } = req.body

    if (!name || !email || !phone || !company) {
      return res.status(400).json({ message: "All fields except note are required" })
    }

    let bulkPurchase

    // If user is logged in, skip OTP verification
    if (userId) {
      const user = await User.findById(userId)
      if (!user) {
        return res.status(404).json({ message: "User not found" })
      }

      bulkPurchase = new BulkPurchase({
        name,
        email,
        phone,
        company,
        note,
        userId,
        isVerified: true,
      })
      await bulkPurchase.save()
    } else {
      // For non-logged-in users, verify OTP
      if (!otp || !tempId) {
        return res.status(400).json({ message: "OTP verification is required" })
      }

      bulkPurchase = await BulkPurchase.findById(tempId)
      if (!bulkPurchase) {
        return res.status(404).json({ message: "Invalid OTP session" })
      }

      if (!bulkPurchase.verifyOTP(otp)) {
        return res.status(400).json({ message: "Invalid or expired OTP" })
      }

      // Update the record with full details
      bulkPurchase.name = name
      bulkPurchase.phone = phone
      bulkPurchase.company = company
      bulkPurchase.note = note
      bulkPurchase.isVerified = true
      bulkPurchase.otpCode = undefined
      bulkPurchase.otpExpires = undefined
      await bulkPurchase.save()
    }

    // Send confirmation email to customer
    const confirmationHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="https://www.graba2z.ae/logo.png" alt="Graba2z Logo" style="max-width: 200px; height: auto;">
        </div>
        <h2 style="color: #2c3e50; text-align: center;">Bulk Purchase Inquiry Received</h2>
        <p>Dear ${name},</p>
        <p>Thank you for your bulk purchase inquiry. We have received your request and our sales team will contact you shortly.</p>
        <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <h3 style="color: #2c3e50; margin-top: 0;">Your Inquiry Details:</h3>
          <p style="margin: 8px 0;"><strong>Company:</strong> ${company}</p>
          <p style="margin: 8px 0;"><strong>Phone:</strong> ${phone}</p>
          <p style="margin: 8px 0;"><strong>Email:</strong> ${email}</p>
          ${note ? `<p style="margin: 8px 0;"><strong>Note:</strong> ${note}</p>` : ""}
        </div>
        <p>Our team typically responds within 24 hours during business days.</p>
        <p style="color: #888; font-size: 12px; margin-top: 32px;">&copy; ${new Date().getFullYear()} Graba2z. All rights reserved.</p>
      </div>
    `

    await sendEmail(email, "Bulk Purchase Inquiry Confirmation - Graba2z", confirmationHtml, "support")

    res.status(201).json({
      success: true,
      message: "Bulk purchase inquiry submitted successfully",
      data: bulkPurchase,
    })
  } catch (error) {
    console.error("Error submitting bulk purchase inquiry:", error)
    res.status(500).json({ message: "Failed to submit inquiry" })
  }
})

// @desc    Get all bulk purchase inquiries (Admin)
// @route   GET /api/bulk-purchase
// @access  Private/Admin
router.get("/", protect, admin, async (req, res) => {
  try {
    const bulkPurchases = await BulkPurchase.find({ isVerified: true })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })

    res.json(bulkPurchases)
  } catch (error) {
    console.error("Error fetching bulk purchases:", error)
    res.status(500).json({ message: "Failed to fetch bulk purchases" })
  }
})

// @desc    Update bulk purchase status (Admin)
// @route   PATCH /api/bulk-purchase/:id/status
// @access  Private/Admin
router.patch("/:id/status", protect, admin, async (req, res) => {
  try {
    const { status } = req.body

    if (!["pending", "contacted", "done", "spam"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" })
    }

    const bulkPurchase = await BulkPurchase.findById(req.params.id)

    if (!bulkPurchase) {
      return res.status(404).json({ message: "Bulk purchase inquiry not found" })
    }

    bulkPurchase.status = status
    await bulkPurchase.save()

    res.json({
      success: true,
      message: "Status updated successfully",
      data: bulkPurchase,
    })
  } catch (error) {
    console.error("Error updating status:", error)
    res.status(500).json({ message: "Failed to update status" })
  }
})

// @desc    Delete bulk purchase inquiry (Admin)
// @route   DELETE /api/bulk-purchase/:id
// @access  Private/Admin
router.delete("/:id", protect, admin, async (req, res) => {
  try {
    const bulkPurchase = await BulkPurchase.findById(req.params.id)

    if (!bulkPurchase) {
      return res.status(404).json({ message: "Bulk purchase inquiry not found" })
    }

    await bulkPurchase.deleteOne()

    res.json({
      success: true,
      message: "Bulk purchase inquiry deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting bulk purchase:", error)
    res.status(500).json({ message: "Failed to delete inquiry" })
  }
})

export default router
