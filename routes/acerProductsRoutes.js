import express from "express"
import asyncHandler from "express-async-handler"
import Product from "../models/productModel.js"
import Brand from "../models/brandModel.js"

const router = express.Router()

// Helper function to properly escape XML characters
const escapeXml = (unsafe) => {
  if (!unsafe) return ""
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\uFFFE\uFFFF]/g, "")
    .replace(/[\u0000-\u001F]/g, "")
}

// Helper function to truncate title to Google's 150 character limit
const truncateTitle = (title, maxLength = 150) => {
  if (!title) return ""
  let cleanTitle = title
    .toString()
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/"/g, " inch")
    .replace(/'/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  
  if (cleanTitle.length <= maxLength) return cleanTitle
  const truncated = cleanTitle.substring(0, maxLength - 3)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > maxLength - 30) {
    return truncated.substring(0, lastSpace) + '...'
  }
  return truncated + '...'
}

// Helper function to truncate description
const truncateDescription = (description, maxLength = 5000) => {
  if (!description) return ""
  const cleanDesc = description
    .toString()
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (cleanDesc.length <= maxLength) return cleanDesc
  return cleanDesc.substring(0, maxLength - 3) + '...'
}

// Helper function to clean text for CDATA
const cleanForCDATA = (text) => {
  if (!text) return ""
  return text
    .toString()
    .replace(/]]>/g, "] ]>")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\uFFFE\uFFFF]/g, "")
    .replace(/\u0000/g, "")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\r\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Helper function to determine availability
const determineAvailability = (product) => {
  if (product.stockStatus === "Out of Stock") {
    return "out of stock"
  }
  if (product.stockStatus === "PreOrder") {
    return "preorder"
  }
  if (product.countInStock && product.countInStock > 0) {
    return "in stock"
  }
  if (product.stockStatus === "In Stock") {
    return "in stock"
  }
  return "out of stock"
}

// Helper function to determine Google product category
function determineGoogleCategory(parentCategory, subCategory) {
  const categoryMappings = {
    Electronics: "Electronics",
    Computers: "Electronics > Computers",
    Mobile: "Electronics > Communications > Telephony > Mobile Phones",
    Laptops: "Electronics > Computers > Laptops",
    Gaming: "Electronics > Video Game Console Accessories",
    Audio: "Electronics > Audio",
    Cameras: "Electronics > Cameras & Optics",
    Monitors: "Electronics > Computers > Computer Monitors",
    Accessories: "Electronics > Electronics Accessories",
  }

  const searchKey = subCategory || parentCategory || ""

  if (categoryMappings[searchKey]) {
    return categoryMappings[searchKey]
  }

  for (const [key, value] of Object.entries(categoryMappings)) {
    if (searchKey.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(searchKey.toLowerCase())) {
      return value
    }
  }

  return "Electronics > Computers"
}

