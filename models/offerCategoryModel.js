import mongoose from 'mongoose';

const offerCategorySchema = new mongoose.Schema(
  {
    offerPageSlug: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'categoryType',
      required: true,
    },
    categoryType: {
      type: String,
      required: true,
      enum: ['Category', 'SubCategory'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index to prevent duplicate categories in same offer page
offerCategorySchema.index({ offerPageSlug: 1, category: 1 }, { unique: true });

const OfferCategory = mongoose.model('OfferCategory', offerCategorySchema);

export default OfferCategory;
