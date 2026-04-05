import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import GamingZoneCategory from '../models/gamingZoneCategoryModel.js';
import Category from '../models/categoryModel.js';
import SubCategory from '../models/subCategoryModel.js';

const router = express.Router();

// Helper function to populate categories manually
const populateCategory = async (gamingZoneCategory) => {
  if (!gamingZoneCategory.category) return gamingZoneCategory;
  
  try {
    // Try to find in Category collection first
    let categoryData = await Category.findById(gamingZoneCategory.category).lean();
    
    // If not found, try SubCategory collection
    if (!categoryData) {
      categoryData = await SubCategory.findById(gamingZoneCategory.category).lean();
    }
    
    return {
      ...gamingZoneCategory.toObject ? gamingZoneCategory.toObject() : gamingZoneCategory,
      category: categoryData
    };
  } catch (error) {
    console.error('Error populating category:', error);
    return gamingZoneCategory;
  }
};

// Get all categories for a specific gaming zone page
router.get('/page/:slug', async (req, res) => {
  try {
    const gamingZoneCategories = await GamingZoneCategory.find({ gamingZonePageSlug: req.params.slug })
      .sort({ order: 1 })
      .lean();
    
    // Manually populate categories
    const populated = await Promise.all(
      gamingZoneCategories.map(gc => populateCategory({ ...gc, toObject: () => gc }))
    );
    
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all gaming zone categories (admin)
router.get('/', protect, admin, async (req, res) => {
  try {
    const gamingZoneCategories = await GamingZoneCategory.find()
      .sort({ gamingZonePageSlug: 1, order: 1 })
      .lean();
    
    // Manually populate categories
    const populated = await Promise.all(
      gamingZoneCategories.map(gc => populateCategory({ ...gc, toObject: () => gc }))
    );
    
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single gaming zone category
router.get('/:id', async (req, res) => {
  try {
    const gamingZoneCategory = await GamingZoneCategory.findById(req.params.id).lean();
    if (gamingZoneCategory) {
      const populated = await populateCategory({ ...gamingZoneCategory, toObject: () => gamingZoneCategory });
      res.json(populated);
    } else {
      res.status(404).json({ message: 'Gaming zone category not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create gaming zone category
router.post('/', protect, admin, async (req, res) => {
  try {
    const gamingZoneCategory = new GamingZoneCategory(req.body);
    const createdGamingZoneCategory = await gamingZoneCategory.save();
    const populated = await populateCategory(createdGamingZoneCategory);
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update gaming zone category
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const gamingZoneCategory = await GamingZoneCategory.findById(req.params.id);
    
    if (gamingZoneCategory) {
      gamingZoneCategory.gamingZonePageSlug = req.body.gamingZonePageSlug || gamingZoneCategory.gamingZonePageSlug;
      gamingZoneCategory.category = req.body.category || gamingZoneCategory.category;
      gamingZoneCategory.categoryType = req.body.categoryType || gamingZoneCategory.categoryType;
      gamingZoneCategory.isActive = req.body.isActive !== undefined ? req.body.isActive : gamingZoneCategory.isActive;
      gamingZoneCategory.order = req.body.order !== undefined ? req.body.order : gamingZoneCategory.order;
      
      const updatedGamingZoneCategory = await gamingZoneCategory.save();
      const populated = await populateCategory(updatedGamingZoneCategory);
      res.json(populated);
    } else {
      res.status(404).json({ message: 'Gaming zone category not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete gaming zone category
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const gamingZoneCategory = await GamingZoneCategory.findById(req.params.id);
    
    if (gamingZoneCategory) {
      await gamingZoneCategory.deleteOne();
      res.json({ message: 'Gaming zone category deleted' });
    } else {
      res.status(404).json({ message: 'Gaming zone category not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete all categories for a specific gaming zone page
router.delete('/page/:slug', protect, admin, async (req, res) => {
  try {
    await GamingZoneCategory.deleteMany({ gamingZonePageSlug: req.params.slug });
    res.json({ message: 'All categories deleted for this gaming zone page' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
