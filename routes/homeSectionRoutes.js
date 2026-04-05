import express from 'express';
import HomeSection from '../models/homeSectionModel.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { deleteLocalFile, isCloudinaryUrl } from '../config/multer.js';
import { logActivity } from '../middleware/permissionMiddleware.js';
import { cacheMiddleware, invalidateCache } from '../middleware/cacheMiddleware.js';
import { translateEnToAr } from "../utils/translateWithFallback.js"

const router = express.Router();

const translateText = translateEnToAr

// @desc    Get all home sections
// @route   GET /api/home-sections
// @access  Public
router.get('/', cacheMiddleware('homeSections'), async (req, res) => {
  try {
    const sections = await HomeSection.find({})
      .select('name nameAr slug key description descriptionAr isActive order sectionType settings')
      .sort({ order: 1, createdAt: -1 });
    res.json(sections);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get active home sections only
// @route   GET /api/home-sections/active
// @access  Public
router.get('/active', cacheMiddleware('homeSections', { keyPrefix: 'active' }), async (req, res) => {
  try {
    const sections = await HomeSection.find({ isActive: true })
      .sort({ order: 1 });
    res.json(sections);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get single home section
// @route   GET /api/home-sections/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const section = await HomeSection.findById(req.params.id);
    
    if (section) {
      res.json(section);
    } else {
      res.status(404).json({ message: 'Section not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a home section
// @route   POST /api/home-sections
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
  try {
    const {
      name,
      slug,
      key,
      description,
      isActive,
      order,
      sectionType,
      settings,
    } = req.body;

    // Check if slug already exists
    const existingSlug = await HomeSection.findOne({ slug });
    if (existingSlug) {
      return res.status(400).json({ message: 'Slug already exists' });
    }

    // Check if key already exists
    const existingKey = await HomeSection.findOne({ key });
    if (existingKey) {
      return res.status(400).json({ message: 'Key already exists' });
    }

    // Check if order already exists
    const existingOrder = await HomeSection.findOne({ order });
    if (existingOrder) {
      return res.status(400).json({ message: `Order ${order} is already used by another section. Please change the existing section's order first.` });
    }

    // Translate fields
    const nameAr = await translateText(name);
    const descriptionAr = await translateText(description || "");

    const section = new HomeSection({
      name,
      nameAr,
      slug,
      key,
      description,
      descriptionAr,
      isActive: isActive !== undefined ? isActive : true,
      order: order || 1,
      sectionType: sectionType || 'banner-cards',
      settings: settings || {},
    });

    const createdSection = await section.save();

    // Log activity
    await logActivity(req, "CREATE", "HOME_SECTIONS", `Created home section: ${createdSection.name}`, createdSection._id, createdSection.name);

    // Invalidate home sections cache
    await invalidateCache('homeSections');

    res.status(201).json(createdSection);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Update a home section
// @route   PUT /api/home-sections/:id
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const {
      name,
      slug,
      key,
      description,
      isActive,
      order,
      sectionType,
      settings,
    } = req.body;

    const section = await HomeSection.findById(req.params.id);

    if (section) {
      // Check if slug is being changed and if it already exists
      if (slug && slug !== section.slug) {
        const existingSlug = await HomeSection.findOne({ slug });
        if (existingSlug) {
          return res.status(400).json({ message: 'Slug already exists' });
        }
      }

      // Check if key is being changed and if it already exists
      if (key && key !== section.key) {
        const existingKey = await HomeSection.findOne({ key });
        if (existingKey) {
          return res.status(400).json({ message: 'Key already exists' });
        }
      }

      // Check if order is being changed and if it already exists
      if (order !== undefined && order !== section.order) {
        const existingOrder = await HomeSection.findOne({ order });
        if (existingOrder) {
          return res.status(400).json({ message: `Order ${order} is already used by another section. Please change the existing section's order first.` });
        }
      }

      console.log('🟡 SERVER UPDATE: Received settings from client:', JSON.stringify(settings, null, 2));
      console.log('🟡 SERVER UPDATE: Current section settings before update:', JSON.stringify(section.settings, null, 2));
      
      section.name = name || section.name;
      section.slug = slug || section.slug;
      section.key = key || section.key;
      section.description = description !== undefined ? description : section.description;
      section.isActive = isActive !== undefined ? isActive : section.isActive;
      section.order = order !== undefined ? order : section.order;
      section.sectionType = sectionType || section.sectionType;
      section.settings = settings !== undefined ? settings : section.settings;

      // Translate updated fields
      if (name !== undefined) section.nameAr = await translateText(section.name);
      if (description !== undefined) section.descriptionAr = await translateText(section.description);

      console.log('🟡 SERVER UPDATE: Section settings after assignment:', JSON.stringify(section.settings, null, 2));
      const updatedSection = await section.save();
      console.log('🟢 SERVER UPDATE: Saved section settings:', JSON.stringify(updatedSection.settings, null, 2));

      // Log activity
      await logActivity(req, "UPDATE", "HOME_SECTIONS", `Updated home section: ${updatedSection.name}`, updatedSection._id, updatedSection.name);

      // Invalidate home sections cache
      await invalidateCache('homeSections');

      res.json(updatedSection);
    } else {
      res.status(404).json({ message: 'Section not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Helper function to extract and delete images from settings object
const deleteSettingsImages = async (settings) => {
  if (!settings) return;

  // Check for backgroundImage
  if (settings.backgroundImage && !isCloudinaryUrl(settings.backgroundImage)) {
    try {
      await deleteLocalFile(settings.backgroundImage);
    } catch (err) {
      console.error("Error deleting background image:", err);
    }
  }

  // Check for sideImage
  if (settings.sideImage && !isCloudinaryUrl(settings.sideImage)) {
    try {
      await deleteLocalFile(settings.sideImage);
    } catch (err) {
      console.error("Error deleting side image:", err);
    }
  }

  // Check for cards array with images
  if (settings.cards && Array.isArray(settings.cards)) {
    for (const card of settings.cards) {
      if (card.image && !isCloudinaryUrl(card.image)) {
        try {
          await deleteLocalFile(card.image);
        } catch (err) {
          console.error("Error deleting card image:", err);
        }
      }
    }
  }

  // Check for banners array with images
  if (settings.banners && Array.isArray(settings.banners)) {
    for (const banner of settings.banners) {
      if (banner.image && !isCloudinaryUrl(banner.image)) {
        try {
          await deleteLocalFile(banner.image);
        } catch (err) {
          console.error("Error deleting banner image:", err);
        }
      }
    }
  }
};

// @desc    Delete a home section
// @route   DELETE /api/home-sections/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const section = await HomeSection.findById(req.params.id);

    if (section) {
      const sectionName = section.name;
      const sectionId = section._id;

      // Delete images from settings
      await deleteSettingsImages(section.settings);

      await section.deleteOne();

      // Log activity
      await logActivity(req, "DELETE", "HOME_SECTIONS", `Deleted home section: ${sectionName}`, sectionId, sectionName);

      // Invalidate home sections cache
      await invalidateCache('homeSections');

      res.json({ message: 'Section removed' });
    } else {
      res.status(404).json({ message: 'Section not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Reorder sections
// @route   PUT /api/home-sections/reorder/batch
// @access  Private/Admin
router.put('/reorder/batch', protect, admin, async (req, res) => {
  try {
    const { sections } = req.body; // Array of { id, order }

    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ message: 'Invalid sections data' });
    }

    const updatePromises = sections.map(({ id, order }) =>
      HomeSection.findByIdAndUpdate(id, { order }, { new: true })
    );

    await Promise.all(updatePromises);
    
    // Invalidate home sections cache
    await invalidateCache('homeSections');
    
    const updatedSections = await HomeSection.find({}).sort({ order: 1 });
    res.json(updatedSections);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
