import express from "express"
import Product from "../models/productModel.js"
import Category from "../models/categoryModel.js"
import SubCategory from "../models/subCategoryModel.js"
import Brand from "../models/brandModel.js"

const router = express.Router()

// @desc    Get products with advanced filtering for mobile app
// @route   GET /api/mobile/products
// @access  Public
router.get("/products", async (req, res) => {
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
      sortBy = "newest",
    } = req.query

    // Build the main query conditions
    const andConditions = [{ isActive: true }]

    // Parent category filter
    if (parentCategory && parentCategory.match(/^[0-9a-fA-F]{24}$/)) {
      andConditions.push({ parentCategory })
    }

    // Category/Subcategory filter - handle both category and subcategory params
    if (category && category.match(/^[0-9a-fA-F]{24}$/)) {
      andConditions.push({
        $or: [{ category: category }, { subCategory: category }, { parentCategory: category }],
      })
    }

    if (subcategory && subcategory.match(/^[0-9a-fA-F]{24}$/)) {
      andConditions.push({
        $or: [{ category: subcategory }, { subCategory: subcategory }],
      })
    }

    // Brand filter - handle both single brand and multiple brands with proper ObjectId validation
    if (brand) {
      if (Array.isArray(brand)) {
        // Multiple brands
        const validBrandIds = brand.filter((b) => b.match(/^[0-9a-fA-F]{24}$/))
        if (validBrandIds.length > 0) {
          andConditions.push({ brand: { $in: validBrandIds } })
        }
      } else if (brand.match(/^[0-9a-fA-F]{24}$/)) {
        // Single brand
        andConditions.push({ brand })
      }
    }

    // Search filter
    if (search && typeof search === "string" && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i")

      // Find matching brands by name for search
      const matchingBrands = await Brand.find({ name: searchRegex }).select("_id")
      const brandIds = matchingBrands.map((b) => b._id)

      andConditions.push({
        $or: [
          { name: searchRegex },
          { description: searchRegex },
          { tags: searchRegex },
          { sku: searchRegex },
          { barcode: searchRegex },
          { brand: { $in: brandIds } },
        ],
      })
    }

    // Price range filter - MODIFIED LOGIC
    if (minPrice || maxPrice) {
      const priceFilter = {}
      const numMinPrice = Number(minPrice);
      const numMaxPrice = Number(maxPrice);

      // If min and max prices are provided, are valid numbers, and are identical,
      // create a small range around them to account for floating point inaccuracies.
      if (minPrice !== undefined && maxPrice !== undefined && !isNaN(numMinPrice) && !isNaN(numMaxPrice) && numMinPrice === numMaxPrice) {
        const epsilon = 0.0001; // A small value to create a tiny range
        priceFilter.$gte = numMinPrice - epsilon;
        priceFilter.$lte = numMaxPrice + epsilon;
      } else {
        // Otherwise, apply the filters as usual
        if (minPrice !== undefined && !isNaN(numMinPrice)) priceFilter.$gte = numMinPrice;
        if (maxPrice !== undefined && !isNaN(numMaxPrice)) priceFilter.$lte = numMaxPrice;
      }
      andConditions.push({ price: priceFilter })
    }

    // Stock status filter - Using stockStatus field directly
    if (stockStatus) {
      const status = stockStatus.toLowerCase()
      
      if (status === 'instock' || status === 'in_stock') {
        // Show products marked as "In Stock" with stock > 0
        andConditions.push({
          stockStatus: "In Stock",
          countInStock: { $gt: 0 }
        })
      } 
      else if (status === 'outofstock' || status === 'out_of_stock') {
        // Show products that are not "In Stock" or have countInStock <= 0
        andConditions.push({
          $or: [
            { stockStatus: { $ne: "In Stock" } },
            { countInStock: { $lte: 0 } }
          ]
        })
      }
      else if (status === 'lowstock' || status === 'low_stock') {
        // Show low stock items (count between 1-10) that are available
        andConditions.push({
          stockStatus: "In Stock",
          countInStock: { $gt: 0, $lte: 10 }
        })
      }
    }

    // Featured filter
    if (featured === "true") {
      andConditions.push({ featured: true })
    }

    // Build final query - Fixed query structure
    let query = {}
    if (andConditions.length > 0) {
      query = andConditions.length > 1 ? { $and: andConditions } : andConditions[0]
    }

   
    // Sort options
    let sortOption = {}
    switch (sortBy) {
      case "price-low":
        sortOption = { price: 1 }
        break
      case "price-high":
        sortOption = { price: -1 }
        break
      case "name":
        sortOption = { name: 1 }
        break
      case "rating":
        sortOption = { rating: -1 }
        break
      default:
        sortOption = { createdAt: -1 }
        break
    }

    // Pagination
    const skip = (Number(page) - 1) * Number(limit)

    // Execute query
    const products = await Product.find(query)
      .populate("category", "name slug")
      .populate("subCategory", "name slug")
      .populate("parentCategory", "name slug")
      .populate("brand", "name slug")
      .populate("tax", "name rate")
      .populate("deliveryCharge", "name charge")
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))

    const totalProducts = await Product.countDocuments(query)
    const totalPages = Math.ceil(totalProducts / Number(limit))

    // Add computed fields to products
    const productsWithComputedFields = products.map((product) => {
      const p = product.toObject()

      // Calculate discount and final price
      if (p.offerPrice && p.price && p.offerPrice < p.price) {
        p.discountPercentage = Math.round(((p.price - p.offerPrice) / p.price) * 100)
        p.finalPrice = p.offerPrice
      } else {
        p.finalPrice = p.price
        p.discountPercentage = 0
      }

      // Compute stock status
      if (p.countInStock <= 0 || p.stockStatus === "Out of Stock") {
        p.stockStatusComputed = "outOfStock"
      } else if (p.countInStock <= (p.lowStockWarning ?? 5)) {
        p.stockStatusComputed = "lowStock"
      } else {
        p.stockStatusComputed = "inStock"
      }

      // Check if on sale
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
  
    res.status(500).json({
      success: false,
      message: "Server error while fetching products",
      error: error.message,
    })
  }
})

