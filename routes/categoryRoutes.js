import express from "express"
import asyncHandler from "express-async-handler"
import Category from "../models/categoryModel.js"
import SubCategory from "../models/subCategoryModel.js"
import Product from "../models/productModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { logActivity } from "../middleware/permissionMiddleware.js"
import { deleteLocalFile, isCloudinaryUrl } from "../config/multer.js"
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware.js"
import { translateEnToAr } from "../utils/translateWithFallback.js"

const router = express.Router()

const translateText = translateEnToAr

// Helper function to extract media URLs from HTML description (TipTap content)
const extractMediaUrlsFromHtml = (html) => {
  const urls = []
  if (!html) return urls

  // Match image src attributes
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    if (match[1] && match[1].includes('/uploads/')) {
      urls.push(match[1])
    }
  }

  // Match video src attributes
  const videoRegex = /<video[^>]+src=["']([^"']+)["']/gi
  while ((match = videoRegex.exec(html)) !== null) {
    if (match[1] && match[1].includes('/uploads/')) {
      urls.push(match[1])
    }
  }

  // Match source src attributes (for video sources)
  const sourceRegex = /<source[^>]+src=["']([^"']+)["']/gi
  while ((match = sourceRegex.exec(html)) !== null) {
    if (match[1] && match[1].includes('/uploads/')) {
      urls.push(match[1])
    }
  }

  return urls
}

// Helper function to delete all media files for a product
const deleteProductMediaFiles = async (product) => {
  // Delete main product image
  if (product.image && !isCloudinaryUrl(product.image)) {
    try {
      await deleteLocalFile(product.image)
    } catch (err) {
      console.error("Error deleting product image:", err)
    }
  }

  // Delete gallery images
  if (product.galleryImages && product.galleryImages.length > 0) {
    for (const img of product.galleryImages) {
      if (img && !isCloudinaryUrl(img)) {
        try {
          await deleteLocalFile(img)
        } catch (err) {
          console.error("Error deleting gallery image:", err)
        }
      }
    }
  }

  // Delete main video
  if (product.video && !isCloudinaryUrl(product.video)) {
    try {
      await deleteLocalFile(product.video)
    } catch (err) {
      console.error("Error deleting product video:", err)
    }
  }

  // Delete video gallery
  if (product.videoGallery && product.videoGallery.length > 0) {
    for (const vid of product.videoGallery) {
      if (vid && !isCloudinaryUrl(vid)) {
        try {
          await deleteLocalFile(vid)
        } catch (err) {
          console.error("Error deleting gallery video:", err)
        }
      }
    }
  }

  // Delete color variation images
  if (product.colorVariations && product.colorVariations.length > 0) {
    for (const colorVar of product.colorVariations) {
      if (colorVar.image && !isCloudinaryUrl(colorVar.image)) {
        try {
          await deleteLocalFile(colorVar.image)
        } catch (err) {
          console.error("Error deleting color variation image:", err)
        }
      }
      if (colorVar.galleryImages && colorVar.galleryImages.length > 0) {
        for (const img of colorVar.galleryImages) {
          if (img && !isCloudinaryUrl(img)) {
            try {
              await deleteLocalFile(img)
            } catch (err) {
              console.error("Error deleting color variation gallery image:", err)
            }
          }
        }
      }
    }
  }

  // Delete variant images
  if (product.variants && product.variants.length > 0) {
    for (const variant of product.variants) {
      if (variant.image && !isCloudinaryUrl(variant.image)) {
        try {
          await deleteLocalFile(variant.image)
        } catch (err) {
          console.error("Error deleting variant image:", err)
        }
      }
      if (variant.galleryImages && variant.galleryImages.length > 0) {
        for (const img of variant.galleryImages) {
          if (img && !isCloudinaryUrl(img)) {
            try {
              await deleteLocalFile(img)
            } catch (err) {
              console.error("Error deleting variant gallery image:", err)
            }
          }
        }
      }
    }
  }

  // Delete media files from description (TipTap content)
  if (product.description) {
    const descriptionMediaUrls = extractMediaUrlsFromHtml(product.description)
    for (const url of descriptionMediaUrls) {
      if (!isCloudinaryUrl(url)) {
        try {
          let filePath = url
          if (url.includes('/uploads/')) {
            filePath = '/uploads/' + url.split('/uploads/')[1]
          }
          await deleteLocalFile(filePath)
        } catch (err) {
          console.error("Error deleting description media:", err)
        }
      }
    }
  }

  // Delete media files from shortDescription
  if (product.shortDescription) {
    const shortDescMediaUrls = extractMediaUrlsFromHtml(product.shortDescription)
    for (const url of shortDescMediaUrls) {
      if (!isCloudinaryUrl(url)) {
        try {
          let filePath = url
          if (url.includes('/uploads/')) {
            filePath = '/uploads/' + url.split('/uploads/')[1]
          }
          await deleteLocalFile(filePath)
        } catch (err) {
          console.error("Error deleting short description media:", err)
        }
      }
    }
  }
}

