import express from 'express'
import Product from '../models/productModel.js'
import Category from '../models/categoryModel.js'
import SubCategory from '../models/subCategoryModel.js'
import Brand from '../models/brandModel.js'
import mongoose from 'mongoose'

const router = express.Router()

// @desc    Get products with advanced filtering for mobile app
// @route   GET /api/app/products
// @access  Public
router.get('/products', async (req, res) => {
  try {
    const {
      category,
      subcategory,
      parentCategory,
      brand,
      search,
      minPrice,
      maxPrice,
      stockStatus,
      featured,
      limit = 20,
      page = 1,
      sortBy = 'newest',
    } = req.query

    const andConditions = [{ isActive: true }]

    if (parentCategory) andConditions.push({ parentCategory })
    if (category) andConditions.push({ category })
    if (subcategory) andConditions.push({ subCategory: subcategory })

    if (brand) {
      const brandArray = Array.isArray(brand) ? brand : [brand]
      andConditions.push({ brand: { $in: brandArray } })
    }

    if (search) {
      const regex = new RegExp(search, 'i')
      andConditions.push({
        $or: [
          { name: regex },
          { description: regex },
          { tags: regex },
          { sku: regex },
          { barcode: regex },
        ],
      })
    }

    if (minPrice || maxPrice) {
      const priceFilter = {}
      if (minPrice) priceFilter.$gte = Number(minPrice)
      if (maxPrice) priceFilter.$lte = Number(maxPrice)
      andConditions.push({ price: priceFilter })
    }

    if (stockStatus) {
      const statusArray = Array.isArray(stockStatus) ? stockStatus : [stockStatus]
      const stockConditions = []

      statusArray.forEach((status) => {
        switch (status) {
          case 'inStock':
            stockConditions.push({
              $and: [{ countInStock: { $gt: 0 } }, { stockStatus: { $ne: 'Out of Stock' } }],
            })
            break
          case 'outOfStock':
            stockConditions.push({
              $or: [{ countInStock: { $lte: 0 } }, { stockStatus: 'Out of Stock' }],
            })
            break
          case 'onSale':
            stockConditions.push({
              $and: [
                { offerPrice: { $exists: true } },
                { offerPrice: { $gt: 0 } },
                { $expr: { $lt: ['$offerPrice', '$price'] } },
              ],
            })
            break
          case 'lowStock':
            stockConditions.push({
              $and: [
                { countInStock: { $gt: 0 } },
                { $expr: { $lte: ['$countInStock', '$lowStockWarning'] } },
                { stockStatus: { $ne: 'Out of Stock' } },
              ],
            })
            break
        }
      })

      if (stockConditions.length > 0) {
        andConditions.push({ $or: stockConditions })
      }
    }

    if (featured === 'true') andConditions.push({ featured: true })

    const query = andConditions.length > 0 ? { $and: andConditions } : {}

    console.log('Final Query:', JSON.stringify(query, null, 2))

    let sortOption = {}
    switch (sortBy) {
      case 'price-low':
        sortOption = { price: 1 }
        break
      case 'price-high':
        sortOption = { price: -1 }
        break
      case 'name':
        sortOption = { name: 1 }
        break
      case 'rating':
        sortOption = { rating: -1 }
        break
      default:
        sortOption = { createdAt: -1 }
        break
    }

    const skip = (Number(page) - 1) * Number(limit)

    const products = await Product.find(query)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .populate('parentCategory', 'name slug')
      .populate('brand', 'name slug')
      .populate('tax', 'name rate')
      .populate('deliveryCharge', 'name charge')
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))

    const totalProducts = await Product.countDocuments(query)
    const totalPages = Math.ceil(totalProducts / Number(limit))

    const productsWithComputedFields = products.map((product) => {
      const p = product.toObject()

      if (p.offerPrice && p.price && p.offerPrice < p.price) {
        p.discountPercentage = Math.round(((p.price - p.offerPrice) / p.price) * 100)
        p.finalPrice = p.offerPrice
      } else {
        p.finalPrice = p.price
        p.discountPercentage = 0
      }

      if (p.countInStock <= 0 || p.stockStatus === 'Out of Stock') {
        p.stockStatusComputed = 'outOfStock'
      } else if (p.countInStock <= (p.lowStockWarning ?? 5)) {
        p.stockStatusComputed = 'lowStock'
      } else {
        p.stockStatusComputed = 'inStock'
      }

      p.isOnSale = !!(p.offerPrice && p.offerPrice > 0 && p.offerPrice < p.price)

      return p
    })

    res.json({
      success: true,
      data: productsWithComputedFields,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalProducts,
        hasNextPage: Number(page) < totalPages,
        hasPrevPage: Number(page) > 1,
      },
      filters: {
        category,
        subcategory,
        parentCategory,
        brand,
        search,
        minPrice,
        maxPrice,
        stockStatus,
        featured,
        sortBy,
      },
      appliedQuery: query,
    })
  } catch (error) {
    console.error('Error fetching products:', error)
    res.status(500).json({
      success: false,
      message: 'Server error while fetching products',
      error: error.message,
    })
  }
})