// @desc    Acer Products XML Feed
// @route   GET /acer-products/feed.xml
// @access  Public
router.get(
  "/feed.xml",
  asyncHandler(async (req, res) => {
    try {
      console.log("Generating Acer Products XML feed...")

      // Find ALL Acer brands (case-insensitive) - handles variations like "Acer", "ACER", "acer"
      const acerBrands = await Brand.find({ 
        name: { $regex: /^acer$/i } 
      })

      if (!acerBrands || acerBrands.length === 0) {
        res.status(404).send(`<?xml version="1.0" encoding="UTF-8"?>
<error>
  <message><![CDATA[Acer brand not found in database]]></message>
</error>`)
        return
      }

      // Get all Acer brand IDs
      const acerBrandIds = acerBrands.map(b => b._id)
      console.log(`Found ${acerBrands.length} Acer brand entries: ${acerBrands.map(b => b.name).join(', ')}`)

      // Build query for active Acer products - use $in to match any Acer brand
      const query = {
        name: { $exists: true, $ne: '' },
        brand: { $in: acerBrandIds },
        $or: [{ isActive: true }, { isActive: { $exists: false } }]
      }

      // Get total count
      const totalCount = await Product.countDocuments(query)
      console.log(`Total Acer products: ${totalCount}`)

      // Fetch all Acer products with populated fields
      const products = await Product.aggregate([
        { $match: query },
        {
          $lookup: {
            from: "brands",
            localField: "brand",
            foreignField: "_id",
            as: "brand",
          },
        },
        {
          $lookup: {
            from: "subcategories",
            localField: "category",
            foreignField: "_id",
            as: "category",
          },
        },
        {
          $lookup: {
            from: "categories",
            localField: "parentCategory",
            foreignField: "_id",
            as: "parentCategory",
          },
        },
        { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$parentCategory", preserveNullAndEmptyArrays: true } },
      ])

      console.log(`Found ${products.length} Acer products`)

      res.set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      })

      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title><![CDATA[GrabA2Z - Official Acer Products]]></title>
    <link>https://www.grabatoz.ae</link>
    <description><![CDATA[Official Acer Product Feed from GrabA2Z - Total: ${totalCount} products. Auto-updated in real-time.]]></description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <g:feed_type>Acer Official Partner Feed</g:feed_type>
`

      let processedCount = 0
      const stats = { inStock: 0, outOfStock: 0, preOrder: 0 }

      for (const product of products) {
        try {
          if (!product.name || product.name.trim() === "") continue

          const cleanSlug = (product.slug || product._id.toString()).replace(/&/g, '%26')
          const productUrl = `https://www.grabatoz.ae/product/${cleanSlug}`
          
          let imageUrl = product.image
            ? product.image.startsWith("http")
              ? product.image
              : `https://www.grabatoz.ae${product.image}`
            : "https://www.grabatoz.ae/placeholder.jpg"
          imageUrl = imageUrl.replace(/&/g, '&amp;')

          const availability = determineAvailability(product)
          if (availability === "in stock") stats.inStock++
          else if (availability === "out of stock") stats.outOfStock++
          else if (availability === "preorder") stats.preOrder++

          let price = product.offerPrice > 0 ? product.offerPrice : (product.price > 0 ? product.price : 1)
          const salePrice = product.offerPrice > 0 && product.price && product.offerPrice < product.price
            ? product.offerPrice : null

          const cleanDescription = truncateDescription(
            product.description || product.shortDescription || product.name || "Acer product available at GrabA2Z"
          )
          const truncatedTitle = truncateTitle(product.name)

          const googleProductCategory = determineGoogleCategory(product.parentCategory?.name, product.category?.name)
          const productType = (product.parentCategory?.name || "Electronics") +
            (product.category?.name ? ` > ${product.category.name}` : "")

          const hasGtin = product.gtin && product.gtin.trim() !== ''
          const hasMpn = product.sku && product.sku.trim() !== ''
          const identifierExists = hasGtin || hasMpn

          xml += `    <item>
      <g:id>${escapeXml(product._id.toString())}</g:id>
      <g:title><![CDATA[${cleanForCDATA(truncatedTitle)}]]></g:title>
      <g:description><![CDATA[${cleanForCDATA(cleanDescription)}]]></g:description>
      <g:link>${productUrl}</g:link>
      <g:image_link>${imageUrl}</g:image_link>
      <g:price>${price.toFixed(2)} AED</g:price>`

          if (salePrice) {
            xml += `
      <g:sale_price>${salePrice.toFixed(2)} AED</g:sale_price>`
          }

          xml += `
      <g:availability>${availability}</g:availability>
      <g:condition>new</g:condition>
      <g:brand><![CDATA[Acer]]></g:brand>`

          if (product.gtin) {
            xml += `
      <g:gtin>${escapeXml(product.gtin)}</g:gtin>`
          }

          if (product.sku) {
            xml += `
      <g:mpn><![CDATA[${cleanForCDATA(product.sku)}]]></g:mpn>`
          } else {
            xml += `
      <g:mpn><![CDATA[ACER-${cleanForCDATA(product._id.toString())}]]></g:mpn>`
          }

          xml += `
      <g:identifier_exists>${identifierExists ? 'true' : 'false'}</g:identifier_exists>
      <g:google_product_category><![CDATA[${googleProductCategory}]]></g:google_product_category>
      <g:product_type><![CDATA[${cleanForCDATA(productType)}]]></g:product_type>
      <g:item_group_id>${escapeXml(product._id.toString())}</g:item_group_id>
      <g:shipping>
        <g:country>AE</g:country>
        <g:service>Standard Shipping</g:service>
        <g:price>0.00 AED</g:price>
      </g:shipping>`

          // Additional images
          if (product.galleryImages && product.galleryImages.length > 0) {
            product.galleryImages.slice(0, 10).forEach((img) => {
              if (img) {
                let additionalImageUrl = img.startsWith("http") ? img : `https://www.grabatoz.ae${img}`
                additionalImageUrl = additionalImageUrl.replace(/&/g, '&amp;')
                xml += `
      <g:additional_image_link>${additionalImageUrl}</g:additional_image_link>`
              }
            })
          }

          if (product.weight && product.weight > 0) {
            xml += `
      <g:shipping_weight>${product.weight} kg</g:shipping_weight>`
          }

          // Custom labels for Acer
          xml += `
      <g:custom_label_0>Acer Official</g:custom_label_0>
      <g:custom_label_1>GrabA2Z Partner</g:custom_label_1>`

          if (product.featured) {
            xml += `
      <g:custom_label_2>Featured</g:custom_label_2>`
          }

          if (product.tags && product.tags.length > 0) {
            xml += `
      <g:custom_label_3><![CDATA[${cleanForCDATA(product.tags.slice(0, 3).join(", "))}]]></g:custom_label_3>`
          }

          xml += `
    </item>
`
          processedCount++
        } catch (productError) {
          console.error(`Error processing Acer product ${product._id}:`, productError)
          continue
        }
      }

      xml += `  </channel>
</rss>`

      console.log(`Acer XML feed generated: ${processedCount}/${totalCount} products`)
      console.log(`Acer stats:`, stats)
      res.send(xml)
    } catch (error) {
      console.error("Acer Products XML feed error:", error)
      res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?>
<error>
  <message><![CDATA[Error generating Acer product feed: ${error.message}]]></message>
</error>`)
    }
  }),
)

// @desc    Acer Products JSON Feed
// @route   GET /acer-products/feed.json
// @access  Public
router.get(
  "/feed.json",
  asyncHandler(async (req, res) => {
    try {
      const acerBrands = await Brand.find({ name: { $regex: /^acer$/i } })

      if (!acerBrands || acerBrands.length === 0) {
        res.status(404).json({ error: "Acer brand not found" })
        return
      }

      const acerBrandIds = acerBrands.map(b => b._id)

      const query = {
        brand: { $in: acerBrandIds },
        $or: [{ isActive: true }, { isActive: { $exists: false } }]
      }

      const products = await Product.find(query)
        .populate("brand", "name")
        .populate("category", "name slug")
        .populate("parentCategory", "name slug")
        .lean()

      res.json({
        brand: "Acer",
        totalProducts: products.length,
        lastUpdated: new Date().toISOString(),
        feedUrl: "/acer-products/feed.xml",
        products: products.map(p => ({
          id: p._id,
          name: p.name,
          slug: p.slug,
          sku: p.sku,
          barcode: p.barcode,
          price: p.price,
          offerPrice: p.offerPrice,
          category: p.category?.name,
          parentCategory: p.parentCategory?.name,
          stockStatus: p.stockStatus,
          availability: determineAvailability(p),
          image: p.image,
          url: `https://www.grabatoz.ae/product/${p.slug || p._id}`
        }))
      })
    } catch (error) {
      console.error("Acer Products JSON feed error:", error)
      res.status(500).json({ error: error.message })
    }
  }),
)

