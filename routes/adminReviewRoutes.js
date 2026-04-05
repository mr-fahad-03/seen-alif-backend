// import express from 'express';
// import { protect } from '../middleware/authMiddleware.js';
// import Review from '../models/reviewModel.js';
// import Product from '../models/productModel.js';

// const router = express.Router();

// // Admin middleware
// const admin = (req, res, next) => {
//   console.log('Admin middleware - user:', req.user);
//   if (req.user && (req.user.isAdmin || req.user.role === 'admin')) {
//     next();
//   } else {
//     res.status(403);
//     throw new Error('Not authorized as admin');
//   }
// };

// // @desc    Get all reviews for admin
// // @route   GET /api/admin/reviews
// // @access  Private/Admin
// router.get('/reviews', protect, admin, async (req, res) => {
//   try {
//     console.log('Fetching reviews for admin...');
    
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const status = req.query.status;
//     const search = req.query.search;

//     console.log('Query params:', { page, limit, status, search });

//     // Build query
//     let query = {};
    
//     // Filter by status
//     if (status && status !== 'all') {
//       query.status = status;
//     }

//     // Search functionality
//     if (search) {
//       query.$or = [
//         { name: { $regex: search, $options: 'i' } },
//         { email: { $regex: search, $options: 'i' } },
//         { comment: { $regex: search, $options: 'i' } }
//       ];
//     }

//     console.log('MongoDB query:', query);

//     // Get total count for pagination
//     const totalReviews = await Review.countDocuments(query);
//     console.log('Total reviews found:', totalReviews);

//     // Get reviews with pagination
//     const reviews = await Review.find(query)
//       .populate('product', 'name price images')
//       .sort({ createdAt: -1 })
//       .limit(limit * 1)
//       .skip((page - 1) * limit);

//     console.log('Reviews retrieved:', reviews.length);

//     // Calculate stats
//     const stats = {
//       total: await Review.countDocuments(),
//       pending: await Review.countDocuments({ status: 'pending' }),
//       approved: await Review.countDocuments({ status: 'approved' }),
//       rejected: await Review.countDocuments({ status: 'rejected' })
//     };

//     console.log('Stats:', stats);

//     res.json({
//       success: true,
//       reviews,
//       stats,
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil(totalReviews / limit),
//         totalReviews,
//         hasNextPage: page < Math.ceil(totalReviews / limit),
//         hasPrevPage: page > 1
//       }
//     });

//   } catch (error) {
//     console.error('Error fetching reviews:', error);
//     res.status(500).json({ 
//       success: false,
//       message: 'Server error', 
//       error: error.message 
//     });
//   }
// });

// // @desc    Get single review
// // @route   GET /api/admin/reviews/:id
// // @access  Private/Admin
// router.get('/reviews/:id', protect, admin, async (req, res) => {
//   try {
//     console.log('Fetching review by ID:', req.params.id);
    
//     const review = await Review.findById(req.params.id)
//       .populate('product', 'name price images');

//     if (!review) {
//       return res.status(404).json({ 
//         success: false,
//         message: 'Review not found' 
//       });
//     }

//     res.json({ 
//       success: true,
//       review 
//     });
//   } catch (error) {
//     console.error('Error fetching review:', error);
//     res.status(500).json({ 
//       success: false,
//       message: 'Server error', 
//       error: error.message 
//     });
//   }
// });

// // @desc    Approve review
// // @route   PUT /api/admin/reviews/:id/approve
// // @access  Private/Admin
// router.put('/reviews/:id/approve', protect, admin, async (req, res) => {
//   try {
//     console.log('Approving review:', req.params.id);
    
//     const review = await Review.findById(req.params.id);

//     if (!review) {
//       return res.status(404).json({ 
//         success: false,
//         message: 'Review not found' 
//       });
//     }

//     review.status = 'approved';
//     review.adminNotes = req.body.adminNotes || '';
//     review.approvedAt = new Date();
//     review.approvedBy = req.user._id;

