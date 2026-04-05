import express from "express"
import asyncHandler from "express-async-handler"
import Product from "../models/productModel.js"
import Category from "../models/categoryModel.js"
import SubCategory from "../models/subCategoryModel.js"
import Brand from "../models/brandModel.js"
import Blog from "../models/blogModel.js"
import BlogCategory from "../models/blogCategoryModel.js"
import OfferPage from "../models/offerPageModel.js"
import GamingZonePage from "../models/gamingZonePageModel.js"

const router = express.Router()
const baseUrl = "https://www.grabatoz.ae"
const localePrefixes = ["/ae-en", "/ae-ar"]

const formatDate = (date) => {
  const parsed = date ? new Date(date) : new Date()
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

const escapeXml = (unsafe) => {
  if (!unsafe) return ""
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

const normalizePath = (path = "") => {
  if (!path) return ""
  return path.startsWith("/") ? path : `/${path}`
}

const withLocales = (path = "") => {
  const normalizedPath = normalizePath(path)
  return localePrefixes.map((prefix) => `${prefix}${normalizedPath}`)
}

const toId = (value) => {
  if (!value) return null
  if (typeof value === "object" && value._id) return String(value._id)
  return String(value)
}

const buildSubcategoryPath = (subCategory, categorySlugById, subById) => {
  const categoryId = toId(subCategory.category)
  const categorySlug = categorySlugById.get(categoryId)
  if (!categorySlug) return null

  const segments = []
  const seen = new Set()
  let current = subCategory

  while (current) {
    const currentId = toId(current._id)
    if (!currentId || seen.has(currentId)) return null
    seen.add(currentId)

    if (!current.slug) return null
    segments.unshift(current.slug)

    const parentId = toId(current.parentSubCategory)
    if (!parentId) break
    current = subById.get(parentId)
  }

  if (segments.length === 0) return null
  return `/product-category/${categorySlug}/${segments.join("/")}`
}

const toUrlNode = (loc, lastmod, changefreq, priority) => {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${formatDate(lastmod)}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>
`
}

// @desc    Generate sitemap.xml
// @route   GET /sitemap.xml
// @access  Public
router.get(
  "/sitemap.xml",
  asyncHandler(async (req, res) => {
    try {
      const [products, categories, subCategories, brands, blogs, blogCategories, offerPages, gamingZonePages] =
        await Promise.all([
          Product.find({ isActive: true, isDeleted: { $ne: true } }).select("slug updatedAt").lean(),
          Category.find({ isActive: true, isDeleted: { $ne: true } }).select("_id slug updatedAt").lean(),
          SubCategory.find({ isActive: true, isDeleted: { $ne: true } })
            .select("_id slug updatedAt category parentSubCategory")
            .lean(),
          Brand.find({ isActive: true }).select("slug name updatedAt").lean(),
          Blog.find({ status: "published" }).select("slug updatedAt").lean(),
          BlogCategory.find({ isActive: true }).select("_id slug updatedAt").lean(),
          OfferPage.find({ isActive: true }).select("slug updatedAt").lean(),
          GamingZonePage.find({ isActive: true }).select("slug updatedAt").lean(),
        ])

      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
`

      const emitted = new Set()
      const addEntry = ({ path, lastmod, changefreq = "weekly", priority = "0.6", includeLocales = true }) => {
        const localizedPaths = includeLocales ? withLocales(path) : [normalizePath(path)]

        for (const localizedPath of localizedPaths) {
          const loc = `${baseUrl}${localizedPath}`
          if (emitted.has(loc)) continue
          emitted.add(loc)
          xml += toUrlNode(loc, lastmod, changefreq, priority)
        }
      }

      // Root redirects to /ae-en in the app, so keep localized homepages as canonical sitemap entries.
      const staticPages = [
        { path: "", priority: "1.0", changefreq: "daily" },
        { path: "/shop", priority: "0.9", changefreq: "daily" },
        { path: "/product-category", priority: "0.9", changefreq: "daily" },
        { path: "/about", priority: "0.8", changefreq: "monthly" },
        { path: "/contact", priority: "0.8", changefreq: "monthly" },
        { path: "/cart", priority: "0.6", changefreq: "weekly" },
        { path: "/track-order", priority: "0.6", changefreq: "weekly" },
        { path: "/blogs", priority: "0.8", changefreq: "daily" },
        { path: "/privacy-policy", priority: "0.5", changefreq: "yearly" },
        { path: "/terms-conditions", priority: "0.5", changefreq: "yearly" },
        { path: "/delivery-terms", priority: "0.6", changefreq: "monthly" },
        { path: "/disclaimer-policy", priority: "0.5", changefreq: "yearly" },
        { path: "/cookies-policy", priority: "0.5", changefreq: "yearly" },
        { path: "/refund-return", priority: "0.5", changefreq: "yearly" },
        { path: "/voucher-terms", priority: "0.5", changefreq: "yearly" },
        { path: "/bulk-purchase", priority: "0.6", changefreq: "monthly" },
        { path: "/green-friday-promotional", priority: "0.7", changefreq: "weekly" },
        { path: "/backtoschool-acer-professional", priority: "0.7", changefreq: "weekly" },
      ]

      for (const page of staticPages) {
        addEntry({
          path: page.path,
          lastmod: new Date(),
          changefreq: page.changefreq,
          priority: page.priority,
        })
      }

      // Dynamic product detail URLs
      for (const product of products) {
        if (!product.slug) continue
        addEntry({
          path: `/product/${product.slug}`,
          lastmod: product.updatedAt,
          changefreq: "weekly",
          priority: "0.8",
        })
      }

      // Category and nested subcategory URLs based on the current /product-category route model.
      const categorySlugById = new Map(categories.filter((c) => c.slug).map((c) => [toId(c._id), c.slug]))
      const subById = new Map(subCategories.map((s) => [toId(s._id), s]))

      for (const category of categories) {
        if (!category.slug) continue
        addEntry({
          path: `/product-category/${category.slug}`,
          lastmod: category.updatedAt,
          changefreq: "weekly",
          priority: "0.7",
        })
      }

      for (const subCategory of subCategories) {
        const subPath = buildSubcategoryPath(subCategory, categorySlugById, subById)
        if (!subPath) continue
        addEntry({
          path: subPath,
          lastmod: subCategory.updatedAt,
          changefreq: "weekly",
          priority: "0.6",
        })
      }

      // Brand-filtered shop URLs (brand query param is supported by current Shop route).
      for (const brand of brands) {
        const brandToken = brand.slug || brand.name
        if (!brandToken) continue
        addEntry({
          path: `/shop?brand=${encodeURIComponent(brandToken)}`,
          lastmod: brand.updatedAt,
          changefreq: "weekly",
          priority: "0.7",
        })
      }

      // Blog URLs
      for (const blog of blogs) {
        if (!blog.slug) continue
        addEntry({
          path: `/blogs/${blog.slug}`,
          lastmod: blog.updatedAt,
          changefreq: "monthly",
          priority: "0.6",
        })
      }

      for (const blogCategory of blogCategories) {
        if (!blogCategory._id) continue
        addEntry({
          path: `/blogs?category=${encodeURIComponent(String(blogCategory._id))}`,
          lastmod: blogCategory.updatedAt,
          changefreq: "weekly",
          priority: "0.6",
        })
      }

      // Offer and gaming-zone landing pages
      for (const offerPage of offerPages) {
        if (!offerPage.slug) continue
        addEntry({
          path: `/offers/${offerPage.slug}`,
          lastmod: offerPage.updatedAt,
          changefreq: "weekly",
          priority: "0.7",
        })
      }

      for (const gamingZonePage of gamingZonePages) {
        if (!gamingZonePage.slug) continue
        addEntry({
          path: `/gaming-zone/${gamingZonePage.slug}`,
          lastmod: gamingZonePage.updatedAt,
          changefreq: "weekly",
          priority: "0.7",
        })
      }

      xml += "</urlset>"

      res.set({
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600",
      })

      res.send(xml)
    } catch (error) {
      console.error("Sitemap generation error:", error)
      res.status(500).send("Error generating sitemap")
    }
  }),
)

export default router