// @desc    Acer Products Count/Stats
// @route   GET /acer-products/stats
// @access  Public
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    try {
      const acerBrands = await Brand.find({ name: { $regex: /^acer$/i } })

      if (!acerBrands || acerBrands.length === 0) {
        res.status(404).json({ error: "Acer brand not found" })
        return
      }

      const acerBrandIds = acerBrands.map(b => b._id)

      const baseQuery = { brand: { $in: acerBrandIds } }
      
      const totalProducts = await Product.countDocuments(baseQuery)
      const activeProducts = await Product.countDocuments({ ...baseQuery, isActive: true })
      const inStockProducts = await Product.countDocuments({ ...baseQuery, stockStatus: "In Stock" })
      const outOfStockProducts = await Product.countDocuments({ ...baseQuery, stockStatus: "Out of Stock" })
      const preOrderProducts = await Product.countDocuments({ ...baseQuery, stockStatus: "PreOrder" })
      const featuredProducts = await Product.countDocuments({ ...baseQuery, featured: true })

      res.json({
        brand: "Acer",
        brandIds: acerBrandIds,
        brandNames: acerBrands.map(b => b.name),
        stats: {
          total: totalProducts,
          active: activeProducts,
          inStock: inStockProducts,
          outOfStock: outOfStockProducts,
          preOrder: preOrderProducts,
          featured: featuredProducts
        },
        feeds: {
          xml: "/acer-products/feed.xml",
          json: "/acer-products/feed.json"
        },
        lastUpdated: new Date().toISOString()
      })
    } catch (error) {
      console.error("Acer Products stats error:", error)
      res.status(500).json({ error: error.message })
    }
  }),
)

export default router
