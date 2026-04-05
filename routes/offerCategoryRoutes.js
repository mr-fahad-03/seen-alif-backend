import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import OfferCategory from '../models/offerCategoryModel.js';
import Category from '../models/categoryModel.js';
import SubCategory from '../models/subCategoryModel.js';

const router = express.Router();

// Helper function to populate categories manually
const populateCategory = async (offerCategory) => {
  if (!offerCategory.category) return offerCategory;
  
  try {
    // Try to find in Category collection first
    let categoryData = await Category.findById(offerCategory.category).lean();
    
    // If not found, try SubCategory collection
    if (!categoryData) {
      categoryData = await SubCategory.findById(offerCategory.category).lean();
    }
    
    return {
      ...offerCategory.toObject ? offerCategory.toObject() : offerCategory,
      category: categoryData
    };
  } catch (error) {
    console.error('Error populating category:', error);
    return offerCategory;
  }
};

// Get all categories for a specific offer page
router.get('/page/:slug', async (req, res) => {
  try {
    const offerCategories = await OfferCategory.find({ offerPageSlug: req.params.slug })
      .sort({ order: 1 })
      .lean();
    
    // Manually populate categories
    const populated = await Promise.all(
      offerCategories.map(oc => populateCategory({ ...oc, toObject: () => oc }))
    );
    
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all offer categories (admin)
router.get('/', protect, admin, async (req, res) => {
  try {
    const offerCategories = await OfferCategory.find()
      .sort({ offerPageSlug: 1, order: 1 })
      .lean();
    
    // Manually populate categories
    const populated = await Promise.all(
      offerCategories.map(oc => populateCategory({ ...oc, toObject: () => oc }))
    );
    
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single offer category
router.get('/:id', async (req, res) => {
  try {
    const offerCategory = await OfferCategory.findById(req.params.id).lean();
    if (offerCategory) {
      const populated = await populateCategory({ ...offerCategory, toObject: () => offerCategory });
      res.json(populated);
    } else {
      res.status(404).json({ message: 'Offer category not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create offer category
router.post('/', protect, admin, async (req, res) => {
  try {
    const offerCategory = new OfferCategory(req.body);
    const createdOfferCategory = await offerCategory.save();
    const populated = await populateCategory(createdOfferCategory);
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update offer category
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const offerCategory = await OfferCategory.findById(req.params.id);
    
    if (offerCategory) {
      offerCategory.offerPageSlug = req.body.offerPageSlug || offerCategory.offerPageSlug;
      offerCategory.category = req.body.category || offerCategory.category;
      offerCategory.categoryType = req.body.categoryType || offerCategory.categoryType;
      offerCategory.isActive = req.body.isActive !== undefined ? req.body.isActive : offerCategory.isActive;
      offerCategory.order = req.body.order !== undefined ? req.body.order : offerCategory.order;
      
      const updatedOfferCategory = await offerCategory.save();
      const populated = await populateCategory(updatedOfferCategory);
      res.json(populated);
    } else {
      res.status(404).json({ message: 'Offer category not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete offer category
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const offerCategory = await OfferCategory.findById(req.params.id);
    
    if (offerCategory) {
      await offerCategory.deleteOne();
      res.json({ message: 'Offer category deleted' });
    } else {
      res.status(404).json({ message: 'Offer category not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete all categories for a specific offer page
router.delete('/page/:slug', protect, admin, async (req, res) => {
  try {
    await OfferCategory.deleteMany({ offerPageSlug: req.params.slug });
    res.json({ message: 'All categories deleted for this offer page' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
