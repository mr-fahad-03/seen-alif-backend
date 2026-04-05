//

// ===================

import mongoose from "mongoose"

const orderSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    orderItems: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        image: { type: String, required: true },
        price: { type: Number, required: true },
        product: {
          type: mongoose.Schema.Types.ObjectId,
          required: false, // Optional for protection items
          ref: "Product",
        },
        // Color variation data
        selectedColorIndex: { type: Number, default: null },
        selectedColorData: {
          color: { type: String },
          image: { type: String },
          price: { type: Number },
          offerPrice: { type: Number },
          sku: { type: String },
        },
        // DOS/Windows variation data
        selectedDosIndex: { type: Number, default: null },
        selectedDosData: {
          dosType: { type: String },
          image: { type: String },
          price: { type: Number },
          offerPrice: { type: Number },
          sku: { type: String },
        },
        // Buyer protection fields
        isProtection: { type: Boolean, default: false },
        protectionFor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        protectionData: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "BuyerProtection",
        },
      },
    ],
    shippingAddress: {
      name: { type: String },
      email: { type: String },
      phone: { type: String },
      address: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
    },
    deliveryType: {
      type: String,
      required: true,
      enum: ["home", "pickup"],
      default: "home",
    },
    pickupDetails: {
      phone: { type: String },
      location: { type: String },
      storeId: { type: String },
    },
    paymentMethod: {
      type: String,
      required: true,
      default: "Cash on Delivery",
      enum: ["Cash on Delivery", "Credit Card", "Debit Card", "PayPal", "Bank Transfer", "cod", "card", "tabby", "tamara"],
    },
    // Store the actual payment provider used (tabby, tamara, card, cod)
    actualPaymentMethod: {
      type: String,
      enum: ["cod", "card", "tabby", "tamara", null],
      default: null,
    },
    paymentResult: {
      id: String,
      status: String,
      update_time: String,
      email_address: String,
      // Provider-specific fields
      tamara_order_id: String,
      tamara_checkout_id: String,
      tabby_payment_id: String,
      ngenius_order_ref: String,
      event_type: String,
      authorized_amount: Object,
      capture_id: String,
      captured_amount: Object,
      webhook_data: Object,
    },
    itemsPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    taxPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    shippingPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    discountAmount: {
      type: Number,
      default: 0.0,
    },
    couponCode: {
      type: String,
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    isPaid: {
      type: Boolean,
      required: true,
      default: false,
    },
    paidAt: {
      type: Date,
    },
    status: {
      type: String,
      required: true,
      default: "New",
      enum: [
        "New",
        "Processing",
        "Confirmed",
        "Ready for Shipment",
        "Shipped",
        "On the Way",
        "Out for Delivery",
        "Delivered",
        "On Hold",
        "Cancelled",
        "Returned",
        "Deleted",
      ],
    },
    trackingId: {
      type: String,
    },
    estimatedDelivery: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    cancelReason: {
      type: String,
    },
    notes: {
      type: String,
    },
    customerNotes: {
      type: String,
      maxlength: 500,
    },
    sellerComments: {
      type: String,
    },
    sellerMessage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
)

const Order = mongoose.model("Order", orderSchema)

export default Order