// @desc    Fetch all categories (Admin only - includes inactive)
// @route   GET /api/categories/admin
// @access  Private/Admin
router.get(
  "/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    // Fetch all categories and subcategories
    const [categories, subCategories] = await Promise.all([
      Category.find({ isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 }).lean(),
      SubCategory.find({ isDeleted: { $ne: true } })
        .populate('category', 'name nameAr')
        .populate('parentSubCategory', 'name nameAr')
        .sort({ sortOrder: 1, name: 1 })
        .lean(),
    ])

    // Build a map of all items for level calculation
    const allItems = []
    
    // Add all parent categories (Level 0)
    categories.forEach(cat => {
      allItems.push({
        _id: cat._id,
        name: cat.name,
        slug: cat.slug,
        image: cat.image,
        isActive: cat.isActive,
        sortOrder: cat.sortOrder,
        level: 0,
        displayName: cat.name,
        type: 'category'
      })
    })

    // Build subcategory map for level calculation
    const subMap = new Map()
    subCategories.forEach(sub => {
      subMap.set(String(sub._id), sub)
    })

    // Calculate levels for subcategories recursively
    const getSubCategoryLevel = (sub, visited = new Set()) => {
      const subId = String(sub._id)
      if (visited.has(subId)) return 1 // Prevent infinite loops
      visited.add(subId)

      if (!sub.parentSubCategory) {
        return 1 // Direct child of category
      }

      const parentSub = subMap.get(String(sub.parentSubCategory._id || sub.parentSubCategory))
      if (parentSub) {
        return getSubCategoryLevel(parentSub, visited) + 1
      }
      return 1
    }

    // Add all subcategories with proper indentation
    subCategories.forEach(sub => {
      const level = getSubCategoryLevel(sub)
      const indent = '— '.repeat(level)
      const parentName = sub.category?.name || 'Unknown'
      
      allItems.push({
        _id: sub._id,
        name: sub.name,
        slug: sub.slug,
        isActive: sub.isActive,
        sortOrder: sub.sortOrder,
        level: level,
        displayName: `${indent}${sub.name} (under ${parentName})`,
        type: 'subcategory',
        category: sub.category,
        parentSubCategory: sub.parentSubCategory
      })
    })

    // Sort by category first, then by level and sort order
    allItems.sort((a, b) => {
      if (a.type === 'category' && b.type === 'subcategory') return -1
      if (a.type === 'subcategory' && b.type === 'category') return 1
      if (a.level !== b.level) return a.level - b.level
      return (a.sortOrder || 0) - (b.sortOrder || 0)
    })

    res.json(allItems)
  }),
)

// @desc    Fetch all categories
// @route   GET /api/categories
// @access  Public
router.get(
  "/",
  cacheMiddleware('categories'),
  asyncHandler(async (req, res) => {
    const categories = await Category.find({ isActive: true, isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 })
    res.json(categories)
  }),
)

// @desc    Fetch categories selected for Home slider
// @route   GET /api/categories/slider
// @access  Public
router.get(
  "/slider",
  cacheMiddleware('categories', { keyPrefix: 'slider' }),
  asyncHandler(async (req, res) => {
    // Fetch both categories and subcategories with showInSlider: true
    // NOTE: This endpoint does NOT check isActive status - it only checks showInSlider
    // The slider selection is independent from the category header Active/Inactive status
    const [categories, subCategories] = await Promise.all([
      Category.find({ showInSlider: true, isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 }).lean(),
      SubCategory.find({ showInSlider: true, isDeleted: { $ne: true } }).sort({ sortOrder: 1, name: 1 }).lean(),
    ])
    
    // Combine and return
    const allSliderItems = [...categories, ...subCategories]
    res.json(allSliderItems)
  }),
)

