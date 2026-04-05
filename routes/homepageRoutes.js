import express from "express"
import asyncHandler from "express-async-handler"
import Product from "../models/productModel.js"
import Category from "../models/categoryModel.js"
import Brand from "../models/brandModel.js"
import Banner from "../models/bannerModel.js"
import HomeSection from "../models/homeSectionModel.js"
import Settings from "../models/settingsModel.js"
import { cacheMiddleware } from "../middleware/cacheMiddleware.js"

const router = express.Router()

/**
 * @desc    Get all homepage data in a single optimized request
 * @route   GET /api/homepage
 * @access  Public
 * 
 * This endpoint combines multiple API calls into one to reduce
 * network requests and improve LCP (Largest Contentful Paint).
 * 
 * Returns:
 * - Featured products (limited to 12)
 * - Active categories
 * - Active brands
 * - Active banners (hero, promotional, mobile)
 * - Active home sections
 * - Settings
 * - Brand-specific products (HP, Dell, ASUS, Acer, MSI, Lenovo - 3 each)
 */
router.get(
  "/",
  cacheMiddleware("homeSections", { ttl: 300, keyPrefix: "v2-banner-fields" }), // Cache for 5 minutes
  asyncHandler(async (req, res) => {
    const startTime = Date.now()

    // Run all queries in parallel for maximum speed
    const [
      categories,
      brands,
      banners,
      homeSections,
      settings,
      featuredProducts,
    ] = await Promise.all([
      // Categories - active only, sorted
      Category.find({ isActive: true, isDeleted: { $ne: true } })
        .select('name nameAr slug image icon description descriptionAr sortOrder')
        .sort({ sortOrder: 1, name: 1 })
        .lean(),

      // Brands - active only with logo, sorted
      Brand.find({ isActive: true, isDeleted: { $ne: true }, logo: { $exists: true, $ne: '' } })
        .select('name nameAr slug logo website sortOrder')
        .sort({ sortOrder: 1, name: 1 })
        .lean(),

      // Banners - active only
      Banner.find({ isActive: true })
        .select(
          'title titleAr subtitle subtitleAr image mobileImage link buttonLink position section category sortOrder buttonText buttonTextAr deviceType',
        )
        .populate('category', 'name nameAr slug')
        .sort({ sortOrder: 1, createdAt: -1 })
        .lean(),

      // Home sections - active only
      HomeSection.find({ isActive: true })
        .sort({ order: 1 })
        .lean(),

      // Settings
      Settings.findOne({})
        .select('siteName logo favicon homeSections socialLinks contactInfo')
        .lean(),

      Product.find({ 
        isActive: true, 
        featured: true,
        hideFromShop: { $ne: true }
      })
        .select('name nameAr slug sku price offerPrice discount image stockStatus stockStatusAr countInStock brand category rating numReviews')
        .populate('brand', 'name nameAr slug')
        .populate('category', 'name nameAr slug')
        .sort({ 
          // In-stock products first
          stockStatus: 1,
          createdAt: -1 
        })
        .limit(12)
        .lean(),
    ])

    // Get brand IDs for quick lookup
    const brandMap = {}
    brands.forEach(b => {
      brandMap[b.name.toLowerCase()] = b._id
    })

    // Fetch brand-specific products in parallel (3 each for homepage sliders)
    const brandNames = ['HP', 'Dell', 'ASUS', 'Acer', 'MSI', 'Lenovo', 'Apple', 'Samsung']
    const brandProductPromises = brandNames.map(brandName => {
      const brandId = brands.find(b => b.name.toLowerCase() === brandName.toLowerCase())?._id
      if (!brandId) return Promise.resolve([])
      
      return Product.find({
        isActive: true,
        hideFromShop: { $ne: true },
        brand: brandId
      })
        .select('name nameAr slug sku price offerPrice discount image stockStatus stockStatusAr countInStock brand')
        .populate('brand', 'name nameAr slug')
        .sort({ stockStatus: 1, createdAt: -1 })
        .limit(4)
        .lean()
    })

    const brandProducts = await Promise.all(brandProductPromises)

    // Organize brand products
    const brandProductsMap = {}
    brandNames.forEach((name, index) => {
      brandProductsMap[name.toLowerCase()] = brandProducts[index]
    })

    // Organize banners by position
    const heroBanners = banners.filter(b => b.position === 'hero')
    const promotionalBanners = banners.filter(b => b.position === 'promotional')
    const mobileBanners = banners.filter(b => b.position === 'mobile')
    const homeBanners = banners.filter(
      (b) => typeof b.position === "string" && b.position.toLowerCase().startsWith("home"),
    )

    const responseTime = Date.now() - startTime

    res.json({
      success: true,
      responseTime: `${responseTime}ms`,
      data: {
        categories,
        brands,
        banners: {
          hero: heroBanners,
          promotional: promotionalBanners,
          mobile: mobileBanners,
          home: homeBanners,
        },
        homeSections,
        settings: settings || {},
        featuredProducts,
        brandProducts: brandProductsMap,
      }
    })
  })
)

/**
 * @desc    Get homepage products with pagination
 * @route   GET /api/homepage/products
 * @access  Public
 * 
 * For lazy loading more products on scroll
 */
router.get(
  "/products",
  cacheMiddleware('products', { ttl: 300 }),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, brand, category, featured } = req.query

    const query = {
      isActive: true,
      hideFromShop: { $ne: true }
    }

    if (brand) query.brand = brand
    if (category) query.category = category
    if (featured === 'true') query.featured = true

    const skip = (parseInt(page) - 1) * parseInt(limit)

    const [products, total] = await Promise.all([
      Product.find(query)
        .select('name nameAr slug sku price offerPrice discount image stockStatus stockStatusAr countInStock brand category rating numReviews')
        .populate('brand', 'name nameAr slug')
        .populate('category', 'name nameAr slug')
        .sort({ stockStatus: 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Product.countDocuments(query)
    ])

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
          hasMore: skip + products.length < total
        }
      }
    })
  })
)

export default router
