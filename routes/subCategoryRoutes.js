// import express from "express"
// import asyncHandler from "express-async-handler"
// import SubCategory from "../models/subCategoryModel.js"
// import Category from "../models/categoryModel.js"
// import { protect, admin } from "../middleware/authMiddleware.js"

// const router = express.Router()

// // @desc    Get all active subcategories
// // @route   GET /api/subcategories
// // @access  Public
// router.get(
//   "/",
//   asyncHandler(async (req, res) => {
//     const { category } = req.query

//     const query = { isActive: true, isDeleted: false }
//     if (category) {
//       query.category = category
//     }

//     const subcategories = await SubCategory.find(query)
//       .populate("category", "name slug")
//       .sort({ sortOrder: 1, name: 1 })
//     res.json(subcategories)
//   }),
// )

// // @desc    Get all subcategories (admin)
// // @route   GET /api/subcategories/admin
// // @access  Private/Admin
// router.get(
//   "/admin",
//   protect,
//   admin,
//   asyncHandler(async (req, res) => {
//     const subcategories = await SubCategory.find({ isDeleted: false })
//       .populate("category", "name slug")
//       .sort({ createdAt: -1 })
//     res.json(subcategories)
//   }),
// )

// // @desc    Get subcategories by category
// // @route   GET /api/subcategories/category/:categoryId
// // @access  Public
// router.get(
//   "/category/:categoryId",
//   asyncHandler(async (req, res) => {
//     const subcategories = await SubCategory.find({
//       category: req.params.categoryId,
//       isActive: true,
//       isDeleted: false,
//     }).sort({ sortOrder: 1, name: 1 })
//     res.json(subcategories)
//   }),
// )

// // @desc    Get trash subcategories
// // @route   GET /api/subcategories/trash
// // @access  Private/Admin
// router.get(
//   "/trash",
//   protect,
//   admin,
//   asyncHandler(async (req, res) => {
//     const subcategories = await SubCategory.find({ isDeleted: true })
//       .populate("category", "name slug")
//       .sort({ deletedAt: -1 })
//     res.json(subcategories)
//   }),
// )

// // @desc    Create a subcategory
// // @route   POST /api/subcategories
// // @access  Private/Admin
// router.post(
//   "/",
//   protect,
//   admin,
//   asyncHandler(async (req, res) => {
//     const { name, description, image, category, isActive, sortOrder } = req.body

//     // Check if category exists
//     const categoryExists = await Category.findById(category)
//     if (!categoryExists) {
//       res.status(400)
//       throw new Error("Category not found")
//     }

//     // Generate slug from name
//     const slug = name
//       .toLowerCase()
//       .replace(/[^a-zA-Z0-9]/g, "-")
//       .replace(/-+/g, "-")
//       .replace(/^-|-$/g, "")

//     const subcategory = new SubCategory({
//       name,
//       slug,
//       description,
//       image,
//       category,
//       isActive: isActive !== undefined ? isActive : true,
//       sortOrder: sortOrder || 0,
//       createdBy: req.user._id,
//     })

//     const createdSubCategory = await subcategory.save()

//     // Populate category info before sending response
//     await createdSubCategory.populate("category", "name slug")

//     res.status(201).json(createdSubCategory)
//   }),
// )

// // @desc    Update a subcategory
// // @route   PUT /api/subcategories/:id
// // @access  Private/Admin
// router.put(
//   "/:id",
//   protect,
//   admin,
//   asyncHandler(async (req, res) => {
//     const subcategory = await SubCategory.findById(req.params.id)

//     if (subcategory && !subcategory.isDeleted) {
//       const { name, description, image, category, isActive, sortOrder } = req.body

//       // Check if category exists if it's being updated
//       if (category && category !== subcategory.category.toString()) {
//         const categoryExists = await Category.findById(category)
//         if (!categoryExists) {
//           res.status(400)
//           throw new Error("Category not found")
//         }
//       }

//       subcategory.name = name || subcategory.name
//       subcategory.description = description || subcategory.description
//       subcategory.image = image || subcategory.image
//       subcategory.category = category || subcategory.category
//       subcategory.isActive = isActive !== undefined ? isActive : subcategory.isActive
//       subcategory.sortOrder = sortOrder !== undefined ? sortOrder : subcategory.sortOrder

//       // Update slug if name changed
//       if (name && name !== subcategory.name) {
//         subcategory.slug = name
//           .toLowerCase()
//           .replace(/[^a-zA-Z0-9]/g, "-")
//           .replace(/-+/g, "-")
//           .replace(/^-|-$/g, "")
//       }

