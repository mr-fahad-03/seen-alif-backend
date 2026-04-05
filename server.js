import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import sharp from "sharp"
import connectDB, { connectBlogDB } from "./config/db.js"
import config from "./config/config.js"
import { notFound, errorHandler } from "./middleware/errorMiddleware.js"
import cacheService from "./services/cacheService.js"
import { attachCacheService, autoInvalidateAllCacheOnMutation } from "./middleware/cacheMiddleware.js"

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import googleMerchantRoutes from "./routes/googleMerchantRoutes.js"
import acerProductsRoutes from "./routes/acerProductsRoutes.js"
import sitemapRoutes from './routes/sitemapRoutes.js'

// Routes
import userRoutes from "./routes/userRoutes.js"
import productRoutes from "./routes/productRoutes.js"
import orderRoutes from "./routes/orderRoutes.js"
import uploadRoutes from "./routes/uploadRoutes.js"
import categoryRoutes from "./routes/categoryRoutes.js"
import subCategoryRoutes from "./routes/subCategoryRoutes.js"
import brandRoutes from "./routes/brandRoutes.js"
import colorRoutes from "./routes/colorRoutes.js"
import sizeRoutes from "./routes/sizeRoutes.js"
import unitRoutes from "./routes/unitRoutes.js"
import volumeRoutes from "./routes/volumeRoutes.js"
import warrantyRoutes from "./routes/warrantyRoutes.js"
import taxRoutes from "./routes/taxRoutes.js"
import deliveryChargeRoutes from "./routes/deliveryChargeRoutes.js"
import couponRoutes from "./routes/couponRoutes.js"
import bannerRoutes from "./routes/bannerRoutes.js"
import bannerCardRoutes from "./routes/bannerCardRoutes.js"
import homeSectionRoutes from "./routes/homeSectionRoutes.js"
import offerPageRoutes from "./routes/offerPageRoutes.js"
import offerProductRoutes from "./routes/offerProductRoutes.js"
import offerBrandRoutes from "./routes/offerBrandRoutes.js"
import offerCategoryRoutes from "./routes/offerCategoryRoutes.js"
import gamingZonePageRoutes from "./routes/gamingZonePageRoutes.js"
import gamingZoneCategoryRoutes from "./routes/gamingZoneCategoryRoutes.js"
import gamingZoneBrandRoutes from "./routes/gamingZoneBrandRoutes.js"
import blogRoutes from "./routes/blogRoutes.js"
import blogCategoryRoutes from "./routes/blogCategoryRoutes.js"
import blogTopicRoutes from "./routes/blogTopicRoutes.js"
import blogRatingRoutes from "./routes/blogRatingRoutes.js"
import blogBrandRoutes from "./routes/blogBrandRoutes.js"
import blogCommentRoutes from "./routes/blogCommentRoutes.js"
import blogDashboardRoutes from "./routes/blogDashboardRoutes.js"
import settingsRoutes from "./routes/settingsRoutes.js"
import wishlistRoutes from "./routes/wishlistRoutes.js"
import requestCallbackRoutes from "./routes/requestCallbackRoutes.js"
import paymentRoutes from "./routes/paymentRoutes.js"
import adminRoutes from "./routes/adminRoutes.js"
import emailTemplateRoutes from "./routes/emailTemplateRoutes.js"
import newsletterRoutes from "./routes/newsletterRoutes.js"
import tamaraAdminRoutes from "./routes/tamaraAdminRoutes.js"
import { captureRawBody, webhookRateLimit, authenticateWebhook } from "./middleware/webhookMiddleware.js"
import appRoutes from "./routes/appRoutes.js"
import mobileApiRoutes from "./routes/mobileApiRoutes.js"
import reviewRoutes from "./routes/reviewRoutes.js"
import adminReviewRoutes from "./routes/adminReviewRoutes.js"
import priceAdjustmentRoutes from "./routes/priceAdjustmentRoutes.js"
import redirectRoutes from "./routes/redirectRoutes.js"
import bulkPurchaseRoutes from "./routes/bulkPurchaseRoutes.js"
import buyerProtectionRoutes from "./routes/buyerProtectionRoutes.js"
import cacheRoutes from "./routes/cacheRoutes.js"
import customSliderItemRoutes from "./routes/customSliderItemRoutes.js"
import superAdminRoutes from "./routes/superAdminRoutes.js"
import reportsRoutes from "./routes/reportsRoutes.js"
import homepageRoutes from "./routes/homepageRoutes.js"

dotenv.config()

// Connect to databases - await both
await connectDB()
await connectBlogDB()

// Initialize cache service
await cacheService.initialize()
console.log('📦 Cache service initialized')


const app = express()

// Trust proxy - required to get real IP address behind proxies (Vercel, Cloudflare, etc.)
app.set('trust proxy', true)

// CORS configuration
app.use(cors({
  origin: [
    'https://www.graba2z.ae',
    'https://www.grabatoz.ae',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
  exposedHeaders: ['WWW-Authenticate', 'Server-Authorization'],
  maxAge: 86400,
  credentials: true,
  optionsSuccessStatus: 200
}));

app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.send();
});

const uploadsPath = path.join(__dirname, 'uploads');

