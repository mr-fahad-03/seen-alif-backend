import express from "express"
import { upload, uploadBanner, uploadProductImage, uploadVideo, deleteLocalFile, isCloudinaryUrl } from "../config/multer.js"
import { deleteFromCloudinary } from "../utils/cloudinary.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import asyncHandler from "express-async-handler"

const router = express.Router()

// @desc    Upload single image
// @route   POST /api/upload/single
// @access  Private/Admin
router.post(
  "/single",
  (req, res, next) => {
    console.log("📤 Single upload request received")
    console.log("🔐 Authorization header:", req.headers.authorization ? "Present" : "Missing")
    next()
  },
  protect,
  admin,
  upload.single("image"),
  (req, res) => {
    try {
      console.log("📁 File upload attempt")
      console.log("📋 Request body keys:", Object.keys(req.body))
      console.log("📋 Request file:", req.file ? "Present" : "Missing")

      if (!req.file) {
        console.log("❌ No file uploaded")
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        })
      }

      // Generate URL path for the uploaded file
      const fileUrl = `/uploads/${req.file.path.split("uploads")[1].replace(/\\/g, "/")}`

      console.log("✅ File uploaded successfully:")
      console.log("📍 File Path:", req.file.path)
      console.log("📍 URL:", fileUrl)
      console.log("📝 Filename:", req.file.filename)

      res.json({
        success: true,
        message: "Image uploaded successfully",
        url: fileUrl,
        publicId: req.file.filename, // For backward compatibility
        filename: req.file.filename,
        path: fileUrl,
      })
    } catch (error) {
      console.error("❌ Upload error:", error)
      res.status(500).json({
        success: false,
        message: "Upload failed",
        error: error.message,
      })
    }
  },
)

// @desc    Upload multiple images
// @route   POST /api/upload/multiple
// @access  Private/Admin
router.post(
  "/multiple",
  (req, res, next) => {
    console.log("📤 Multiple upload request received")
    next()
  },
  protect,
  admin,
  upload.array("images", 5),
  (req, res) => {
    try {
      console.log("📁 Multiple file upload attempt")
      console.log("📋 Files count:", req.files ? req.files.length : 0)

      if (!req.files || req.files.length === 0) {
        console.log("❌ No files uploaded")
        return res.status(400).json({
          success: false,
          message: "No files uploaded",
        })
      }

      const files = req.files.map((file) => {
        const fileUrl = `/uploads/${file.path.split("uploads")[1].replace(/\\/g, "/")}`
        console.log("✅ File processed:", file.originalname, "->", fileUrl)
        return {
          url: fileUrl,
          publicId: file.filename, // For backward compatibility
          filename: file.filename,
          path: fileUrl,
        }
      })

      console.log("✅ All files uploaded successfully")

      res.json({
        success: true,
        message: "Images uploaded successfully",
        files: files,
      })
    } catch (error) {
      console.error("❌ Multiple upload error:", error)
      res.status(500).json({
        success: false,
        message: "Upload failed",
        error: error.message,
      })
    }
  },
)

// @desc    Upload banner image (high-res, no transformation)
// @route   POST /api/upload/banner
// @access  Private/Admin
router.post(
  "/banner",
  uploadBanner.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const fileUrl = `/uploads/${req.file.path.split("uploads")[1].replace(/\\/g, "/")}`;
    res.json({ 
      url: fileUrl,
      filename: req.file.filename,
      path: fileUrl
    });
  })
);

// @desc    Upload product image (WebP only)
// @route   POST /api/upload/product-image
// @access  Private/Admin
router.post(
  "/product-image",
  (req, res, next) => {
    console.log("📤 Product image upload request received")
    next()
  },
  protect,
  admin,
  uploadProductImage.single("image"),
  (req, res) => {
    try {
      console.log("📁 Product image upload attempt")
      
      if (!req.file) {
        console.log("❌ No file uploaded")
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        })
      }

      const fileUrl = `/uploads/${req.file.path.split("uploads")[1].replace(/\\/g, "/")}`

      console.log("✅ Product image uploaded successfully:", fileUrl)

      res.json({
        success: true,
        message: "Product image uploaded successfully",
        url: fileUrl,
        publicId: req.file.filename,
        filename: req.file.filename,
        path: fileUrl,
      })
    } catch (error) {
      console.error("❌ Product image upload error:", error)
      res.status(500).json({
        success: false,
        message: "Upload failed",
        error: error.message,
      })
    }
  }
)

// @desc    Upload multiple product images (WebP only)
// @route   POST /api/upload/product-images
// @access  Private/Admin
router.post(
  "/product-images",
  protect,
  admin,
  uploadProductImage.array("images", 10),
  (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files uploaded",
        })
      }

      const files = req.files.map((file) => {
        const fileUrl = `/uploads/${file.path.split("uploads")[1].replace(/\\/g, "/")}`
        return {
          url: fileUrl,
          publicId: file.filename,
          filename: file.filename,
          path: fileUrl,
        }
      })

      res.json({
        success: true,
        message: "Product images uploaded successfully",
        files: files,
      })
    } catch (error) {
      console.error("❌ Multiple product images upload error:", error)
      res.status(500).json({
        success: false,
        message: "Upload failed",
        error: error.message,
      })
    }
  }
)

// @desc    Upload video (MP4/WebM only)
// @route   POST /api/upload/video
// @access  Private/Admin
router.post(
  "/video",
  (req, res, next) => {
    console.log("📤 Video upload request received")
    next()
  },
  protect,
  admin,
  uploadVideo.single("video"),
  (req, res) => {
    try {
      console.log("📁 Video upload attempt")
      
      if (!req.file) {
        console.log("❌ No video uploaded")
        return res.status(400).json({
          success: false,
          message: "No video uploaded",
        })
      }

      const fileUrl = `/uploads/${req.file.path.split("uploads")[1].replace(/\\/g, "/")}`

      console.log("✅ Video uploaded successfully:", fileUrl)

      res.json({
        success: true,
        message: "Video uploaded successfully",
        url: fileUrl,
        publicId: req.file.filename,
        filename: req.file.filename,
        path: fileUrl,
        size: req.file.size,
      })
    } catch (error) {
      console.error("❌ Video upload error:", error)
      res.status(500).json({
        success: false,
        message: "Upload failed",
        error: error.message,
      })
    }
  }
)

// @desc    Delete image (supports both local files and Cloudinary)
// @route   DELETE /api/upload/:publicId
// @access  Private/Admin
router.delete("/:publicId", protect, admin, async (req, res) => {
  try {
    const { publicId } = req.params
    console.log("🗑️ Delete request for:", publicId)

    let result

    // Check if it's a Cloudinary URL or publicId
    if (isCloudinaryUrl(publicId)) {
      // Extract publicId from Cloudinary URL
      const cloudinaryPublicId = publicId.split("/").pop().split(".")[0]
      result = await deleteFromCloudinary(cloudinaryPublicId)
    } else if (publicId.includes("/uploads/") || publicId.includes("uploads/")) {
      // It's a local file path
      result = await deleteLocalFile(publicId)
    } else {
      // Assume it's a Cloudinary publicId
      result = await deleteFromCloudinary(publicId)
    }

    res.json({
      success: true,
      message: "Image deleted successfully",
      result,
    })
  } catch (error) {
    console.error("❌ Delete error:", error)
    res.status(500).json({
      success: false,
      message: "Delete failed",
      error: error.message,
    })
  }
})

// Test route to check if upload route is working
router.get("/test", (req, res) => {
  res.json({
    message: "Upload routes are working",
    timestamp: new Date().toISOString(),
  })
})

export default router