// @desc    Get filter options for mobile app
// @route   GET /api/app/filters
// @access  Public
router.get('/filters', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).select('name slug').sort({ name: 1 })

    const subcategories = await SubCategory.find({ isActive: true })
      .populate('category', 'name slug')
      .select('name slug category')
      .sort({ name: 1 })

    const brands = await Brand.find({ isActive: true }).select('name slug').sort({ name: 1 })

    const priceRange = await Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
        },
      },
    ])

    const stockStats = await Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          inStockProducts: {
            $sum: {
              $cond: [
                {
                  $and: [{ $gt: ['$countInStock', 0] }, { $ne: ['$stockStatus', 'Out of Stock'] }],
                },
                1,
                0,
              ],
            },
          },
          outOfStockProducts: {
            $sum: {
              $cond: [
                {
                  $or: [{ $lte: ['$countInStock', 0] }, { $eq: ['$stockStatus', 'Out of Stock'] }],
                },
                1,
                0,
              ],
            },
          },
          onSaleProducts: {
            $sum: {
              $cond: [
                {
                  $and: [{ $gt: ['$offerPrice', 0] }, { $lt: ['$offerPrice', '$price'] }],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ])

    const stockStatusOptions = [
      { value: 'inStock', label: 'In Stock' },
      { value: 'outOfStock', label: 'Out of Stock' },
      { value: 'onSale', label: 'On Sale' },
      { value: 'lowStock', label: 'Low Stock' },
    ]

    const sortOptions = [
      { value: 'newest', label: 'Newest First' },
      { value: 'price-low', label: 'Price: Low to High' },
      { value: 'price-high', label: 'Price: High to Low' },
      { value: 'name', label: 'Name A-Z' },
      { value: 'rating', label: 'Highest Rated' },
    ]

    res.json({
      success: true,
      data: {
        categories,
        subcategories,
        brands,
        priceRange: priceRange[0] || { minPrice: 0, maxPrice: 1000 },
        stockStatusOptions,
        sortOptions,
        stockStats: stockStats[0] || {},
      },
    })
  } catch (error) {
    console.error('Error fetching filter options:', error)
    res.status(500).json({
      success: false,
      message: 'Server error while fetching filter options',
      error: error.message,
    })
  }
})

// @desc    Get single product details for mobile app
// @route   GET /api/app/products/:id
// @access  Public
router.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .populate('parentCategory', 'name slug')
      .populate('brand', 'name slug')
      .populate('tax', 'name rate')
      .populate('deliveryCharge', 'name charge')

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      })
    }

    const p = product.toObject()

    if (p.offerPrice && p.price && p.offerPrice < p.price) {
      p.discountPercentage = Math.round(((p.price - p.offerPrice) / p.price) * 100)
      p.finalPrice = p.offerPrice
    } else {
      p.finalPrice = p.price
      p.discountPercentage = 0
    }

    if (p.countInStock <= 0 || p.stockStatus === 'Out of Stock') {
      p.stockStatusComputed = 'outOfStock'
    } else if (p.countInStock <= (p.lowStockWarning ?? 5)) {
      p.stockStatusComputed = 'lowStock'
    } else {
      p.stockStatusComputed = 'inStock'
    }

    p.isOnSale = !!(p.offerPrice && p.offerPrice > 0 && p.offerPrice < p.price)

    res.json({ success: true, data: p })
  } catch (error) {
    console.error('Error fetching product:', error)
    res.status(500).json({
      success: false,
      message: 'Server error while fetching product',
      error: error.message,
    })
  }
})

// @desc    Check database connections status (for debugging)
// @route   GET /api/app/db-status
// @access  Public (but should be protected in production)
router.get('/db-status', async (req, res) => {
  try {
    const status = {
      mainDB: {
        connected: mongoose.connection.readyState === 1,
        state: mongoose.connection.readyState,
        host: mongoose.connection.host || 'Not connected',
      },
      blogDB: {
        configured: !!process.env.MONGODB_URI_2,
        connected: false,
        host: 'Not connected',
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        MONGODB_URI_2_exists: !!process.env.MONGODB_URI_2,
        MONGODB_URI_2_preview: process.env.MONGODB_URI_2 ? 
          process.env.MONGODB_URI_2.substring(0, 20) + '...' : 'NOT SET',
      }
    }

    // Check blog DB connection
    if (mongoose.connections.length > 1) {
      const blogConnection = mongoose.connections.find(conn => conn.name !== mongoose.connection.name)
      if (blogConnection) {
        status.blogDB.connected = blogConnection.readyState === 1
        status.blogDB.host = blogConnection.host || 'Not connected'
        status.blogDB.state = blogConnection.readyState
      }
    }

    res.json(status)
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

export default router