//       const updatedSubCategory = await subcategory.save()
//       await updatedSubCategory.populate("category", "name slug")

//       res.json(updatedSubCategory)
//     } else {
//       res.status(404)
//       throw new Error("SubCategory not found")
//     }
//   }),
// )

// // @desc    Soft delete a subcategory (move to trash)
// // @route   DELETE /api/subcategories/:id
// // @access  Private/Admin
// router.delete(
//   "/:id",
//   protect,
//   admin,
//   asyncHandler(async (req, res) => {
//     const subcategory = await SubCategory.findById(req.params.id)

//     if (subcategory && !subcategory.isDeleted) {
//       subcategory.isDeleted = true
//       subcategory.deletedAt = new Date()
//       await subcategory.save()
//       res.json({ message: "SubCategory moved to trash" })
//     } else {
//       res.status(404)
//       throw new Error("SubCategory not found")
//     }
//   }),
// )

// // @desc    Restore a subcategory from trash
// // @route   PUT /api/subcategories/:id/restore
// // @access  Private/Admin
// router.put(
//   "/:id/restore",
//   protect,
//   admin,
//   asyncHandler(async (req, res) => {
//     const subcategory = await SubCategory.findById(req.params.id)

//     if (subcategory && subcategory.isDeleted) {
//       subcategory.isDeleted = false
//       subcategory.deletedAt = null
//       await subcategory.save()
//       res.json({ message: "SubCategory restored successfully" })
//     } else {
//       res.status(404)
//       throw new Error("SubCategory not found in trash")
//     }
//   }),
// )

// // @desc    Permanently delete a subcategory
// // @route   DELETE /api/subcategories/:id/permanent
// // @access  Private/Admin
// router.delete(
//   "/:id/permanent",
//   protect,
//   admin,
//   asyncHandler(async (req, res) => {
//     const subcategory = await SubCategory.findById(req.params.id)

//     if (subcategory && subcategory.isDeleted) {
//       await subcategory.deleteOne()
//       res.json({ message: "SubCategory permanently deleted" })
//     } else {
//       res.status(404)
//       throw new Error("SubCategory not found in trash")
//     }
//   }),
// )

// export default router





// import express from "express"
// import asyncHandler from "express-async-handler"
// import SubCategory from "../models/subCategoryModel.js"
// import Category from "../models/categoryModel.js"
// import { protect, admin } from "../middleware/authMiddleware.js"

// const router = express.Router()

// // @desc    Get all active subcategories
// // @route   GET /api/subcategories
// // @access  Public
// router.get(
//   "/",
//   asyncHandler(async (req, res) => {
//     try {
//       const { category } = req.query

//       const query = {
//         isActive: { $ne: false },
//         isDeleted: { $ne: true },
//       }

//       if (category) {
//         // Find category by name or ID
//         const categoryDoc = await Category.findOne({
//           $or: [{ _id: category }, { name: { $regex: new RegExp(`^${category}$`, "i") } }, { slug: category }],
//         })

//         if (categoryDoc) {
//           query.category = categoryDoc._id
//         }
//       }

//       const subcategories = await SubCategory.find(query)
//         .populate("category", "name slug")
//         .sort({ sortOrder: 1, name: 1 })

//       // Filter out invalid subcategories
//       const validSubCategories = subcategories.filter((sub) => {
//         return sub && sub._id && sub.name && typeof sub.name === "string" && sub.name.trim() !== ""
//       })

//       res.json(validSubCategories)
//     } catch (error) {
//       console.error("Error fetching subcategories:", error)
//       res.status(500).json({ message: "Error fetching subcategories", error: error.message })
//     }
//   }),
// )

// // @desc    Get single subcategory
// // @route   GET /api/subcategories/:id
// // @access  Public
// router.get(
//   "/:id",
//   asyncHandler(async (req, res) => {
//     const subcategory = await SubCategory.findById(req.params.id).populate("category")

//     if (subcategory && subcategory.isActive !== false) {
//       res.json(subcategory)
//     } else {
//       res.status(404)
//       throw new Error("Subcategory not found")
//     }
//   }),
// )

// // @desc    Create a subcategory
// // @route   POST /api/subcategories
// // @access  Private/Admin
// router.post(
//   "/",
//   protect,
//   admin,
//   asyncHandler(async (req, res) => {
//     const { name, description, image, category, isActive, sortOrder } = req.body

//     if (!name || name.trim() === "") {
//       res.status(400)
//       throw new Error("Subcategory name is required")
//     }

//     if (!category) {
//       res.status(400)
//       throw new Error("Parent category is required")
//     }