// Dynamic image optimization for local /uploads assets.
// Example: /uploads/products/a.webp?w=330&h=330&q=70&fmt=webp
app.get('/uploads/*', async (req, res, next) => {
  try {
    const width = Number.parseInt(req.query.w, 10) || 0
    const height = Number.parseInt(req.query.h, 10) || 0
    const quality = Math.min(100, Math.max(1, Number.parseInt(req.query.q, 10) || 72))
    const format = String(req.query.fmt || "").toLowerCase()

    // Only optimize when a target dimension is requested.
    if (!width && !height) return next()

    // req.path can be "/uploads//products/file.webp" - normalize and strip route prefix.
    const normalizedPath = String(req.path || "").replace(/\\/g, "/").replace(/\/+/g, "/")
    const relPath = normalizedPath.replace(/^\/uploads\/?/, "")
    if (!relPath) return next()
    const absPath = path.resolve(uploadsPath, relPath)
    if (!absPath.startsWith(path.resolve(uploadsPath))) return res.status(400).send("Invalid image path")

    let pipeline = sharp(absPath).rotate().resize({
      width: width || undefined,
      height: height || undefined,
      fit: "inside",
      withoutEnlargement: true,
    })

    // Default modern output.
    if (format === "jpeg" || format === "jpg") {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true })
      res.type("image/jpeg")
    } else if (format === "png") {
      pipeline = pipeline.png({ quality })
      res.type("image/png")
    } else if (format === "avif") {
      pipeline = pipeline.avif({ quality })
      res.type("image/avif")
    } else {
      pipeline = pipeline.webp({ quality })
      res.type("image/webp")
    }

    res.setHeader("Cache-Control", "public, max-age=31536000, immutable")
    const output = await pipeline.toBuffer()
    return res.send(output)
  } catch (error) {
    return next()
  }
})

// Serve static files from uploads directory
app.use('/uploads', express.static(uploadsPath));

// Add logging for static file requests
app.use('/uploads', (req, res, next) => {
  console.log('📁 Static file request:', req.path);
  next();
});

console.log('📂 Serving static files from:', uploadsPath);

// Apply webhook middleware before body parser for webhook routes
app.use("/api/payment/tamara/webhook", captureRawBody, webhookRateLimit, authenticateWebhook)

// Body parser middleware
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Attach cache service to all requests
app.use(attachCacheService)

// Keep server cache in sync automatically after any successful data mutation.
app.use(autoInvalidateAllCacheOnMutation())

// Routes
app.use("/api/users", userRoutes)
app.use("/api/products", productRoutes)
app.use("/api/orders", orderRoutes)
app.use("/api/upload", uploadRoutes)
app.use("/api/categories", categoryRoutes)
app.use("/api/subcategories", subCategoryRoutes)
app.use("/api/brands", brandRoutes)
app.use("/api/colors", colorRoutes)
app.use("/api/sizes", sizeRoutes)
app.use("/api/units", unitRoutes)
app.use("/api/volumes", volumeRoutes)
app.use("/api/warranty", warrantyRoutes)
app.use("/api/tax", taxRoutes)
app.use("/api/delivery-charges", deliveryChargeRoutes)
app.use("/api/coupons", couponRoutes)
app.use("/api/banners", bannerRoutes)
app.use("/api/banner-cards", bannerCardRoutes)
app.use("/api/home-sections", homeSectionRoutes)
app.use("/api/offer-pages", offerPageRoutes)
app.use("/api/offer-products", offerProductRoutes)
app.use("/api/offer-brands", offerBrandRoutes)
app.use("/api/offer-categories", offerCategoryRoutes)
app.use("/api/gaming-zone-pages", gamingZonePageRoutes)
app.use("/api/gaming-zone-categories", gamingZoneCategoryRoutes)
app.use("/api/gaming-zone-brands", gamingZoneBrandRoutes)
app.use("/api/blogs", blogRoutes)
app.use("/api/blog-categories", blogCategoryRoutes)
app.use("/api/blog-topics", blogTopicRoutes)
app.use("/api/blog-ratings", blogRatingRoutes)
app.use("/api/blog-brands", blogBrandRoutes)
app.use("/api/blog-comments", blogCommentRoutes)
app.use("/api/blog-dashboard", blogDashboardRoutes)
app.use("/api/settings", settingsRoutes)
app.use("/api/wishlist", wishlistRoutes)
app.use("/api/request-callback", requestCallbackRoutes)
app.use("/api/bulk-purchase", bulkPurchaseRoutes)
app.use("/api/payment", paymentRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/super-admin", superAdminRoutes)
app.use("/api/reports", reportsRoutes)
app.use("/api/email-templates", emailTemplateRoutes)
app.use("/api/newsletter", newsletterRoutes)

// Optimized homepage endpoint (combines multiple API calls)
app.use("/api/homepage", homepageRoutes)

app.use("/api/price-adjustment", priceAdjustmentRoutes)
app.use("/api/redirects", redirectRoutes)
app.use("/api/buyer-protection", buyerProtectionRoutes)
app.use("/api/cache", cacheRoutes)
app.use("/api/custom-slider-items", customSliderItemRoutes)
// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@


app.use("/api/google-merchant", googleMerchantRoutes)
app.use("/acer-products", acerProductsRoutes)
app.use('/api/app', appRoutes)
app.use('/api/mobile', mobileApiRoutes)


// Add review routes
app.use("/api/reviews", reviewRoutes)
app.use("/api/admin/reviews", adminReviewRoutes)



app.use('/', sitemapRoutes)   

// Health check route
app.get("/", (req, res) => {
  res.json({
    message: "GrabA2Z API is running!",
    version: "1.0.0",
    environment: config.NODE_ENV,
  })
})

// Add a simple test route
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Server working!', 
    time: new Date(),
    uploadsPath: './uploads'
  });
});

// Error handling middleware
app.use(notFound)
app.use(errorHandler)

const PORT = config.PORT

app.listen(PORT, () => {
  console.log(`Server running in ${config.NODE_ENV} mode on port ${PORT}`)
})

