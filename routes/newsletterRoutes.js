import express from "express";
import NewsletterSubscriber from "../models/newsletterSubscriberModel.js";
import EmailTemplate from "../models/emailTemplateModel.js";
import { sendNewsletterConfirmation, sendEmail } from "../utils/emailService.js";

const router = express.Router();

// POST /api/newsletter/subscribe
router.post("/subscribe", async (req, res) => {
  try {
    const { email, preferences } = req.body;
    if (!email || !preferences || !Array.isArray(preferences) || preferences.length === 0) {
      return res.status(400).json({ message: "Email and preferences are required." });
    }
    // Upsert (update if exists, insert if not)
    const subscriber = await NewsletterSubscriber.findOneAndUpdate(
      { email },
      { $set: { preferences } },
      { upsert: true, new: true }
    );
    // Send confirmation email
    await sendNewsletterConfirmation(email, preferences);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to subscribe." });
  }
});

// GET /api/newsletter/subscribers
router.get("/subscribers", async (req, res) => {
  try {
    const all = await NewsletterSubscriber.find().sort({ createdAt: -1 });
    res.json(all);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to fetch subscribers." });
  }
});

// POST /api/newsletter/bulk-send
router.post("/bulk-send", async (req, res) => {
  try {
    const { userIds, templateId } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0 || !templateId) {
      return res.status(400).json({ message: "User IDs and template ID are required." });
    }
    const users = await NewsletterSubscriber.find({ _id: { $in: userIds } });
    const template = await EmailTemplate.findById(templateId);
    if (!template) return res.status(404).json({ message: "Template not found" });
    // Send emails in parallel (could be throttled for large lists)
    await Promise.all(users.map(user => {
      let html = template.html
        .replace(/{{email}}/g, user.email)
        .replace(/{{preferences}}/g, (user.preferences || []).join(", "));
      return sendEmail(
        user.email,
        template.subject,
        html,
        "support"
      );
    }));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to send emails." });
  }
});

export default router; 