// @desc    Fetch categories with nested subcategories up to 4 levels
// @route   GET /api/categories/tree
// @access  Public
router.get(
  "/tree",
  cacheMiddleware('categories', { keyPrefix: 'tree' }),
  asyncHandler(async (req, res) => {
    try {
      // Load active, non-deleted categories and subcategories with all fields
      const [cats, subs] = await Promise.all([
        Category.find({ isActive: true, isDeleted: { $ne: true } })
          .sort({ sortOrder: 1, name: 1 })
          .lean(),
        SubCategory.find({ isActive: true, isDeleted: { $ne: true } })
          .sort({ sortOrder: 1, name: 1 })
          .lean(),
      ])

      // Prepare category nodes - preserve all fields
      const catMap = new Map()
      for (const c of cats) {
        catMap.set(String(c._id), { 
          ...c, 
          children: [] 
        })
      }

      // Prepare subcategory nodes - preserve all fields
      const subMap = new Map()
      for (const s of subs) {
        const level = s.level || 1
        subMap.set(String(s._id), {
          ...s,
          level,
          category: s.category ? String(s.category) : null,
          parentSubCategory: s.parentSubCategory ? String(s.parentSubCategory) : null,
          children: [],
        })
      }

      // Link subcategories to parents with basic cycle safety
      for (const node of subMap.values()) {
        const parentSubId = node.parentSubCategory
        if (parentSubId && subMap.has(parentSubId)) {
          // Avoid self-reference cycles
          if (String(parentSubId) !== String(node._id)) {
            subMap.get(parentSubId).children.push(node)
          }
        } else {
          // Treat as level 1 (or missing parent) -> attach to category root
          const catId = node.category
          if (catId && catMap.has(catId)) {
            catMap.get(catId).children.push(node)
          }
        }
      }

      // Sort children arrays by name for stability with cycle protection
      const sortChildren = (arr, seen = new Set(), depth = 0) => {
        if (!Array.isArray(arr) || arr.length === 0) return
        // Guard against unreasonable depth (corrupt data)
        if (depth > 10) return
        arr.sort((a, b) => a.name.localeCompare(b.name))
        for (const n of arr) {
          const idStr = String(n._id)
          if (seen.has(idStr)) continue
          seen.add(idStr)
          if (Array.isArray(n.children) && n.children.length > 0) {
            sortChildren(n.children, seen, depth + 1)
          }
          seen.delete(idStr)
        }
      }

      for (const cat of catMap.values()) {
        if (Array.isArray(cat.children)) sortChildren(cat.children)
      }

      return res.json(Array.from(catMap.values()))
    } catch (err) {
      console.error('Error building category tree:', {
        message: err.message,
        stack: err.stack,
      })
      // Fail soft with empty array to avoid breaking pages
      return res.json([])
    }
  }),
)

// @desc    Get all trashed (soft-deleted) categories
// @route   GET /api/categories/trash
// @access  Private/Admin
router.get(
  "/trash",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const trashedCategories = await Category.find({ isDeleted: true }).sort({ deletedAt: -1 })
    res.json(trashedCategories)
  })
)

// @desc    Fetch single category (Admin - includes inactive)
// @route   GET /api/categories/:id/admin
// @access  Private/Admin
router.get(
  "/:id/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id)

    if (category && !category.isDeleted) {
      res.json(category)
    } else {
      res.status(404)
      throw new Error("Category not found")
    }
  }),
)

// @desc    Fetch single category
// @route   GET /api/categories/:id
// @access  Public
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id)

    if (category && category.isActive !== false) {
      res.json(category)
    } else {
      res.status(404)
      throw new Error("Category not found")
    }
  }),
)