//     // Verify parent category exists
//     const parentCategory = await Category.findById(category)
//     if (!parentCategory) {
//       res.status(400)
//       throw new Error("Parent category not found")
//     }

//     // Check if subcategory with same name already exists in this category
//     const existingSubCategory = await SubCategory.findOne({
//       name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
//       category: category,
//     })

//     if (existingSubCategory) {
//       res.status(400)
//       throw new Error("Subcategory with this name already exists in this category")
//     }

//     // Generate slug
//     const slug = name.trim().toLowerCase().replace(/\s+/g, "-")

//     const subcategory = new SubCategory({
//       name: name.trim(),
//       slug,
//       description: description || "",
//       image: image || "",
//       category,
//       isActive: isActive !== undefined ? isActive : true,
//       sortOrder: sortOrder || 0,
//       createdBy: req.user._id,
//     })

//     const createdSubCategory = await subcategory.save()
//     await createdSubCategory.populate("category", "name slug")

//     res.status(201).json(createdSubCategory)
//   }),
// )

// // @desc    Update a subcategory
// // @route   PUT /api/subcategories/:id
// // @access  Private/Admin
// router.put(
//   "/:id",
//   protect,
//   admin,
//   asyncHandler(async (req, res) => {
//     const { name, description, image, category, isActive, sortOrder } = req.body

//     const subcategory = await SubCategory.findById(req.params.id)

//     if (subcategory) {
//       // Check if another subcategory with same name exists (excluding current)
//       if (name && name.trim() !== subcategory.name) {
//         const existingSubCategory = await SubCategory.findOne({
//           name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
//           category: category || subcategory.category,
//           _id: { $ne: req.params.id },
//         })

//         if (existingSubCategory) {
//           res.status(400)
//           throw new Error("Subcategory with this name already exists in this category")
//         }
//       }

//       // Verify parent category if being changed
//       if (category && category !== subcategory.category.toString()) {
//         const parentCategory = await Category.findById(category)
//         if (!parentCategory) {
//           res.status(400)
//           throw new Error("Parent category not found")
//         }
//       }

//       subcategory.name = name?.trim() || subcategory.name
//       subcategory.description = description !== undefined ? description : subcategory.description
//       subcategory.image = image !== undefined ? image : subcategory.image
//       subcategory.category = category || subcategory.category
//       subcategory.isActive = isActive !== undefined ? isActive : subcategory.isActive
//       subcategory.sortOrder = sortOrder !== undefined ? sortOrder : subcategory.sortOrder

//       // Update slug if name changed
//       if (name && name.trim() !== subcategory.name) {
//         subcategory.slug = name.trim().toLowerCase().replace(/\s+/g, "-")
//       }

//       const updatedSubCategory = await subcategory.save()
//       await updatedSubCategory.populate("category", "name slug")

//       res.json(updatedSubCategory)
//     } else {
//       res.status(404)
//       throw new Error("Subcategory not found")
//     }
//   }),
// )

// // @desc    Delete a subcategory
// // @route   DELETE /api/subcategories/:id
// // @access  Private/Admin
// router.delete(
//   "/:id",
//   protect,
//   admin,
//   asyncHandler(async (req, res) => {
//     const subcategory = await SubCategory.findById(req.params.id)

//     if (subcategory) {
//       // Soft delete
//       subcategory.isDeleted = true
//       subcategory.isActive = false
//       subcategory.deletedAt = new Date()
//       await subcategory.save()

//       res.json({ message: "Subcategory deleted successfully" })
//     } else {
//       res.status(404)
//       throw new Error("Subcategory not found")
//     }
//   }),
// )

// // @desc    Get subcategories by category
// // @route   GET /api/subcategories/category/:categoryId
// // @access  Public
// router.get(
//   "/category/:categoryId",
//   asyncHandler(async (req, res) => {
//     const subcategories = await SubCategory.find({
//       category: req.params.categoryId,
//       isActive: { $ne: false },
//       isDeleted: { $ne: true },
//     })
//       .populate("category", "name slug")
//       .sort({ sortOrder: 1, name: 1 })

//     res.json(subcategories)
//   }),
// )

// export default router




//======================================Final +===============================






import express from "express"
import asyncHandler from "express-async-handler"
import SubCategory from "../models/subCategoryModel.js"
import Category from "../models/categoryModel.js"
import Product from "../models/productModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import { deleteLocalFile, isCloudinaryUrl } from "../config/multer.js"
import { logActivity } from "../middleware/permissionMiddleware.js"
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

