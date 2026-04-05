import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: false
  },
  adminNotes: {
    type: String,
    required: false
  },
  approvedAt: {
    type: Date,
    required: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  rejectedAt: {
    type: Date,
    required: false
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, {
  timestamps: true
});

const Review = mongoose.model('Review', reviewSchema);

export default Review;