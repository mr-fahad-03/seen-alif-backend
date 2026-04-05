import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import GamingZoneBrand from '../models/gamingZoneBrandModel.js';

const router = express.Router();

// Get all brands for a specific gaming zone page
router.get('/page/:slug', async (req, res) => {
  try {
    const gamingZoneBrands = await GamingZoneBrand.find({ gamingZonePageSlug: req.params.slug })
      .populate('brand')
      .sort({ order: 1 });
    res.json(gamingZoneBrands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all gaming zone brands (admin)
router.get('/', protect, admin, async (req, res) => {
  try {
    const gamingZoneBrands = await GamingZoneBrand.find()
      .populate('brand')
      .sort({ gamingZonePageSlug: 1, order: 1 });
    res.json(gamingZoneBrands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single gaming zone brand
router.get('/:id', async (req, res) => {
  try {
    const gamingZoneBrand = await GamingZoneBrand.findById(req.params.id).populate('brand');
    if (gamingZoneBrand) {
      res.json(gamingZoneBrand);
    } else {
      res.status(404).json({ message: 'Gaming zone brand not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create gaming zone brand
router.post('/', protect, admin, async (req, res) => {
  try {
    const gamingZoneBrand = new GamingZoneBrand(req.body);
    const createdGamingZoneBrand = await gamingZoneBrand.save();
    const populatedGamingZoneBrand = await GamingZoneBrand.findById(createdGamingZoneBrand._id).populate('brand');
    res.status(201).json(populatedGamingZoneBrand);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update gaming zone brand
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const gamingZoneBrand = await GamingZoneBrand.findById(req.params.id);
    
    if (gamingZoneBrand) {
      gamingZoneBrand.gamingZonePageSlug = req.body.gamingZonePageSlug || gamingZoneBrand.gamingZonePageSlug;
      gamingZoneBrand.brand = req.body.brand || gamingZoneBrand.brand;
      gamingZoneBrand.isActive = req.body.isActive !== undefined ? req.body.isActive : gamingZoneBrand.isActive;
      gamingZoneBrand.order = req.body.order !== undefined ? req.body.order : gamingZoneBrand.order;
      
      const updatedGamingZoneBrand = await gamingZoneBrand.save();
      const populatedGamingZoneBrand = await GamingZoneBrand.findById(updatedGamingZoneBrand._id).populate('brand');
      res.json(populatedGamingZoneBrand);
    } else {
      res.status(404).json({ message: 'Gaming zone brand not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete gaming zone brand
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const gamingZoneBrand = await GamingZoneBrand.findById(req.params.id);
    
    if (gamingZoneBrand) {
      await gamingZoneBrand.deleteOne();
      res.json({ message: 'Gaming zone brand deleted' });
    } else {
      res.status(404).json({ message: 'Gaming zone brand not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete all brands for a specific gaming zone page
router.delete('/page/:slug', protect, admin, async (req, res) => {
  try {
    await GamingZoneBrand.deleteMany({ gamingZonePageSlug: req.params.slug });
    res.json({ message: 'All brands deleted for this gaming zone page' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
