import mongoose from 'mongoose';

const gamingZoneCategorySchema = new mongoose.Schema(
  {
    gamingZonePageSlug: {
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

// Unique compound index to prevent duplicate categories in same gaming zone page
gamingZoneCategorySchema.index({ gamingZonePageSlug: 1, category: 1 }, { unique: true });

const GamingZoneCategory = mongoose.model('GamingZoneCategory', gamingZoneCategorySchema);

export default GamingZoneCategory;
