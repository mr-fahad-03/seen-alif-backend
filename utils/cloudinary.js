import dotenv from "dotenv"

// Load environment variables
dotenv.config()

import { v2 as cloudinary } from "cloudinary"
import { CloudinaryStorage } from "multer-storage-cloudinary"
import multer from "multer"

// Debug environment variables
console.log("🔍 Cloudinary Utils - Environment Check:")
console.log("CLOUDINARY_CLOUD_NAME:", process.env.CLOUDINARY_CLOUD_NAME || "❌ MISSING")
console.log("CLOUDINARY_API_KEY:", process.env.CLOUDINARY_API_KEY || "❌ MISSING")
console.log("CLOUDINARY_API_SECRET:", process.env.CLOUDINARY_API_SECRET ? "✅ SET" : "❌ MISSING")

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Test Cloudinary configuration
const testCloudinaryConfig = () => {
  const config = cloudinary.config()

  console.log("🔧 Cloudinary Config Test:")
  console.log("Cloud Name:", config.cloud_name || "❌ MISSING")
  console.log("API Key:", config.api_key || "❌ MISSING")
  console.log("API Secret:", config.api_secret ? "✅ SET" : "❌ MISSING")

  if (!config.cloud_name || !config.api_key || !config.api_secret) {
    console.error("❌ Cloudinary configuration incomplete!")
    return false
  }

  console.log("✅ Cloudinary configuration complete!")
  return true
}

// Test configuration
testCloudinaryConfig()

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "ecommerce",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [
      {
        width: 1200,
        height: 1200,
        crop: "limit",
        quality: "auto:good",
      },
    ],
  },
})

// High-res banner storage (no transformation)
const bannerStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "ecommerce/banners",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    // No transformation: upload original file as-is
  },
});

// Create multer upload middleware
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log("📁 File received:", file.originalname, file.mimetype)

    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Only image files are allowed!"), false)
    }
  },
})

// Banner upload middleware (no transformation)
export const uploadBanner = multer({
  storage: bannerStorage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit for banners
  },
  fileFilter: (req, file, cb) => {
    console.log("📁 Banner file received:", file.originalname, file.mimetype)
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Only image files are allowed!"), false)
    }
  },
});

// Helper function to delete image from Cloudinary
export const deleteFromCloudinary = async (publicId) => {
  try {
    console.log("🗑️ Deleting image from Cloudinary:", publicId)
    const result = await cloudinary.uploader.destroy(publicId)
    console.log("✅ Delete result:", result)
    return result
  } catch (error) {
    console.error("❌ Error deleting from Cloudinary:", error)
    throw error
  }
}

export { cloudinary }
export default cloudinary
