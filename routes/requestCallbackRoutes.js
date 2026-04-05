import express from 'express';
import asyncHandler from 'express-async-handler';
import RequestCallback from '../models/requestCallbackModel.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { sendVerificationEmail } from '../utils/emailService.js';

const router = express.Router();

// Temporary storage for verification codes (in production, use Redis or database)
const verificationCodes = new Map();

// Send verification code to email
router.post(
  '/send-verification',
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code with 10 minute expiration
    verificationCodes.set(email, {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000
    });
    
    // Log verification code prominently for testing
    console.log('\n' + '='.repeat(80));
    console.log('🔐 VERIFICATION CODE GENERATED');
    console.log('='.repeat(80));
    console.log(`📧 Email: ${email}`);
    console.log(`🔢 Code: ${code}`);
    console.log(`⏰ Expires at: ${new Date(Date.now() + 10 * 60 * 1000).toLocaleString()}`);
    console.log('='.repeat(80) + '\n');
    
    // Try to send email with code using email service
    try {
      await sendVerificationEmail(email, 'Guest User', code);
      console.log(`✅ Email successfully sent to ${email}`);
      res.json({ 
        message: 'Verification code sent to your email', 
        success: true 
      });
    } catch (error) {
      console.error('❌ Failed to send verification email:', error.message);
      // Still return success - code is logged above and stored in memory
      // This allows testing even when email service is unavailable
      res.json({ 
        message: 'Verification code generated (check server logs if email not received)', 
        success: true 
      });
    }
  })
);

// Verify email code
router.post(
  '/verify-code',
  asyncHandler(async (req, res) => {
    const { email, code } = req.body;
    
    const stored = verificationCodes.get(email);
    
    if (!stored) {
      res.status(400);
      throw new Error('No verification code found');
    }
    
    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(email);
      res.status(400);
      throw new Error('Verification code expired');
    }
    
    if (stored.code !== code) {
      res.status(400);
      throw new Error('Invalid verification code');
    }
    
    // Clear the code after successful verification
    verificationCodes.delete(email);
    
    res.json({ message: 'Email verified successfully', success: true });
  })
);

// Create a new callback request
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, phone, countryCode, customerNote, productId, productName, productLink } = req.body;
    
    console.log('Request Callback - Received data:', { name, email, phone, countryCode, customerNote, productId, productName, productLink });
    
    try {
      const callback = await RequestCallback.create({ 
        name, 
        email, 
        phone, 
        countryCode: countryCode || '',
        customerNote: customerNote || '',
        productId: productId || null,
        productName: productName || '',
        productLink: productLink || ''
      });
      
      console.log('Request Callback - Created successfully:', callback._id);
      res.status(201).json(callback);
    } catch (error) {
      console.error('Request Callback - Error creating:', error);
      res.status(400);
      throw new Error(`Failed to create callback request: ${error.message}`);
    }
  })
);

// Get all callback requests (admin only)
router.get(
  '/',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const callbacks = await RequestCallback.find().sort({ createdAt: -1 });
    res.json(callbacks);
  })
);

// Update status (admin only)
router.patch(
  '/:id/status',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const callback = await RequestCallback.findById(req.params.id);
    if (!callback) {
      res.status(404);
      throw new Error('Request not found');
    }
    callback.status = status;
    await callback.save();
    res.json(callback);
  })
);

// Delete a callback request (admin only)
router.delete(
  '/:id',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const callback = await RequestCallback.findById(req.params.id);
    if (!callback) {
      res.status(404);
      throw new Error('Request not found');
    }
    await callback.deleteOne();
    res.json({ message: 'Request deleted' });
  })
);

export default router;
