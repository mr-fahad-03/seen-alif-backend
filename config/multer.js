import multer from "multer"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"

// Get current directory in ES module
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "..", "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
  console.log("✅ Created uploads directory:", uploadsDir)
}

// Create subdirectories for different types of uploads
const createSubDirectory = (subDir) => {
  const dirPath = path.join(uploadsDir, subDir)
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
    console.log(`✅ Created ${subDir} directory:`, dirPath)
  }
  return dirPath
}

// Create subdirectories
createSubDirectory("products")
createSubDirectory("banners")
createSubDirectory("brands")
createSubDirectory("categories")
createSubDirectory("blogs")
createSubDirectory("reviews")
createSubDirectory("videos")
createSubDirectory("others")

// Configure multer storage for regular images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine the subdirectory based on the upload context
    let subDir = "others"
    
    if (req.baseUrl.includes("product") || req.body.type === "product") {
      subDir = "products"
    } else if (req.baseUrl.includes("banner") || req.body.type === "banner") {
      subDir = "banners"
    } else if (req.baseUrl.includes("brand") || req.body.type === "brand") {
      subDir = "brands"
    } else if (req.baseUrl.includes("category") || req.body.type === "category") {
      subDir = "categories"
    } else if (req.baseUrl.includes("blog") || req.body.type === "blog") {
      subDir = "blogs"
    } else if (req.baseUrl.includes("review") || req.body.type === "review") {
      subDir = "reviews"
    }

    const destPath = path.join(uploadsDir, subDir)
    cb(null, destPath)
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-randomstring-originalname
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    const nameWithoutExt = path.basename(file.originalname, ext)
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, "_")
    cb(null, sanitizedName + "-" + uniqueSuffix + ext)
  },
})

// Configure multer storage for banners (high-res)
const bannerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const destPath = path.join(uploadsDir, "banners")
    cb(null, destPath)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    const nameWithoutExt = path.basename(file.originalname, ext)
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, "_")
    cb(null, "banner-" + sanitizedName + "-" + uniqueSuffix + ext)
  },
})

// Configure multer storage for product images
const productStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const destPath = path.join(uploadsDir, "products")
    cb(null, destPath)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    const nameWithoutExt = path.basename(file.originalname, ext)
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, "_")
    cb(null, "product-" + sanitizedName + "-" + uniqueSuffix + ext)
  },
})

// File filter for images
const imageFileFilter = (req, file, cb) => {
  console.log("📁 File received:", file.originalname, file.mimetype)

  const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error("Only image files (JPEG, PNG, GIF, WebP) are allowed!"), false)
  }
}

// File filter for product images (WebP only)
const productImageFileFilter = (req, file, cb) => {
  console.log("📁 Product image received:", file.originalname, file.mimetype)

  if (file.mimetype === "image/webp") {
    cb(null, true)
  } else {
    cb(new Error("Only WebP images are allowed for products!"), false)
  }
}

// File filter for videos
const videoFileFilter = (req, file, cb) => {
  console.log("🎥 Video received:", file.originalname, file.mimetype)

  const allowedMimes = ["video/mp4", "video/webm"]
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error("Only MP4 and WebM videos are allowed!"), false)
  }
}

// Configure multer storage for videos
const videoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const destPath = path.join(uploadsDir, "videos")
    cb(null, destPath)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    const nameWithoutExt = path.basename(file.originalname, ext)
    const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, "_")
    cb(null, "video-" + sanitizedName + "-" + uniqueSuffix + ext)
  },
})

// Create multer upload middleware for regular images
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: imageFileFilter,
})

// Create multer upload middleware for banners (higher size limit)
export const uploadBanner = multer({
  storage: bannerStorage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit for banners
  },
  fileFilter: imageFileFilter,
})

// Create multer upload middleware for product images (WebP only)
export const uploadProductImage = multer({
  storage: productStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: productImageFileFilter,
})

// Create multer upload middleware for videos
export const uploadVideo = multer({
  storage: videoStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
  },
  fileFilter: videoFileFilter,
})

// Helper function to delete local file
export const deleteLocalFile = async (filePath) => {
  try {
    // Handle both full paths and relative paths
    let fullPath = filePath
    
    // If it's a URL path (starts with /uploads), convert to file system path
    if (filePath.startsWith("/uploads")) {
      fullPath = path.join(__dirname, "..", filePath)
    } else if (filePath.startsWith("uploads")) {
      fullPath = path.join(__dirname, "..", filePath)
    }
    
    console.log("🗑️ Deleting local file:", fullPath)
    
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
      console.log("✅ File deleted successfully")
      return { result: "ok" }
    } else {
      console.log("⚠️ File not found:", fullPath)
      return { result: "not found" }
    }
  } catch (error) {
    console.error("❌ Error deleting local file:", error)
    throw error
  }
}

// Helper function to check if a URL is a Cloudinary URL
export const isCloudinaryUrl = (url) => {
  return url && (url.includes("cloudinary.com") || url.includes("res.cloudinary"))
}

console.log("✅ Multer configuration loaded - Local file storage active")

export default { upload, uploadBanner, uploadProductImage, uploadVideo, deleteLocalFile, isCloudinaryUrl }
