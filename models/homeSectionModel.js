import mongoose from 'mongoose';

const homeSectionSchema = new mongoose.Schema(
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
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    nameAr: {
      type: String,
      default: '',
    },
    descriptionAr: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 1,
      min: 1,
      unique: true,
    },
    sectionType: {
      type: String,
      enum: [
        'arrow-slider',
        'background-image',
        'cards-left-image-right',
        'cards-right-image-left',
        'simple-cards',
        'vertical-grid',
        'banner-cards', // Keep for backward compatibility
        'hero',
        'products',
        'custom'
      ],
      default: 'arrow-slider',
    },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
homeSectionSchema.index({ isActive: 1, order: 1 });

const HomeSection = mongoose.model('HomeSection', homeSectionSchema);

export default HomeSection;
