import mongoose from 'mongoose';

const requestCallbackSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    countryCode: { type: String },
    customerNote: { type: String },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: { type: String },
    productLink: { type: String },
    status: {
      type: String,
      enum: ['pending', 'done', 'spam'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

const RequestCallback = mongoose.model('RequestCallback', requestCallbackSchema);
export default RequestCallback;
