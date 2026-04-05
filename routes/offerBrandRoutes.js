import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import OfferBrand from '../models/offerBrandModel.js';

const router = express.Router();

// Get all brands for a specific offer page
router.get('/page/:slug', async (req, res) => {
  try {
    const offerBrands = await OfferBrand.find({ offerPageSlug: req.params.slug })
      .populate('brand')
      .sort({ order: 1 });
    res.json(offerBrands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all offer brands (admin)
router.get('/', protect, admin, async (req, res) => {
  try {
    const offerBrands = await OfferBrand.find()
      .populate('brand')
      .sort({ offerPageSlug: 1, order: 1 });
    res.json(offerBrands);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single offer brand
router.get('/:id', async (req, res) => {
  try {
    const offerBrand = await OfferBrand.findById(req.params.id).populate('brand');
    if (offerBrand) {
      res.json(offerBrand);
    } else {
      res.status(404).json({ message: 'Offer brand not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create offer brand
router.post('/', protect, admin, async (req, res) => {
  try {
    const offerBrand = new OfferBrand(req.body);
    const createdOfferBrand = await offerBrand.save();
    const populatedOfferBrand = await OfferBrand.findById(createdOfferBrand._id).populate('brand');
    res.status(201).json(populatedOfferBrand);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update offer brand
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const offerBrand = await OfferBrand.findById(req.params.id);
    
    if (offerBrand) {
      offerBrand.offerPageSlug = req.body.offerPageSlug || offerBrand.offerPageSlug;
      offerBrand.brand = req.body.brand || offerBrand.brand;
      offerBrand.isActive = req.body.isActive !== undefined ? req.body.isActive : offerBrand.isActive;
      offerBrand.order = req.body.order !== undefined ? req.body.order : offerBrand.order;
      
      const updatedOfferBrand = await offerBrand.save();
      const populatedOfferBrand = await OfferBrand.findById(updatedOfferBrand._id).populate('brand');
      res.json(populatedOfferBrand);
    } else {
      res.status(404).json({ message: 'Offer brand not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete offer brand
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const offerBrand = await OfferBrand.findById(req.params.id);
    
    if (offerBrand) {
      await offerBrand.deleteOne();
      res.json({ message: 'Offer brand deleted' });
    } else {
      res.status(404).json({ message: 'Offer brand not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete all brands for a specific offer page
router.delete('/page/:slug', protect, admin, async (req, res) => {
  try {
    await OfferBrand.deleteMany({ offerPageSlug: req.params.slug });
    res.json({ message: 'All brands deleted for this offer page' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
