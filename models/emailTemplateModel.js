import mongoose from "mongoose";

const emailTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true, enum: ["order", "verification", "newsletter", "custom"] },
  subject: { type: String, required: true },
  html: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const EmailTemplate = mongoose.model("EmailTemplate", emailTemplateSchema);

export default EmailTemplate; 