// @desc    Get filter options for mobile app
// @route   GET /api/mobile/filters
// @access  Public
router.get("/filters", async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).select("name slug").sort({ name: 1 })

    const subcategories = await SubCategory.find({ isActive: true })
      .populate("category", "name slug")
      .select("name slug category")
      .sort({ name: 1 })

    const brands = await Brand.find({ isActive: true }).select("name slug").sort({ name: 1 })

    const priceRange = await Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          minPrice: { $min: "$price" },
          maxPrice: { $max: "$price" },
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
                  $and: [{ $gt: ["$countInStock", 0] }, { $ne: ["$stockStatus", "Out of Stock"] }],
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
                  $or: [{ $lte: ["$countInStock", 0] }, { $eq: ["$stockStatus", "Out of Stock"] }],
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
                  $and: [{ $gt: ["$offerPrice", 0] }, { $lt: ["$offerPrice", "$price"] }],
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
      { value: "inStock", label: "In Stock" },
      { value: "outOfStock", label: "Out of Stock" },
      { value: "onSale", label: "On Sale" },
      { value: "lowStock", label: "Low Stock" },
    ]

    const sortOptions = [
      { value: "newest", label: "Newest First" },
      { value: "price-low", label: "Price: Low to High" },
      { value: "price-high", label: "Price: High to Low" },
      { value: "name", label: "Name A-Z" },
      { value: "rating", label: "Highest Rated" },
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
  
    res.status(500).json({
      success: false,
      message: "Server error while fetching filter options",
      error: error.message,
    })
  }
})

// @desc    Get single product details for mobile app
// @route   GET /api/mobile/products/:id
// @access  Public
router.get("/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category", "name slug")
      .populate("subCategory", "name slug")
      .populate("parentCategory", "name slug")
      .populate("brand", "name slug")
      .populate("tax", "name rate")
      .populate("deliveryCharge", "name charge")

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
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

    if (p.countInStock <= 0 || p.stockStatus === "Out of Stock") {
      p.stockStatusComputed = "outOfStock"
    } else if (p.countInStock <= (p.lowStockWarning ?? 5)) {
      p.stockStatusComputed = "lowStock"
    } else {
      p.stockStatusComputed = "inStock"
    }

    p.isOnSale = !!(p.offerPrice && p.offerPrice > 0 && p.offerPrice < p.price)

    res.json({ success: true, data: p })
  } catch (error) {
  
    res.status(500).json({
      success: false,
      message: "Server error while fetching product",
      error: error.message,
    })
  }
})

export default router