// @desc    Fetch all subcategories (Admin only - includes inactive)
// @route   GET /api/subcategories/admin
// @access  Private/Admin
router.get(
  "/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { category, parentSubCategory, level } = req.query;
    let filter = { isDeleted: { $ne: true } }; // Admin sees all active and inactive
    
    if (category) {
      filter.category = category;
    }
    if (parentSubCategory) {
      filter.parentSubCategory = parentSubCategory;
    }
    if (level) {
      filter.level = parseInt(level);
    }
    
    const subCategories = await SubCategory.find(filter)
      .populate("category", "name slug _id")
      .populate("parentSubCategory", "name slug _id")
      .sort({ sortOrder: 1, name: 1 })
    
    // Transform the data to ensure category name is accessible
    const transformedSubCategories = subCategories.map(sub => {
      const subObj = sub.toObject()
      return {
        ...subObj,
        categoryName: sub.category?.name || 'Unknown',
        categoryId: sub.category?._id,
        parentSubCategoryName: sub.parentSubCategory?.name || null
      }
    })
    
    res.json(transformedSubCategories)
  }),
)

// @desc    Fetch all subcategories
// @route   GET /api/subcategories
// @access  Public
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { category, parentSubCategory, level } = req.query;
    let filter = { isActive: true, isDeleted: { $ne: true } };
    
    if (category) {
      filter.category = category;
    }
    if (parentSubCategory) {
      filter.parentSubCategory = parentSubCategory;
    }
    if (level) {
      filter.level = parseInt(level);
    }
    
    const subCategories = await SubCategory.find(filter)
      .populate("category", "name slug _id")
      .populate("parentSubCategory", "name slug _id")
      .sort({ sortOrder: 1, name: 1 });
    
    // Transform the data to ensure category name is accessible
    const transformedSubCategories = subCategories.map(sub => {
      const subObj = sub.toObject()
      return {
        ...subObj,
        categoryName: sub.category?.name || 'Unknown',
        categoryId: sub.category?._id,
        parentSubCategoryName: sub.parentSubCategory?.name || null
      }
    })
    
    res.json(transformedSubCategories);
  })
);

// @desc    Get nested subcategories by parent subcategory ID (Admin - includes inactive)
// @route   GET /api/subcategories/children/:parentId/admin
// @access  Private/Admin
router.get(
  "/children/:parentId/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const children = await SubCategory.find({
      parentSubCategory: req.params.parentId,
      isDeleted: { $ne: true },
    })
      .populate("category", "name slug")
      .populate("parentSubCategory", "name slug")
      .sort({ sortOrder: 1, name: 1 });
    res.json(children);
  })
);

// @desc    Get nested subcategories by parent subcategory ID
// @route   GET /api/subcategories/children/:parentId
// @access  Public
router.get(
  "/children/:parentId",
  asyncHandler(async (req, res) => {
    const children = await SubCategory.find({
      parentSubCategory: req.params.parentId,
      isActive: true,
      isDeleted: { $ne: true },
    })
      .populate("category", "name slug")
      .populate("parentSubCategory", "name slug")
      .sort({ sortOrder: 1, name: 1 });
    res.json(children);
  })
);

