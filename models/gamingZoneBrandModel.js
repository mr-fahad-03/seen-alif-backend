import mongoose from 'mongoose';

const gamingZoneBrandSchema = new mongoose.Schema(
  {
    gamingZonePageSlug: {
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

// Unique compound index to prevent duplicate brands in same gaming zone page
gamingZoneBrandSchema.index({ gamingZonePageSlug: 1, brand: 1 }, { unique: true });

const GamingZoneBrand = mongoose.model('GamingZoneBrand', gamingZoneBrandSchema);

export default GamingZoneBrand;
