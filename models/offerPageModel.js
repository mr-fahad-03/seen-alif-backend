import mongoose from 'mongoose';

const offerPageSchema = new mongoose.Schema(
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
offerPageSchema.pre('save', function(next) {
  if (this.cardImages && this.cardImages.length > 3) {
    next(new Error('Maximum 3 card images allowed'));
  } else {
    next();
  }
});

const OfferPage = mongoose.model('OfferPage', offerPageSchema);

export default OfferPage;