// @desc    Create a subcategory
// @route   POST /api/subcategories
// @access  Private/Admin
router.post(
  "/",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    try {
      const { name, description, seoContent, metaTitle, metaDescription, customSchema, redirectUrl, category, parentSubCategory, level, image, slug } = req.body

      console.log('Creating subcategory with data:', req.body)

      if (!name || name.trim() === "") {
        res.status(400)
        throw new Error("Subcategory name is required")
      }

      if (!category) {
        res.status(400)
        throw new Error("Parent category is required")
      }

      // Check if parent category exists
      const parentCategory = await Category.findById(category)
      if (!parentCategory) {
        res.status(400)
        throw new Error("Parent category not found")
      }

      // Validate parent subcategory if provided
      let parentSub = null
      if (parentSubCategory) {
        parentSub = await SubCategory.findById(parentSubCategory)
        if (!parentSub) {
          res.status(400)
          throw new Error("Parent subcategory not found")
        }
        // Ensure level is appropriate (parent level + 1)
        if (level && level <= parentSub.level) {
          res.status(400)
          throw new Error("Level must be greater than parent subcategory level")
        }
      }

      // Check if subcategory with same name already exists in this category/parent
      const existingSubCategory = await SubCategory.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
        category: category,
        parentSubCategory: parentSubCategory || null,
        isDeleted: { $ne: true }
      })

      if (existingSubCategory) {
        res.status(400)
        throw new Error("Subcategory with this name already exists")
      }

      // Generate slug if not provided
      let baseSlug = slug || name.trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
      
      // Build the full context-aware slug
      // For level 1: category-slug-subcategory-name
      // For level 2+: parent-slug-subcategory-name
      let contextPrefix = ""
      if (parentSubCategory && parentSub) {
        // For nested subcategories, use parent's slug as prefix
        contextPrefix = `${parentSub.slug}-`
      } else if (parentCategory) {
        // For level 1 subcategories, use category slug as prefix
        contextPrefix = `${parentCategory.slug}-`
      }
      
      let subCategorySlug = `${contextPrefix}${baseSlug}`

      // Check if slug already exists and make it unique
      let slugExists = await SubCategory.findOne({ slug: subCategorySlug, isDeleted: { $ne: true } })
      let counter = 1
      while (slugExists) {
        subCategorySlug = `${contextPrefix}${baseSlug}-${counter}`
        slugExists = await SubCategory.findOne({ slug: subCategorySlug, isDeleted: { $ne: true } })
        counter++
      }

      // Determine level automatically if not provided
      let subcategoryLevel = level || 1
      if (parentSubCategory && !level) {
        subcategoryLevel = parentSub.level + 1
      }

      // Translate only user-facing fields
      const nameAr = await translateText(name.trim());
      const descriptionAr = await translateText(description || "");

      const subcategory = new SubCategory({
        name: name.trim(),
        nameAr,
        description: description || "",
        descriptionAr,
        seoContent: seoContent || "",
        seoContentAr: "", // Excluded
        metaTitle: metaTitle || name.trim(),
        metaTitleAr: "", // Excluded
        metaDescription: metaDescription || "",
        metaDescriptionAr: "", // Excluded
        customSchema: customSchema || "",
        redirectUrl: redirectUrl || "",
        category: category,
        parentSubCategory: parentSubCategory || null,
        level: subcategoryLevel,
        image: image || "",
        slug: subCategorySlug,
        isActive: true,
        createdBy: req.user._id,
      })

      console.log('Saving subcategory:', subcategory)
      const createdSubCategory = await subcategory.save()
      
      // Populate with more fields to ensure data is returned properly
      await createdSubCategory.populate("category", "name slug _id")
      if (createdSubCategory.parentSubCategory) {
        await createdSubCategory.populate("parentSubCategory", "name slug _id")
      }
      
      // Transform response to include categoryName explicitly
      const responseData = {
        ...createdSubCategory.toObject(),
        categoryName: createdSubCategory.category?.name || 'Unknown',
        categoryId: createdSubCategory.category?._id,
        parentSubCategoryName: createdSubCategory.parentSubCategory?.name || null
      }
      
      // Log activity
      await logActivity(req, "CREATE", "SUBCATEGORIES", `Created subcategory: ${createdSubCategory.name}`, createdSubCategory._id, createdSubCategory.name)
      
      console.log('Subcategory created successfully:', responseData)
      res.status(201).json(responseData)
    } catch (error) {
      console.error('Error creating subcategory:', error)
      
      // Handle Mongoose validation errors
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message)
        res.status(400)
        throw new Error(messages.join(', '))
      }
      
      // Handle duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0]
        res.status(400)
        throw new Error(`${field} already exists. Please use a different value.`)
      }
      
      throw error
    }
  }),
)