//     await review.save();

//     console.log('Review approved successfully');

//     res.json({ 
//       success: true,
//       message: 'Review approved successfully', 
//       review 
//     });
//   } catch (error) {
//     console.error('Error approving review:', error);
//     res.status(500).json({ 
//       success: false,
//       message: 'Server error', 
//       error: error.message 
//     });
//   }
// });

// // @desc    Reject review
// // @route   PUT /api/admin/reviews/:id/reject
// // @access  Private/Admin
// router.put('/reviews/:id/reject', protect, admin, async (req, res) => {
//   try {
//     console.log('Rejecting review:', req.params.id);
    
//     const review = await Review.findById(req.params.id);

//     if (!review) {
//       return res.status(404).json({ 
//         success: false,
//         message: 'Review not found' 
//       });
//     }

//     review.status = 'rejected';
//     review.adminNotes = req.body.adminNotes || '';
//     review.rejectedAt = new Date();
//     review.rejectedBy = req.user._id;

//     await review.save();

//     console.log('Review rejected successfully');

//     res.json({ 
//       success: true,
//       message: 'Review rejected successfully', 
//       review 
//     });
//   } catch (error) {
//     console.error('Error rejecting review:', error);
//     res.status(500).json({ 
//       success: false,
//       message: 'Server error', 
//       error: error.message 
//     });
//   }
// });

// // @desc    Delete review
// // @route   DELETE /api/admin/reviews/:id
// // @access  Private/Admin
// router.delete('/reviews/:id', protect, admin, async (req, res) => {
//   try {
//     console.log('Deleting review:', req.params.id);
    
//     const review = await Review.findById(req.params.id);

//     if (!review) {
//       return res.status(404).json({ 
//         success: false,
//         message: 'Review not found' 
//       });
//     }

//     await Review.findByIdAndDelete(req.params.id);

//     console.log('Review deleted successfully');

//     res.json({ 
//       success: true,
//       message: 'Review deleted successfully' 
//     });
//   } catch (error) {
//     console.error('Error deleting review:', error);
//     res.status(500).json({ 
//       success: false,
//       message: 'Server error', 
//       error: error.message 
//     });
//   }
// });

// // Test route to check if admin routes are working
// router.get('/test', protect, admin, (req, res) => {
//   res.json({ 
//     success: true, 
//     message: 'Admin routes are working!', 
//     user: req.user 
//   });
// });

// export default router;























































































































































































































































import express from "express"
import { protect } from "../middleware/authMiddleware.js"
import Review from "../models/reviewModel.js"
import { updateProductReviewStats } from "../utils/reviewUtils.js"

const router = express.Router()

// Admin middleware
const admin = (req, res, next) => {
  console.log("Admin middleware - user:", req.user)
  if (req.user && (req.user.isAdmin || req.user.role === "admin")) {
    next()
  } else {
    res.status(403)
    throw new Error("Not authorized as admin")
  }
}

// @desc    Get all reviews for admin
// @route   GET /api/admin/reviews
// @access  Private/Admin
router.get("/reviews", protect, admin, async (req, res) => {
  try {
    console.log("Fetching reviews for admin...")

    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const status = req.query.status
    const search = req.query.search

    console.log("Query params:", { page, limit, status, search })

    // Build query
    const query = {}

    // Filter by status
    if (status && status !== "all") {
      query.status = status
    }

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { comment: { $regex: search, $options: "i" } },
      ]
    }

    console.log("MongoDB query:", query)

    // Get total count for pagination
    const totalReviews = await Review.countDocuments(query)
    console.log("Total reviews found:", totalReviews)

    // Get reviews with pagination
    const reviews = await Review.find(query)
      .populate("product", "name price images")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    console.log("Reviews retrieved:", reviews.length)

    // Calculate stats
    const stats = {
      total: await Review.countDocuments(),
      pending: await Review.countDocuments({ status: "pending" }),
      approved: await Review.countDocuments({ status: "approved" }),
      rejected: await Review.countDocuments({ status: "rejected" }),
    }

    console.log("Stats:", stats)

    res.json({
      success: true,
      reviews,
      stats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalReviews / limit),
        totalReviews,
        hasNextPage: page < Math.ceil(totalReviews / limit),
        hasPrevPage: page > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching reviews:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
})

