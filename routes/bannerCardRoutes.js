import express from 'express';
import BannerCard from '../models/bannerCardModel.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { logActivity } from '../middleware/permissionMiddleware.js';
import { translateEnToAr } from "../utils/translateWithFallback.js"

const router = express.Router();

const translateText = translateEnToAr

// @desc    Get all banner cards (admin)
// @route   GET /api/banner-cards/admin
// @access  Private/Admin
router.get('/admin', protect, admin, async (req, res) => {
  try {
    const bannerCards = await BannerCard.find({})
      .sort({ order: 1, createdAt: -1 });
    res.json(bannerCards);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get banner cards by section (public)
// @route   GET /api/banner-cards/section/:section
// @access  Public
router.get('/section/:section', async (req, res) => {
  try {
    const { section } = req.params;
    const bannerCards = await BannerCard.find({
      section: section,
      isActive: true,
    })
      .sort({ order: 1, createdAt: -1 });
    res.json(bannerCards);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get single banner card
// @route   GET /api/banner-cards/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const bannerCard = await BannerCard.findById(req.params.id);
    
    if (bannerCard) {
      res.json(bannerCard);
    } else {
      res.status(404).json({ message: 'Banner card not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a banner card
// @route   POST /api/banner-cards
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
  try {
    const {
      name,
      slug,
      details,
      image,
      bgImage,
      section,
      linkUrl,
      isActive,
      order,
      bgColor,
    } = req.body;

    // Check if slug already exists
    const existingCard = await BannerCard.findOne({ slug });
    if (existingCard) {
      return res.status(400).json({ message: 'Slug already exists' });
    }

    // Translate fields
    const nameAr = await translateText(name);
    const detailsAr = await translateText(details || "");

    const bannerCard = new BannerCard({
      name,
      nameAr,
      slug,
      details,
      detailsAr,
      image,
      bgImage: bgImage || '',
      section,
      linkUrl,
      isActive: isActive !== undefined ? isActive : true,
      order: order || 1,
      bgColor: bgColor || '#f3f4f6',
    });

    const createdBannerCard = await bannerCard.save();

    // Log activity
    await logActivity(req, "CREATE", "BANNER_CARDS", `Created banner card: ${createdBannerCard.name}`, createdBannerCard._id, createdBannerCard.name);

    res.status(201).json(createdBannerCard);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Update a banner card
// @route   PUT /api/banner-cards/:id
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const {
      name,
      slug,
      details,
      image,
      bgImage,
      section,
      linkUrl,
      isActive,
      order,
      bgColor,
    } = req.body;

    const bannerCard = await BannerCard.findById(req.params.id);

    if (bannerCard) {
      // Check if slug is being changed and if it already exists
      if (slug && slug !== bannerCard.slug) {
        const existingCard = await BannerCard.findOne({ slug });
        if (existingCard) {
          return res.status(400).json({ message: 'Slug already exists' });
        }
      }

      bannerCard.name = name || bannerCard.name;
      bannerCard.slug = slug || bannerCard.slug;
      bannerCard.details = details !== undefined ? details : bannerCard.details;
      bannerCard.image = image || bannerCard.image;
      bannerCard.bgImage = bgImage !== undefined ? bgImage : bannerCard.bgImage;
      bannerCard.section = section || bannerCard.section;
      bannerCard.linkUrl = linkUrl !== undefined ? linkUrl : bannerCard.linkUrl;
      bannerCard.isActive = isActive !== undefined ? isActive : bannerCard.isActive;
      bannerCard.order = order !== undefined ? order : bannerCard.order;
      bannerCard.bgColor = bgColor || bannerCard.bgColor;

      // Translate updated fields
      if (name !== undefined) bannerCard.nameAr = await translateText(bannerCard.name);
      if (details !== undefined) bannerCard.detailsAr = await translateText(bannerCard.details);

      const updatedBannerCard = await bannerCard.save();

      // Log activity
      await logActivity(req, "UPDATE", "BANNER_CARDS", `Updated banner card: ${updatedBannerCard.name}`, updatedBannerCard._id, updatedBannerCard.name);

      res.json(updatedBannerCard);
    } else {
      res.status(404).json({ message: 'Banner card not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Delete a banner card
// @route   DELETE /api/banner-cards/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const bannerCard = await BannerCard.findById(req.params.id);

    if (bannerCard) {
      const cardName = bannerCard.name;
      const cardId = bannerCard._id;

      await bannerCard.deleteOne();

      // Log activity
      await logActivity(req, "DELETE", "BANNER_CARDS", `Deleted banner card: ${cardName}`, cardId, cardName);

      res.json({ message: 'Banner card removed' });
    } else {
      res.status(404).json({ message: 'Banner card not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