// @desc    Update a subcategory
// @route   PUT /api/subcategories/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    try {
      const { name, description, seoContent, metaTitle, metaDescription, customSchema, redirectUrl, category, parentSubCategory, level, image, slug, isActive, showInSlider } = req.body

      console.log('Updating subcategory with data:', req.body)

      const subcategory = await SubCategory.findById(req.params.id)

      if (!subcategory || subcategory.isDeleted) {
        res.status(404)
        throw new Error("Subcategory not found")
      }

      // Check if another subcategory with same name exists (excluding current)
      if (name && name.trim() !== subcategory.name) {
        const parentSubCategoryId = parentSubCategory !== undefined ? parentSubCategory : subcategory.parentSubCategory
        const existingSubCategory = await SubCategory.findOne({
          name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
          category: category || subcategory.category,
          parentSubCategory: parentSubCategoryId || null,
          _id: { $ne: req.params.id },
          isDeleted: { $ne: true }
        })

        if (existingSubCategory) {
          res.status(400)
          throw new Error("Subcategory with this name already exists")
        }
      }

      // Validate parent category if provided
      if (category && category !== subcategory.category.toString()) {
        const parentCategory = await Category.findById(category)
        if (!parentCategory) {
          res.status(400)
          throw new Error("Parent category not found")
        }
      }

      // Validate parent subcategory if provided
      if (parentSubCategory) {
        const parentSub = await SubCategory.findById(parentSubCategory)
        if (!parentSub) {
          res.status(400)
          throw new Error("Parent subcategory not found")
        }
        // Ensure level is appropriate (parent level + 1)
        const newLevel = level !== undefined ? level : subcategory.level
        if (newLevel <= parentSub.level) {
          res.status(400)
          throw new Error("Level must be greater than parent subcategory level")
        }
      }

      // Handle slug update
      let newSlug = subcategory.slug
      const shouldUpdateSlug = (slug && slug !== subcategory.slug) || (name && name.trim() !== subcategory.name)
      
      if (shouldUpdateSlug) {
        // Generate base slug
        let baseSlug = slug || (name ? name.trim().toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") : subcategory.slug.split('-').pop())
        
        // Build context prefix based on parent
        let contextPrefix = ""
        const updatedParentSubCategory = parentSubCategory !== undefined ? parentSubCategory : subcategory.parentSubCategory
        const updatedCategory = category || subcategory.category
        
        if (updatedParentSubCategory) {
          const parentSub = await SubCategory.findById(updatedParentSubCategory)
          if (parentSub) {
            contextPrefix = `${parentSub.slug}-`
          }
        } else {
          const parentCat = await Category.findById(updatedCategory)
          if (parentCat && parentCat.slug) {
            contextPrefix = `${parentCat.slug}-`
          }
        }
        
        newSlug = `${contextPrefix}${baseSlug}`
        
        // Check if new slug already exists and make it unique
        let slugExists = await SubCategory.findOne({ 
          slug: newSlug, 
          _id: { $ne: req.params.id },
          isDeleted: { $ne: true }
        })
        let counter = 1
        while (slugExists) {
          newSlug = `${contextPrefix}${baseSlug}-${counter}`
          slugExists = await SubCategory.findOne({ 
            slug: newSlug, 
            _id: { $ne: req.params.id },
            isDeleted: { $ne: true }
          })
          counter++
        }
      }

      subcategory.name = name?.trim() || subcategory.name
      subcategory.description = description !== undefined ? description : subcategory.description
      subcategory.seoContent = seoContent !== undefined ? seoContent : subcategory.seoContent
      subcategory.metaTitle = metaTitle !== undefined ? metaTitle : subcategory.metaTitle
      subcategory.metaDescription = metaDescription !== undefined ? metaDescription : subcategory.metaDescription
      subcategory.customSchema = customSchema !== undefined ? customSchema : subcategory.customSchema
      subcategory.redirectUrl = redirectUrl !== undefined ? redirectUrl : subcategory.redirectUrl
      subcategory.category = category || subcategory.category
      subcategory.parentSubCategory = parentSubCategory !== undefined ? parentSubCategory : subcategory.parentSubCategory
      subcategory.level = level !== undefined ? level : subcategory.level
      subcategory.image = image !== undefined ? image : subcategory.image
      subcategory.slug = newSlug
      subcategory.isActive = isActive !== undefined ? isActive : subcategory.isActive
      subcategory.showInSlider = showInSlider !== undefined ? showInSlider : subcategory.showInSlider

      // Translate updated fields (excluding SEO/Meta)
      if (name !== undefined) subcategory.nameAr = await translateText(subcategory.name);
      if (description !== undefined) subcategory.descriptionAr = await translateText(subcategory.description);
      
      // Clear SEO/Meta translations (policy change)
      subcategory.seoContentAr = "";
      subcategory.metaTitleAr = "";
      subcategory.metaDescriptionAr = "";

      console.log('Saving updated subcategory:', subcategory)
      const updatedSubCategory = await subcategory.save()
      
      // Populate with more fields to ensure data is returned properly
      await updatedSubCategory.populate("category", "name slug _id")
      if (updatedSubCategory.parentSubCategory) {
        await updatedSubCategory.populate("parentSubCategory", "name slug _id")
      }
      
      // Transform response to include categoryName explicitly
      const responseData = {
        ...updatedSubCategory.toObject(),
        categoryName: updatedSubCategory.category?.name || 'Unknown',
        categoryId: updatedSubCategory.category?._id,
        parentSubCategoryName: updatedSubCategory.parentSubCategory?.name || null
      }
      
      // Log activity
      await logActivity(req, "UPDATE", "SUBCATEGORIES", `Updated subcategory: ${updatedSubCategory.name}`, updatedSubCategory._id, updatedSubCategory.name)
      
      console.log('Subcategory updated successfully:', responseData)
      res.json(responseData)
    } catch (error) {
      console.error('Error updating subcategory:', error)
      
      // Handle Mongoose validation errors
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message)
        res.status(400)
        throw new Error(messages.join(', '))
      }
      
      // Handle duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0]
        res.status(400)
        throw new Error(`${field} already exists. Please use a different value.`)
      }
      
      throw error
    }
  }),
)