// @desc    Get single review
// @route   GET /api/admin/reviews/:id
// @access  Private/Admin
router.get("/reviews/:id", protect, admin, async (req, res) => {
  try {
    console.log("Fetching review by ID:", req.params.id)

    const review = await Review.findById(req.params.id).populate("product", "name price images")

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      })
    }

    res.json({
      success: true,
      review,
    })
  } catch (error) {
    console.error("Error fetching review:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
})

// @desc    Approve review
// @route   PUT /api/admin/reviews/:id/approve
// @access  Private/Admin
router.put("/reviews/:id/approve", protect, admin, async (req, res) => {
  try {
    console.log("Approving review:", req.params.id)

    const review = await Review.findById(req.params.id)

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      })
    }

    const productId = review.product

    review.status = "approved"
    review.adminNotes = req.body.adminNotes || ""
    review.approvedAt = new Date()
    review.approvedBy = req.user._id

    await review.save()

    try {
      await updateProductReviewStats(productId)
      console.log(`[AdminReviewRoutes] Updated product stats after review approval for product: ${productId}`)
    } catch (error) {
      console.error(`[AdminReviewRoutes] Failed to update product stats:`, error)
      // Don't fail the request if stats update fails
    }

    console.log("Review approved successfully")

    res.json({
      success: true,
      message: "Review approved successfully",
      review,
    })
  } catch (error) {
    console.error("Error approving review:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
})

// @desc    Reject review
// @route   PUT /api/admin/reviews/:id/reject
// @access  Private/Admin
router.put("/reviews/:id/reject", protect, admin, async (req, res) => {
  try {
    console.log("Rejecting review:", req.params.id)

    const review = await Review.findById(req.params.id)

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      })
    }

    const productId = review.product

    review.status = "rejected"
    review.adminNotes = req.body.adminNotes || ""
    review.rejectedAt = new Date()
    review.rejectedBy = req.user._id

    await review.save()

    try {
      await updateProductReviewStats(productId)
      console.log(`[AdminReviewRoutes] Updated product stats after review rejection for product: ${productId}`)
    } catch (error) {
      console.error(`[AdminReviewRoutes] Failed to update product stats:`, error)
      // Don't fail the request if stats update fails
    }

    console.log("Review rejected successfully")

    res.json({
      success: true,
      message: "Review rejected successfully",
      review,
    })
  } catch (error) {
    console.error("Error rejecting review:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
})

// @desc    Delete review
// @route   DELETE /api/admin/reviews/:id
// @access  Private/Admin
router.delete("/reviews/:id", protect, admin, async (req, res) => {
  try {
    console.log("Deleting review:", req.params.id)

    const review = await Review.findById(req.params.id)

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      })
    }

    const productId = review.product

    await Review.findByIdAndDelete(req.params.id)

    try {
      await updateProductReviewStats(productId)
      console.log(`[AdminReviewRoutes] Updated product stats after review deletion for product: ${productId}`)
    } catch (error) {
      console.error(`[AdminReviewRoutes] Failed to update product stats:`, error)
      // Don't fail the request if stats update fails
    }

    console.log("Review deleted successfully")

    res.json({
      success: true,
      message: "Review deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting review:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
})

// Test route to check if admin routes are working
router.get("/test", protect, admin, (req, res) => {
  res.json({
    success: true,
    message: "Admin routes are working!",
    user: req.user,
  })
})

export default router
