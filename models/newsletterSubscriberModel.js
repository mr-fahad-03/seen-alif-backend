import mongoose from "mongoose";

const newsletterSubscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  preferences: [{ type: String, enum: ["all", "promotions", "events"] }],
  createdAt: { type: Date, default: Date.now },
});

const NewsletterSubscriber = mongoose.model("NewsletterSubscriber", newsletterSubscriberSchema);

export default NewsletterSubscriber; 