// @desc    Get trash subcategories
// @route   GET /api/subcategories/trash
// @access  Private/Admin
router.get(
  "/trash",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const subcategories = await SubCategory.find({ isDeleted: true })
      .populate("category", "name slug _id")
      .populate("parentSubCategory", "name slug _id")
      .sort({ deletedAt: -1 })
    
    // Transform the data to ensure category name is accessible
    const transformedSubCategories = subcategories.map(sub => {
      const subObj = sub.toObject()
      return {
        ...subObj,
        categoryName: sub.category?.name || 'Unknown',
        categoryId: sub.category?._id,
        parentSubCategoryName: sub.parentSubCategory?.name || null
      }
    })
    
    res.json(transformedSubCategories)
  }),
)

// @desc    Restore a subcategory from trash
// @route   PUT /api/subcategories/:id/restore
// @access  Private/Admin
router.put(
  "/:id/restore",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const subcategory = await SubCategory.findById(req.params.id)

    if (subcategory && subcategory.isDeleted) {
      subcategory.isDeleted = false
      subcategory.isActive = true
      subcategory.deletedAt = null
      await subcategory.save()
      
      await subcategory.populate("category", "name slug _id")
      if (subcategory.parentSubCategory) {
        await subcategory.populate("parentSubCategory", "name slug _id")
      }
      
      // Log activity
      await logActivity(req, "RESTORE", "SUBCATEGORIES", `Restored subcategory: ${subcategory.name}`, subcategory._id, subcategory.name)
      
      res.json({ 
        message: "Subcategory restored successfully",
        subcategory: {
          ...subcategory.toObject(),
          categoryName: subcategory.category?.name || 'Unknown',
          categoryId: subcategory.category?._id,
          parentSubCategoryName: subcategory.parentSubCategory?.name || null
        }
      })
    } else {
      res.status(404)
      throw new Error("Subcategory not found in trash")
    }
  }),
)

// @desc    Permanently delete a subcategory
// @route   DELETE /api/subcategories/:id/permanent
// @access  Private/Admin
router.delete(
  "/:id/permanent",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const subcategory = await SubCategory.findById(req.params.id)

    if (subcategory && subcategory.isDeleted) {
      const subcategoryName = subcategory.name
      const subcategoryId = subcategory._id
      
      // Delete subcategory image
      if (subcategory.image && !isCloudinaryUrl(subcategory.image)) {
        try {
          await deleteLocalFile(subcategory.image)
        } catch (err) {
          console.error("Error deleting subcategory image:", err)
        }
      }

      await subcategory.deleteOne()
      
      // Log activity
      await logActivity(req, "DELETE", "SUBCATEGORIES", `Permanently deleted subcategory: ${subcategoryName}`, subcategoryId, subcategoryName)
      
      res.json({ message: "Subcategory permanently deleted" })
    } else {
      res.status(404)
      throw new Error("Subcategory not found in trash")
    }
  }),
)

// @desc    Get deletion info for a subcategory (product count and child subcategories)
// @route   GET /api/subcategories/:id/deletion-info
// @access  Private/Admin
router.get(
  "/:id/deletion-info",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const subcategory = await SubCategory.findById(req.params.id)

    if (!subcategory) {
      res.status(404)
      throw new Error("Subcategory not found")
    }

    // Count direct child subcategories
    const directChildren = await SubCategory.find({ 
      parentSubCategory: req.params.id,
      isDeleted: { $ne: true }
    })
    
    const directChildIds = directChildren.map(sub => sub._id)
    
    // Count grandchildren (Level 3)
    const grandChildren = await SubCategory.find({
      parentSubCategory: { $in: directChildIds },
      isDeleted: { $ne: true }
    })
    
    const grandChildIds = grandChildren.map(sub => sub._id)
    
    const totalChildCount = directChildren.length + grandChildren.length
    
    // Get all child IDs for product query
    const allChildIds = [...directChildIds, ...grandChildIds]
    
    // Count products in this subcategory and all its children
    const productCount = await Product.countDocuments({
      category: { $in: [req.params.id, ...allChildIds] }
    })

    res.json({
      subcategoryId: req.params.id,
      subcategoryName: subcategory.name,
      level: subcategory.level || 1,
      childCount: totalChildCount,
      directChildCount: directChildren.length,
      grandChildCount: grandChildren.length,
      productCount
    })
  }),
)

