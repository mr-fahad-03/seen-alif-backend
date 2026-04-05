import mongoose from 'mongoose';

const offerBrandSchema = new mongoose.Schema(
  {
    offerPageSlug: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
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

// Unique compound index to prevent duplicate brands in same offer page
offerBrandSchema.index({ offerPageSlug: 1, brand: 1 }, { unique: true });

const OfferBrand = mongoose.model('OfferBrand', offerBrandSchema);

export default OfferBrand;
