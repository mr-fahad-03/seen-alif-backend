import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/userModel.js";
import Product from "../models/productModel.js";
import Order from "../models/orderModel.js";

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const seedOrders = async () => {
  try {
    await connectDB();

    const users = await User.find({});
    const products = await Product.find({});

    if (!users.length || !products.length) {
      console.error("Users or products not found. Seed them first.");
      process.exit(1);
    }

    await Order.deleteMany();

    const statuses = [
      "Processing",
      "Confirmed",
      "Shipped",
      "Out for Delivery",
      "Delivered",
      "Cancelled",
      "Returned",
    ];

    const paymentMethods = [
      "Cash on Delivery",
      "Credit Card",
      "Debit Card",
      "PayPal",
      "Bank Transfer",
    ];

    const orders = [];

    for (let i = 0; i < 30; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const selectedProducts = products.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 3) + 1);

      let itemsPrice = 0;
      const orderItems = selectedProducts.map((product) => {
        const quantity = Math.floor(Math.random() * 3) + 1;
        const price = product.offerPrice > 0 ? product.offerPrice : product.price;
        itemsPrice += price * quantity;

        return {
          name: product.name,
          quantity,
          image: product.image,
          price,
          product: product._id,
        };
      });

      const taxPrice = +(itemsPrice * 0.1).toFixed(2);
      const shippingPrice = itemsPrice > 500 ? 0 : 15;
      const discountAmount = Math.random() > 0.8 ? +(Math.random() * 50).toFixed(2) : 0;
      const totalPrice = +(itemsPrice + taxPrice + shippingPrice - discountAmount).toFixed(2);

      const status = statuses[Math.floor(Math.random() * statuses.length)];

      const order = {
        user: user._id,
        orderItems,
        shippingAddress: {
          name: user.name,
          email: user.email,
          phone: "+1" + (Math.floor(Math.random() * 9000000000) + 1000000000),
          address: "123 Example St",
          city: "New York",
          state: "NY",
          zipCode: "10001",
        },
        paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
        paymentResult: {
          id: `PAY-${Math.random().toString(36).substring(2, 10)}`,
          status: "Completed",
          update_time: new Date().toISOString(),
          email_address: user.email,
        },
        itemsPrice,
        taxPrice,
        shippingPrice,
        discountAmount,
        couponCode: discountAmount > 0 ? "SAVE10" : undefined,
        totalPrice,
        isPaid: Math.random() > 0.3,
        paidAt: new Date(),
        status,
        trackingId: `TRK-${Math.floor(Math.random() * 10000000)}`,
        estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        deliveredAt: status === "Delivered" ? new Date() : undefined,
        notes: Math.random() > 0.7 ? "Leave at front door." : "",
      };

      orders.push(order);
    }

    await Order.insertMany(orders);
    console.log(`${orders.length} orders seeded successfully!`);
    process.exit(0);
  } catch (err) {
    console.error("Error seeding orders:", err);
    process.exit(1);
  }
};

seedOrders();