// @desc    Delete a subcategory with cascading (products and child subcategories)
// @route   DELETE /api/subcategories/:id/cascade
// @access  Private/Admin
router.delete(
  "/:id/cascade",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { moveProducts } = req.query // "true" if we should move products instead of deleting
    
    const subcategory = await SubCategory.findById(req.params.id)

    if (!subcategory) {
      res.status(404)
      throw new Error("Subcategory not found")
    }

    // Get all child subcategories at all levels
    const directChildren = await SubCategory.find({ 
      parentSubCategory: req.params.id,
      isDeleted: { $ne: true }
    })
    
    const directChildIds = directChildren.map(sub => sub._id)
    
    const grandChildren = await SubCategory.find({
      parentSubCategory: { $in: directChildIds },
      isDeleted: { $ne: true }
    })
    
    const allChildIds = [...directChildIds, ...grandChildren.map(sub => sub._id)]

    if (moveProducts === "true") {
      // Move products flow - return subcategory IDs that need handling
      // Frontend will show move modal
      res.json({
        message: "Products need to be moved",
        requiresMove: true,
        subcategoryId: req.params.id,
        childSubcategoryIds: allChildIds
      })
    } else {
      // Permanently delete everything
      // First, find and delete media files for all products
      const productsToDelete = await Product.find({
        category: { $in: [req.params.id, ...allChildIds] }
      })

      // Delete media files for all products
      for (const product of productsToDelete) {
        await deleteProductMediaFiles(product)
      }

      // Delete all products in this subcategory and its children
      await Product.deleteMany({
        category: { $in: [req.params.id, ...allChildIds] }
      })

      // Delete subcategory images
      const allSubcategories = [subcategory, ...directChildren, ...grandChildren]
      for (const sub of allSubcategories) {
        if (sub.image && !isCloudinaryUrl(sub.image)) {
          try {
            await deleteLocalFile(sub.image)
          } catch (err) {
            console.error("Error deleting subcategory image:", err)
          }
        }
      }

      // Delete all child subcategories
      await SubCategory.deleteMany({
        _id: { $in: allChildIds }
      })

      // Delete the subcategory itself
      await SubCategory.findByIdAndDelete(req.params.id)

      res.json({ 
        message: "Subcategory, child subcategories, and products permanently deleted",
        deletedCount: {
          subcategories: allChildIds.length,
          products: productsToDelete.length
        }
      })
    }
  }),
)

// @desc    Delete a subcategory
// @route   DELETE /api/subcategories/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const subcategory = await SubCategory.findById(req.params.id)

    if (subcategory && !subcategory.isDeleted) {
      // Soft delete - mark as deleted instead of removing
      subcategory.isDeleted = true
      subcategory.isActive = false
      subcategory.deletedAt = new Date()
      await subcategory.save()

      // Log activity
      await logActivity(req, "DELETE", "SUBCATEGORIES", `Moved subcategory to trash: ${subcategory.name}`, subcategory._id, subcategory.name)

      res.json({ message: "Subcategory moved to trash successfully" })
    } else {
      res.status(404)
      throw new Error("Subcategory not found")
    }
  }),
)

// @desc    Get subcategories by category (Admin - includes inactive)
// @route   GET /api/subcategories/category/:categoryId/admin
// @access  Private/Admin
router.get(
  "/category/:categoryId/admin",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const subcategories = await SubCategory.find({
      category: req.params.categoryId,
      isDeleted: { $ne: true },
    })
      .populate("category", "name")
      .sort({ name: 1 })

    res.json(subcategories)
  }),
)

// @desc    Get subcategories by category
// @route   GET /api/subcategories/category/:categoryId
// @access  Public
router.get(
  "/category/:categoryId",
  asyncHandler(async (req, res) => {
    const subcategories = await SubCategory.find({
      category: req.params.categoryId,
      isActive: { $ne: false },
      isDeleted: { $ne: true },
    })
      .populate("category", "name")
      .sort({ name: 1 })

    res.json(subcategories)
  }),
)

// @desc    Get a subcategory by ID
// @route   GET /api/subcategories/:id
// @access  Private/Admin
router.get(
  "/:id",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    console.log(`Fetching subcategory with ID: ${req.params.id}`)
    try {
      const subcategory = await SubCategory.findById(req.params.id).populate("category", "name slug")
      
      console.log(`Subcategory found:`, subcategory ? 'Yes' : 'No')
      
      if (subcategory && !subcategory.isDeleted) {
        res.json(subcategory)
      } else {
        res.status(404)
        throw new Error("Subcategory not found")
      }
    } catch (error) {
      console.error(`Error fetching subcategory: ${error.message}`)
      res.status(404)
      throw new Error(`Subcategory not found: ${error.message}`)
    }
  }),
)

export default router
