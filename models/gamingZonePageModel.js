import mongoose from 'mongoose';

const gamingZonePageSchema = new mongoose.Schema(
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
    heroImage: {
      type: String,
      default: '',
    },
    cardImages: [
      {
        image: {
          type: String,
          default: '',
        },
        order: {
          type: Number,
          default: 1,
        },
      }
    ],
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

// Validate max 3 card images
gamingZonePageSchema.pre('save', function(next) {
  if (this.cardImages && this.cardImages.length > 3) {
    next(new Error('Maximum 3 card images allowed'));
  } else {
    next();
  }
});

const GamingZonePage = mongoose.model('GamingZonePage', gamingZonePageSchema);

export default GamingZonePage;