// @desc    Create a category
// @route   POST /api/categories
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, description, seoContent, metaTitle, metaDescription, customSchema, redirectUrl, image, slug } = req.body

    if (!name || name.trim() === "") {
      res.status(400)
      throw new Error("Category name is required")
    }

    // Check if category with same name already exists
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    })

    if (existingCategory) {
      res.status(400)
      throw new Error("Category with this name already exists")
    }

    // Generate slug if not provided
    const categorySlug = slug || name.trim().toLowerCase().replace(/\s+/g, "-")

    // Translate only user-facing fields
    const nameAr = await translateText(name.trim());
    const descriptionAr = await translateText(description || "");

    const category = new Category({
      name: name.trim(),
      nameAr,
      description: description || "",
      descriptionAr,
      seoContent: seoContent || "",
      seoContentAr: "", // Excluded from auto-translation
      metaTitle: metaTitle || "",
      metaTitleAr: "", // Excluded from auto-translation
      metaDescription: metaDescription || "",
      metaDescriptionAr: "", // Excluded from auto-translation
      customSchema: customSchema || "",
      redirectUrl: redirectUrl || "",
      image: image || "",
      slug: categorySlug,
      isActive: true,
      createdBy: req.user._id,
    })

    const createdCategory = await category.save()
    
    // Log activity
    if (req.user) {
      await logActivity({
        user: req.user,
        action: "CREATE",
        module: "CATEGORIES",
        description: `Created category: ${createdCategory.name}`,
        targetId: createdCategory._id.toString(),
        targetName: createdCategory.name,
        newData: { name, slug: categorySlug },
        req,
      })
    }
    
    // Invalidate category cache
    await invalidateCache(['categories', 'products'])
    
    res.status(201).json(createdCategory)
  }),
)

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { name, description, seoContent, metaTitle, metaDescription, customSchema, redirectUrl, image, slug, isActive, showInSlider } = req.body

    const category = await Category.findById(req.params.id)

    if (category) {
      // Check if another category with same name exists (excluding current)
      if (name && name.trim() !== category.name) {
        const existingCategory = await Category.findOne({
          name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
          _id: { $ne: req.params.id },
        })

        if (existingCategory) {
          res.status(400)
          throw new Error("Category with this name already exists")
        }
      }

      category.name = name?.trim() || category.name
      category.description = description !== undefined ? description : category.description
      category.seoContent = seoContent !== undefined ? seoContent : category.seoContent
      category.metaTitle = metaTitle !== undefined ? metaTitle : category.metaTitle
      category.metaDescription = metaDescription !== undefined ? metaDescription : category.metaDescription
      category.customSchema = customSchema !== undefined ? customSchema : category.customSchema
      category.redirectUrl = redirectUrl !== undefined ? redirectUrl : category.redirectUrl
      category.image = image !== undefined ? image : category.image
      category.slug = slug || category.slug
      category.isActive = isActive !== undefined ? isActive : category.isActive
      category.showInSlider = showInSlider !== undefined ? showInSlider : category.showInSlider

      // Translate updated fields if they have changed (excluding SEO/Meta)
      if (name !== undefined) category.nameAr = await translateText(category.name);
      if (description !== undefined) category.descriptionAr = await translateText(category.description);
      
      // Clear SEO/Meta translations if they exist (policy change)
      category.seoContentAr = "";
      category.metaTitleAr = "";
      category.metaDescriptionAr = "";

      const previousName = category.name
      const updatedCategory = await category.save()
      
      // Log activity
      if (req.user) {
        await logActivity({
          user: req.user,
          action: "UPDATE",
          module: "CATEGORIES",
          description: `Updated category: ${updatedCategory.name}`,
          targetId: updatedCategory._id.toString(),
          targetName: updatedCategory.name,
          previousData: { name: previousName },
          newData: { name, isActive },
          req,
        })
      }
      
      // Invalidate category cache
      await invalidateCache(['categories', 'products'])
      
      res.json(updatedCategory)
    } else {
      res.status(404)
      throw new Error("Category not found")
    }
  }),
)

// @desc    Get deletion info for a category (product count and child subcategories)
// @route   GET /api/categories/:id/deletion-info
// @access  Private/Admin
router.get(
  "/:id/deletion-info",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id)

    if (!category) {
      res.status(404)
      throw new Error("Category not found")
    }

    // Count direct subcategories (Level 1)
    const level1Subs = await SubCategory.find({ 
      category: req.params.id,
      isDeleted: { $ne: true }
    })
    
    const level1SubIds = level1Subs.map(sub => sub._id)
    
    // Count Level 2 subcategories (children of Level 1)
    const level2Subs = await SubCategory.find({
      parentSubCategory: { $in: level1SubIds },
      isDeleted: { $ne: true }
    })
    
    const level2SubIds = level2Subs.map(sub => sub._id)
    
    // Count Level 3 subcategories (children of Level 2)
    const level3Subs = await SubCategory.find({
      parentSubCategory: { $in: level2SubIds },
      isDeleted: { $ne: true }
    })
    
    const totalChildCount = level1Subs.length + level2Subs.length + level3Subs.length
    
    // Get all subcategory IDs for product query
    const allSubIds = [...level1SubIds, ...level2SubIds, ...level3Subs.map(sub => sub._id)]
    
    // Count products in category and all its subcategories
    const productCount = await Product.countDocuments({
      $or: [
        { parentCategory: req.params.id },
        { category: { $in: allSubIds } }
      ]
    })

    res.json({
      categoryId: req.params.id,
      categoryName: category.name,
      childCount: totalChildCount,
      level1Count: level1Subs.length,
      level2Count: level2Subs.length,
      level3Count: level3Subs.length,
      productCount
    })
  }),
)

