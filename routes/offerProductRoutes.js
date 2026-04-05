import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import { cacheMiddleware } from '../middleware/cacheMiddleware.js';
import OfferProduct from '../models/offerProductModel.js';

const router = express.Router();
const OFFER_PRODUCT_SELECT = [
  'name',
  'nameAr',
  'slug',
  'sku',
  'price',
  'offerPrice',
  'discount',
  'oldPrice',
  'image',
  'stockStatus',
  'stockStatusAr',
  'countInStock',
  'rating',
  'numReviews',
  'brand',
  'parentCategory',
  'category',
  'subCategory',
  'subCategory2',
  'subCategory3',
  'subCategory4',
  'createdAt',
  'isActive',
].join(' ');
const BRAND_SELECT = 'name nameAr logo slug isActive';
const CATEGORY_SELECT = 'name nameAr image slug isActive';
const SUBCATEGORY_SELECT = 'name nameAr image slug category parentSubCategory level isActive';

// Get all products for a specific offer page
router.get('/page/:slug', cacheMiddleware('offers', { keyPrefix: 'offer-products-page' }), async (req, res) => {
  try {
    const offerProducts = await OfferProduct.find({ offerPageSlug: req.params.slug })
      .sort({ order: 1 })
      .populate({
        path: 'product',
        select: OFFER_PRODUCT_SELECT,
        populate: [
          { path: 'brand', select: BRAND_SELECT },
          { path: 'parentCategory', select: CATEGORY_SELECT },
          { path: 'category', select: SUBCATEGORY_SELECT },
          { path: 'subCategory', select: SUBCATEGORY_SELECT },
          { path: 'subCategory2', select: SUBCATEGORY_SELECT },
          { path: 'subCategory3', select: SUBCATEGORY_SELECT },
          { path: 'subCategory4', select: SUBCATEGORY_SELECT },
        ],
      })
      .lean();
    res.json(offerProducts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all offer products (admin)
router.get('/', protect, admin, async (req, res) => {
  try {
    const offerProducts = await OfferProduct.find()
      .populate('product')
      .sort({ offerPageSlug: 1, order: 1 });
    res.json(offerProducts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single offer product
router.get('/:id', async (req, res) => {
  try {
    const offerProduct = await OfferProduct.findById(req.params.id).populate('product');
    if (offerProduct) {
      res.json(offerProduct);
    } else {
      res.status(404).json({ message: 'Offer product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create offer product
router.post('/', protect, admin, async (req, res) => {
  try {
    const offerProduct = new OfferProduct(req.body);
    const createdOfferProduct = await offerProduct.save();
    const populatedOfferProduct = await OfferProduct.findById(createdOfferProduct._id).populate('product');
    res.status(201).json(populatedOfferProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update offer product
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const offerProduct = await OfferProduct.findById(req.params.id);
    
    if (offerProduct) {
      offerProduct.offerPageSlug = req.body.offerPageSlug || offerProduct.offerPageSlug;
      offerProduct.product = req.body.product || offerProduct.product;
      offerProduct.isActive = req.body.isActive !== undefined ? req.body.isActive : offerProduct.isActive;
      offerProduct.order = req.body.order !== undefined ? req.body.order : offerProduct.order;
      
      const updatedOfferProduct = await offerProduct.save();
      const populatedOfferProduct = await OfferProduct.findById(updatedOfferProduct._id).populate('product');
      res.json(populatedOfferProduct);
    } else {
      res.status(404).json({ message: 'Offer product not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete offer product
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const offerProduct = await OfferProduct.findById(req.params.id);
    
    if (offerProduct) {
      await offerProduct.deleteOne();
      res.json({ message: 'Offer product deleted' });
    } else {
      res.status(404).json({ message: 'Offer product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete all products for a specific offer page
router.delete('/page/:slug', protect, admin, async (req, res) => {
  try {
    await OfferProduct.deleteMany({ offerPageSlug: req.params.slug });
    res.json({ message: 'All products deleted for this offer page' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
