import express from "express";
import EmailTemplate from "../models/emailTemplateModel.js";
import asyncHandler from "express-async-handler";

const router = express.Router();

// Get all templates
router.get("/", asyncHandler(async (req, res) => {
  const templates = await EmailTemplate.find().sort({ createdAt: -1 });
  res.json(templates);
}));

// Get templates by type
router.get("/type/:type", asyncHandler(async (req, res) => {
  const templates = await EmailTemplate.find({ type: req.params.type });
  res.json(templates);
}));

// Get template by id
router.get("/:id", asyncHandler(async (req, res) => {
  const template = await EmailTemplate.findById(req.params.id);
  if (!template) return res.status(404).json({ message: "Not found" });
  res.json(template);
}));

// Create template
router.post("/", asyncHandler(async (req, res) => {
  const { name, type, subject, html, isDefault } = req.body;
  if (isDefault) {
    // Unset previous default for this type
    await EmailTemplate.updateMany({ type, isDefault: true }, { $set: { isDefault: false } });
  }
  const template = await EmailTemplate.create({ name, type, subject, html, isDefault });
  res.status(201).json(template);
}));

// Update template
router.put("/:id", asyncHandler(async (req, res) => {
  const { name, type, subject, html, isDefault } = req.body;
  if (isDefault) {
    await EmailTemplate.updateMany({ type, isDefault: true }, { $set: { isDefault: false } });
  }
  const template = await EmailTemplate.findByIdAndUpdate(
    req.params.id,
    { name, type, subject, html, isDefault },
    { new: true }
  );
  if (!template) return res.status(404).json({ message: "Not found" });
  res.json(template);
}));

// Delete template
router.delete("/:id", asyncHandler(async (req, res) => {
  const template = await EmailTemplate.findByIdAndDelete(req.params.id);
  if (!template) return res.status(404).json({ message: "Not found" });
  res.json({ message: "Deleted" });
}));

// Set default template for a type
router.patch("/:id/default", asyncHandler(async (req, res) => {
  const template = await EmailTemplate.findById(req.params.id);
  if (!template) return res.status(404).json({ message: "Not found" });
  await EmailTemplate.updateMany({ type: template.type, isDefault: true }, { $set: { isDefault: false } });
  template.isDefault = true;
  await template.save();
  res.json(template);
}));

export default router; 