import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import GamingZonePage from '../models/gamingZonePageModel.js';
import GamingZoneCategory from '../models/gamingZoneCategoryModel.js';
import Product from '../models/productModel.js';
import SubCategory from '../models/subCategoryModel.js';
import { deleteLocalFile, isCloudinaryUrl } from '../config/multer.js';

const router = express.Router();

// Get all gaming zone pages
router.get('/', async (req, res) => {
  try {
    const gamingZonePages = await GamingZonePage.find().sort({ order: 1 });
    res.json(gamingZonePages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get active gaming zone pages
router.get('/active', async (req, res) => {
  try {
    const gamingZonePages = await GamingZonePage.find({ isActive: true }).sort({ order: 1 });
    res.json(gamingZonePages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single gaming zone page by ID
router.get('/:id', async (req, res) => {
  try {
    const gamingZonePage = await GamingZonePage.findById(req.params.id);
    if (gamingZonePage) {
      res.json(gamingZonePage);
    } else {
      res.status(404).json({ message: 'Gaming zone page not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get gaming zone page by slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const gamingZonePage = await GamingZonePage.findOne({ slug: req.params.slug });
    if (gamingZonePage) {
      res.json(gamingZonePage);
    } else {
      res.status(404).json({ message: 'Gaming zone page not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get products for a gaming zone page (auto-fetched based on selected categories)
router.get('/slug/:slug/products', async (req, res) => {
  try {
    // Get all categories for this gaming zone page
    const gamingZoneCategories = await GamingZoneCategory.find({
      gamingZonePageSlug: req.params.slug,
      isActive: true,
    });

    if (!gamingZoneCategories || gamingZoneCategories.length === 0) {
      return res.json({ products: [], currentPage: 1, totalPages: 0, totalProducts: 0 });
    }

    // Extract category IDs
    const categoryIds = gamingZoneCategories.map(gc => gc.category);

    // Build query to find all products that match the selected categories
    const productQuery = {
      isDeleted: { $ne: true },
      isActive: true,
      $or: categoryIds.flatMap(catId => [
        { parentCategory: catId },
        { category: catId },
        { subCategory2: catId },
        { subCategory3: catId },
        { subCategory4: catId },
      ]),
    };

    // Fetch products with pagination support
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const requestedLimit = parseInt(req.query.limit) || 20;
    const limit = Math.min(Math.max(requestedLimit, 1), 10000);
    const skip = (page - 1) * limit;

    const products = await Product.find(productQuery)
      .select(
        "name nameAr slug sku price offerPrice discount image stockStatus stockStatusAr countInStock brand parentCategory category subCategory2 subCategory3 subCategory4 rating numReviews createdAt",
      )
      .populate('brand', 'name nameAr slug logo')
      .populate('parentCategory', 'name nameAr slug')
      .populate('category', 'name nameAr slug')
      .populate('subCategory2', 'name nameAr slug')
      .populate('subCategory3', 'name nameAr slug')
      .populate('subCategory4', 'name nameAr slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalProducts = await Product.countDocuments(productQuery);

    res.json({
      products,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      totalProducts,
    });
  } catch (error) {
    console.error('Error fetching gaming zone products:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create gaming zone page
router.post('/', protect, admin, async (req, res) => {
  try {
    const gamingZonePage = new GamingZonePage(req.body);
    const createdGamingZonePage = await gamingZonePage.save();
    res.status(201).json(createdGamingZonePage);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update gaming zone page
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const gamingZonePage = await GamingZonePage.findById(req.params.id);
    
    if (gamingZonePage) {
      gamingZonePage.name = req.body.name || gamingZonePage.name;
      gamingZonePage.slug = req.body.slug || gamingZonePage.slug;
      gamingZonePage.heroImage = req.body.heroImage !== undefined ? req.body.heroImage : gamingZonePage.heroImage;
      gamingZonePage.cardImages = req.body.cardImages !== undefined ? req.body.cardImages : gamingZonePage.cardImages;
      gamingZonePage.isActive = req.body.isActive !== undefined ? req.body.isActive : gamingZonePage.isActive;
      gamingZonePage.order = req.body.order !== undefined ? req.body.order : gamingZonePage.order;
      
      const updatedGamingZonePage = await gamingZonePage.save();
      res.json(updatedGamingZonePage);
    } else {
      res.status(404).json({ message: 'Gaming zone page not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete gaming zone page
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const gamingZonePage = await GamingZonePage.findById(req.params.id);
    
    if (gamingZonePage) {
      // Delete hero image
      if (gamingZonePage.heroImage && !isCloudinaryUrl(gamingZonePage.heroImage)) {
        try {
          await deleteLocalFile(gamingZonePage.heroImage);
        } catch (err) {
          console.error("Error deleting hero image:", err);
        }
      }

      // Delete card images
      if (gamingZonePage.cardImages && gamingZonePage.cardImages.length > 0) {
        for (const card of gamingZonePage.cardImages) {
          if (card.image && !isCloudinaryUrl(card.image)) {
            try {
              await deleteLocalFile(card.image);
            } catch (err) {
              console.error("Error deleting card image:", err);
            }
          }
        }
      }

      await gamingZonePage.deleteOne();
      res.json({ message: 'Gaming zone page deleted' });
    } else {
      res.status(404).json({ message: 'Gaming zone page not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

