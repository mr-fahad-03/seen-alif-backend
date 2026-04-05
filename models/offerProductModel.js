import mongoose from 'mongoose';

const offerProductSchema = new mongoose.Schema(
  {
    offerPageSlug: {
      type: String,
      required: true,
      trim: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
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

// Unique compound index to prevent duplicate products in same offer page
offerProductSchema.index({ offerPageSlug: 1, product: 1 }, { unique: true });

const OfferProduct = mongoose.model('OfferProduct', offerProductSchema);

export default OfferProduct;
