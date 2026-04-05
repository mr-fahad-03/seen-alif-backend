import dotenv from "dotenv"

dotenv.config()

const config = {
  // Server Configuration
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",

  // Database Configuration
  MONGO_URI: process.env.MONGO_URI,
  MONGODB_URI_2: process.env.MONGODB_URI_2, // Separate MongoDB for blogs

  // Redis Cache Configuration
  REDIS_URL: process.env.REDIS_URL, // Redis connection URL (optional - falls back to memory cache)
  CACHE_ENABLED: process.env.CACHE_ENABLED !== 'false', // Enable/disable caching
  CACHE_DEFAULT_TTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 3600, // Default TTL in seconds

  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET,

  // Email Configuration
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM || process.env.EMAIL_USER,

  // Frontend URL
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",

  // Payment Gateway Configuration
  TAMARA_API_KEY: process.env.TAMARA_API_KEY,
  TAMARA_API_URL: process.env.TAMARA_API_URL || "https://api.tamara.co",

  TABBY_SECRET_KEY: process.env.TABBY_SECRET_KEY,
  TABBY_API_URL: process.env.TABBY_API_URL || "https://api.tabby.ai",

  NGENIUS_API_URL: process.env.NGENIUS_API_URL,
  NGENIUS_REALM: process.env.NGENIUS_REALM,
  NGENIUS_API_KEY: process.env.NGENIUS_API_KEY,
  NGENIUS_API_SECRET: process.env.NGENIUS_API_SECRET,
  NGENIUS_OUTLET_ID: process.env.NGENIUS_OUTLET_ID,

  // Cloudinary Configuration
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
}

export default config
