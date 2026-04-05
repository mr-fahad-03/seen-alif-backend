import mongoose from 'mongoose';

const bannerCardSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    details: {
      type: String,
      trim: true,
    },
    nameAr: {
      type: String,
      default: '',
    },
    detailsAr: {
      type: String,
      default: '',
    },
    image: {
      type: String,
      default: '',
    },
    bgImage: {
      type: String,
      default: '',
    },
    section: {
      type: String,
      required: true,
      trim: true,
    },
    linkUrl: {
      type: String,
      trim: true,
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
    bgColor: {
      type: String,
      default: '#f3f4f6',
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
bannerCardSchema.index({ section: 1, isActive: 1, order: 1 });

const BannerCard = mongoose.model('BannerCard', bannerCardSchema);

export default BannerCard;