// @desc    Delete a category with cascading (products and subcategories)
// @route   DELETE /api/categories/:id/cascade
// @access  Private/Admin
router.delete(
  "/:id/cascade",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { moveProducts } = req.query // "true" if we should move products instead of deleting
    
    const category = await Category.findById(req.params.id)

    if (!category) {
      res.status(404)
      throw new Error("Category not found")
    }

    // Get all subcategories at all levels
    const level1Subs = await SubCategory.find({ 
      category: req.params.id,
      isDeleted: { $ne: true }
    })
    
    const level1SubIds = level1Subs.map(sub => sub._id)
    
    const level2Subs = await SubCategory.find({
      parentSubCategory: { $in: level1SubIds },
      isDeleted: { $ne: true }
    })
    
    const level2SubIds = level2Subs.map(sub => sub._id)
    
    const level3Subs = await SubCategory.find({
      parentSubCategory: { $in: level2SubIds },
      isDeleted: { $ne: true }
    })
    
    const allSubIds = [...level1SubIds, ...level2SubIds, ...level3Subs.map(sub => sub._id)]

    if (moveProducts === "true") {
      // Move products flow - return subcategory IDs that need handling
      // Frontend will show move modal
      res.json({
        message: "Products need to be moved",
        requiresMove: true,
        categoryId: req.params.id,
        subcategoryIds: allSubIds
      })
    } else {
      // Permanently delete everything
      // First, find and delete media files for all products
      const productsToDelete = await Product.find({
        $or: [
          { parentCategory: req.params.id },
          { category: { $in: allSubIds } }
        ]
      })

      // Delete media files for all products
      for (const product of productsToDelete) {
        await deleteProductMediaFiles(product)
      }

      // Delete all products in this category and subcategories
      await Product.deleteMany({
        $or: [
          { parentCategory: req.params.id },
          { category: { $in: allSubIds } }
        ]
      })

      // Delete subcategory images
      const allSubcategories = [...level1Subs, ...level2Subs, ...level3Subs]
      for (const sub of allSubcategories) {
        if (sub.image && !isCloudinaryUrl(sub.image)) {
          try {
            await deleteLocalFile(sub.image)
          } catch (err) {
            console.error("Error deleting subcategory image:", err)
          }
        }
      }

      // Delete all subcategories
      await SubCategory.deleteMany({
        _id: { $in: allSubIds }
      })

      // Delete category image
      if (category.image && !isCloudinaryUrl(category.image)) {
        try {
          await deleteLocalFile(category.image)
        } catch (err) {
          console.error("Error deleting category image:", err)
        }
      }

      // Delete the category
      await Category.findByIdAndDelete(req.params.id)

      res.json({ 
        message: "Category, subcategories, and products permanently deleted",
        deletedCount: {
          subcategories: allSubIds.length,
          products: productsToDelete.length
        }
      })
    }
  }),
)

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id)

    if (category) {
      // Soft delete - mark as deleted instead of removing
      category.isDeleted = true
      category.isActive = false
      await category.save()

      // Log activity
      if (req.user) {
        await logActivity({
          user: req.user,
          action: "DELETE",
          module: "CATEGORIES",
          description: `Deleted category: ${category.name}`,
          targetId: category._id.toString(),
          targetName: category.name,
          req,
        })
      }

      res.json({ message: "Category deleted successfully" })
    } else {
      res.status(404)
      throw new Error("Category not found")
    }
  }),
)

// @desc    Restore a category from trash
// @route   PUT /api/categories/:id/restore
// @access  Private/Admin
router.put(
  "/:id/restore",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id)

    if (category) {
      category.isDeleted = false
      category.deletedAt = null
      await category.save()

      res.json({ message: "Category restored successfully", category })
    } else {
      res.status(404)
      throw new Error("Category not found")
    }
  }),
)

// @desc    Permanently delete a category
// @route   DELETE /api/categories/:id/permanent
// @access  Private/Admin
router.delete(
  "/:id/permanent",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id)

    if (category) {
      // Delete category image
      if (category.image && !isCloudinaryUrl(category.image)) {
        try {
          await deleteLocalFile(category.image)
        } catch (err) {
          console.error("Error deleting category image:", err)
        }
      }

      // Permanently delete from database
      await Category.findByIdAndDelete(req.params.id)
      res.json({ message: "Category permanently deleted" })
    } else {
      res.status(404)
      throw new Error("Category not found")
    }
  }),
)

// @desc    Get categories with product count
// @route   GET /api/categories/with-count
// @access  Public
router.get(
  "/with-count",
  asyncHandler(async (req, res) => {
    const categories = await Category.aggregate([
      {
        $match: {
          isActive: { $ne: false },
          isDeleted: { $ne: true },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "category",
          as: "products",
        },
      },
      {
        $addFields: {
          productCount: { $size: "$products" },
        },
      },
      {
        $project: {
          products: 0,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ])

    res.json(categories)
  }),
)

export default router
