
import express from "express"
import asyncHandler from "express-async-handler"
import Product from "../models/productModel.js"

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
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control characters
    .replace(/[\uFFFE\uFFFF]/g, "") // Remove invalid Unicode
    .replace(/[\u0000-\u001F]/g, "") // Remove more control chars
}

// Helper function to truncate title to Google's 150 character limit
const truncateTitle = (title, maxLength = 150) => {
  if (!title) return ""
  // First clean the title of problematic characters
  let cleanTitle = title
    .toString()
    .replace(/[""]/g, '"') // Normalize curly quotes to straight
    .replace(/['']/g, "'") // Normalize curly apostrophes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // More apostrophe variants
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // More quote variants
    .replace(/"/g, " inch") // Replace " with inch for screen sizes
    .replace(/'/g, "") // Remove remaining apostrophes
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove control characters
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim()
  
  if (cleanTitle.length <= maxLength) return cleanTitle
  // Try to cut at a word boundary
  const truncated = cleanTitle.substring(0, maxLength - 3)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > maxLength - 30) {
    return truncated.substring(0, lastSpace) + '...'
  }
  return truncated + '...'
}

// Helper function to truncate description to Google's 5000 character limit
const truncateDescription = (description, maxLength = 5000) => {
  if (!description) return ""
  const cleanDesc = description
    .toString()
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ") // Replace &nbsp;
    .replace(/&amp;/g, "&") // Decode &amp;
    .replace(/&lt;/g, "<") // Decode &lt;
    .replace(/&gt;/g, ">") // Decode &gt;
    .replace(/&quot;/g, '"') // Decode &quot;
    .replace(/&#39;/g, "'") // Decode &#39;
    .replace(/[""]/g, '"') // Normalize curly quotes
    .replace(/['']/g, "'") // Normalize curly apostrophes
    .replace(/\r\n|\r|\n/g, " ") // Replace newlines
    .replace(/\t/g, " ") // Replace tabs
    .replace(/\s+/g, " ") // Replace multiple spaces
    .trim()
  if (cleanDesc.length <= maxLength) return cleanDesc
  return cleanDesc.substring(0, maxLength - 3) + '...'
}

// Helper function to clean text for CDATA - removes problematic characters
const cleanForCDATA = (text) => {
  if (!text) return ""
  return text
    .toString()
    .replace(/]]>/g, "] ]>") // Break up CDATA end sequence
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control characters
    .replace(/[\uFFFE\uFFFF]/g, "") // Remove invalid Unicode
    .replace(/\u0000/g, "") // Remove null chars
    .replace(/[""]/g, '"') // Normalize curly quotes to straight quotes
    .replace(/['']/g, "'") // Normalize curly apostrophes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // More apostrophe variants
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // More quote variants
    .replace(/\r\n/g, " ") // Replace Windows newlines
    .replace(/\r/g, " ") // Replace Mac newlines  
    .replace(/\n/g, " ") // Replace Unix newlines
    .replace(/\t/g, " ") // Replace tabs
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim()
}

// Helper function to determine availability
const determineAvailability = (product) => {
  // Check stock status first
  if (product.stockStatus === "Out of Stock") {
    return "out of stock"
  }

  if (product.stockStatus === "PreOrder") {
    return "preorder"
  }

  // If stockStatus is "In Stock" or any other value, check actual stock count
  if (product.countInStock && product.countInStock > 0) {
    return "in stock"
  }

  // If no stock count or zero stock, but stockStatus is not explicitly "Out of Stock"
  if (product.stockStatus === "In Stock") {
    return "in stock" // Trust the stockStatus over countInStock
  }

  // Default to out of stock
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
    Home: "Home & Garden",
    Kitchen: "Home & Garden > Kitchen & Dining",
    Furniture: "Home & Garden > Furniture",
    Clothing: "Apparel & Accessories",
    Fashion: "Apparel & Accessories",
    Shoes: "Apparel & Accessories > Shoes",
    Bags: "Apparel & Accessories > Handbags, Wallets & Cases",
    Beauty: "Health & Beauty > Personal Care",
    Health: "Health & Beauty",
    Sports: "Sporting Goods",
    Fitness: "Sporting Goods > Exercise & Fitness",
    Toys: "Toys & Games",
    Books: "Media > Books",
    Automotive: "Vehicles & Parts > Vehicle Parts & Accessories",
    Tools: "Hardware > Tools",
    Garden: "Home & Garden > Lawn & Garden",
    Pet: "Animals & Pet Supplies",
    Baby: "Baby & Toddler > Baby Care",
    Office: "Business & Industrial > Office Supplies",
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

  return "Electronics"
}

// @desc    Get product count for debugging
// @route   GET /api/google-merchant/count
// @access  Public
router.get(
  "/count",
  asyncHandler(async (req, res) => {
    try {
      const totalProducts = await Product.countDocuments()
      const activeProducts = await Product.countDocuments({ isActive: true })
      const inactiveProducts = await Product.countDocuments({ isActive: false })
      const productsWithoutIsActive = await Product.countDocuments({ isActive: { $exists: false } })
      const productsWithPrice = await Product.countDocuments({ price: { $gt: 0 } })
      const productsWithZeroPrice = await Product.countDocuments({ price: 0 })
      const productsWithOfferPrice = await Product.countDocuments({ offerPrice: { $gt: 0 } })
      const productsWithName = await Product.countDocuments({ name: { $exists: true, $ne: "" } })
      const productsWithoutName = await Product.countDocuments({ $or: [{ name: { $exists: false } }, { name: "" }] })

      // Stock status analysis
      const availableProducts = await Product.countDocuments({ stockStatus: "In Stock" })
      const outOfStockProducts = await Product.countDocuments({ stockStatus: "Out of Stock" })
      const preOrderProducts = await Product.countDocuments({ stockStatus: "PreOrder" })
      const productsWithStock = await Product.countDocuments({ countInStock: { $gt: 0 } })
      const productsWithZeroStock = await Product.countDocuments({ countInStock: 0 })

      // Test the same query we use in the feed
      const feedQuery = {
        $or: [{ isActive: true }, { isActive: { $exists: false } }],
      }
      const feedProducts = await Product.countDocuments(feedQuery)

      // Test products that would be skipped in old logic
      const productsWithValidName = await Product.countDocuments({
        ...feedQuery,
        name: { $exists: true, $ne: "" },
      })

      res.json({
        total: totalProducts,
        active: activeProducts,
        inactive: inactiveProducts,
        withoutIsActiveField: productsWithoutIsActive,
        withPrice: productsWithPrice,
        withZeroPrice: productsWithZeroPrice,
        withOfferPrice: productsWithOfferPrice,
        withName: productsWithName,
        withoutName: productsWithoutName,
        stockStatus: {
          available: availableProducts,
          outOfStock: outOfStockProducts,
          preOrder: preOrderProducts,
          withStock: productsWithStock,
          withZeroStock: productsWithZeroStock,
        },
        feedQuery: feedProducts,
        feedQueryWithValidName: productsWithValidName,
        query: req.query,
      })
    } catch (error) {
      console.error("Product count error:", error)
      res.status(500).json({ error: error.message })
    }
  }),
)

// @desc    Generate Google Merchant JSON Feed with pagination support
// @route   GET /api/google-merchant/feed.json
// @access  Public
router.get(
  "/feed.json",
  asyncHandler(async (req, res) => {
    try {
      // Parse pagination parameters
      const page = Number.parseInt(req.query.page) || 1
      const limit = Number.parseInt(req.query.limit) || 0 // 0 means no limit
      const skip = limit > 0 ? (page - 1) * limit : 0
      const includeZeroPrice = req.query.includeZeroPrice === 'true'
      const includeOutOfStock = req.query.includeOutOfStock !== 'false' // Default true

      // Build query - include products that are active AND have valid data for Google
      const query = {
        name: { $exists: true, $ne: '' },
        image: { $exists: true, $ne: '' },
      }

      // Filter out zero-price products unless explicitly included
      if (!includeZeroPrice) {
        query.$and = [
          { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
          { $or: [{ price: { $gt: 0 } }, { offerPrice: { $gt: 0 } }] }
        ]
      } else {
        query.$or = [{ isActive: true }, { isActive: { $exists: false } }]
      }

      console.log("Fetching products with query:", JSON.stringify(query))
      console.log(`Pagination: page=${page}, limit=${limit}, skip=${skip}`)

      // Get total count first
      const totalCount = await Product.countDocuments(query)
      console.log(`Total products matching query: ${totalCount}`)

      // Build the aggregation pipeline to fetch ALL products without any default limits
      const aggregationPipeline = [
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
        {
          $unwind: {
            path: "$brand",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$category",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$parentCategory",
            preserveNullAndEmptyArrays: true,
          },
        },
      ]

      // Add pagination only if limit is specified
      if (limit > 0) {
        aggregationPipeline.push({ $skip: skip })
        aggregationPipeline.push({ $limit: limit })
      }

      const products = await Product.aggregate(aggregationPipeline)

      console.log(`Found ${products.length} products`)

      res.set({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      })

      const feed = {
        title: "GrabA2Z Products",
        link: "https://www.grabatoz.ae",
        description: "GrabA2Z Product Feed for Google Merchant Center",
        language: "en",
        lastBuildDate: new Date().toISOString(),
        totalProducts: totalCount,
        returnedProducts: products.length,
        pagination: {
          page: page,
          limit: limit,
          skip: skip,
          hasNextPage: limit > 0 ? skip + products.length < totalCount : false,
          totalPages: limit > 0 ? Math.ceil(totalCount / limit) : 1,
        },
        products: [],
      }

      let processedCount = 0
      let skippedCount = 0
      const availabilityStats = {
        inStock: 0,
        outOfStock: 0,
        preOrder: 0,
      }

      for (const product of products) {
        try {
          // Only skip products without a name
          if (!product.name || product.name.trim() === "") {
            console.log(`Skipping product ${product._id} - missing name`)
            skippedCount++
            continue
          }

          // Escape & in slug for valid URLs
          const cleanSlug = (product.slug || product._id.toString()).replace(/&/g, '%26')
          const productUrl = `https://www.grabatoz.ae/product/${cleanSlug}`
          const imageUrl = product.image
            ? product.image.startsWith("http")
              ? product.image
              : `https://www.grabatoz.ae${product.image}`
            : "https://www.grabatoz.ae/placeholder.jpg"

          // Use the improved availability logic
          const availability = determineAvailability(product)
          availabilityStats[availability.replace(" ", "").replace("of", "Of")]++

          // Handle pricing - set minimum 1 AED for zero-price products (Google requires valid price)
          let price = 0
          if (product.offerPrice && product.offerPrice > 0) {
            price = product.offerPrice
          } else if (product.price && product.price > 0) {
            price = product.price
          } else {
            // For zero-priced items, set 1 AED minimum for Google Merchant
            price = 1
          }

          const salePrice =
            product.offerPrice && product.offerPrice > 0 && product.price && product.offerPrice < product.price
              ? product.offerPrice
              : null

          const cleanDescription = truncateDescription(
            product.description || product.shortDescription || product.name || "No description available"
          )

          // Truncate title to Google's 150 character limit
          const truncatedTitle = truncateTitle(product.name)

          const googleProductCategory = determineGoogleCategory(product.parentCategory?.name, product.category?.name)
          const productType =
            (product.parentCategory?.name || "Uncategorized") +
            (product.category?.name ? ` > ${product.category.name}` : "")

          const additionalImages = []
          if (product.galleryImages && product.galleryImages.length > 0) {
            product.galleryImages.slice(0, 10).forEach((img) => {
              if (img) {
                const additionalImageUrl = img.startsWith("http") ? img : `https://www.grabatoz.ae${img}`
                additionalImages.push(additionalImageUrl)
              }
            })
          }

          // Check if product has valid identifiers (GTIN or brand+MPN)
          const hasGtin = product.gtin && product.gtin.trim() !== ''
          const hasMpn = product.sku && product.sku.trim() !== ''
          const hasBrand = product.brand?.name && product.brand.name.toLowerCase() !== 'generic'
          const identifierExists = hasGtin || (hasBrand && hasMpn)

          const productData = {
            id: product._id.toString(),
            title: truncatedTitle,
            description: cleanDescription,
            link: productUrl,
            image_link: imageUrl,
            additional_image_links: additionalImages,
            price: `${price.toFixed(2)} AED`,
            availability: availability,
            condition: "new",
            google_product_category: googleProductCategory,
            product_type: productType,
            item_group_id: product._id.toString(),
            brand: product.brand?.name || "Generic",
            gtin: hasGtin ? product.gtin : "",
            mpn: hasMpn ? product.sku : product._id.toString(),
            identifier_exists: identifierExists ? "yes" : "no",
            shipping_weight: product.weight ? `${product.weight} kg` : "",
            shipping: {
              country: "AE",
              service: "Standard Shipping",
              price: "0.00 AED"
            },
            custom_labels: {
              custom_label_0: product.featured ? "Featured" : "",
              custom_label_1: product.tags && product.tags.length > 0 ? product.tags.slice(0, 3).join(", ") : "",
              custom_label_2: product.parentCategory?.name || "",
              custom_label_3: availability,
            },
            stock_quantity: product.countInStock || 0,
            stock_status: product.stockStatus || "Unknown",
            created_at: product.createdAt,
            updated_at: product.updatedAt,
            is_active: product.isActive !== undefined ? product.isActive : true,
            original_price: product.price || 0,
            original_offer_price: product.offerPrice || 0,
          }

          if (salePrice) {
            productData.sale_price = `${salePrice.toFixed(2)} AED`
          }

          feed.products.push(productData)
          processedCount++
        } catch (productError) {
          console.error(`Error processing product ${product._id}:`, productError)
          skippedCount++
          continue
        }
      }

      feed.processedProducts = processedCount
      feed.skippedProducts = skippedCount
      feed.availabilityStats = availabilityStats

      console.log(`Feed generated: ${processedCount} products processed, ${skippedCount} skipped`)
      console.log(`Availability stats:`, availabilityStats)

      res.json(feed)
    } catch (error) {
      console.error("Google Merchant JSON feed error:", error)
      res.status(500).json({
        error: "Error generating product feed",
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      })
    }
  }),
)

// @desc    Generate Google Merchant XML Feed
// @route   GET /api/google-merchant/feed.xml
// @access  Public
router.get(
  "/feed.xml",
  asyncHandler(async (req, res) => {
    try {
      // Parse pagination parameters
      const page = Number.parseInt(req.query.page) || 1
      const limit = Number.parseInt(req.query.limit) || 0 // 0 means no limit
      const skip = limit > 0 ? (page - 1) * limit : 0

      // Build query - include ALL active products
      const query = {
        name: { $exists: true, $ne: '' },
        $or: [{ isActive: true }, { isActive: { $exists: false } }]
      }

      console.log("Fetching products for XML with query:", JSON.stringify(query))
      console.log(`XML Pagination: page=${page}, limit=${limit}, skip=${skip}`)

      // Get total count first
      const totalCount = await Product.countDocuments(query)
      console.log(`Total products for XML: ${totalCount}`)

      // Build the aggregation pipeline to fetch ALL products without any default limits
      const aggregationPipeline = [
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
        {
          $unwind: {
            path: "$brand",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$category",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$parentCategory",
            preserveNullAndEmptyArrays: true,
          },
        },
      ]

      // Add pagination only if limit is specified
      if (limit > 0) {
        aggregationPipeline.push({ $skip: skip })
        aggregationPipeline.push({ $limit: limit })
      }

      const products = await Product.aggregate(aggregationPipeline)

      console.log(`Found ${products.length} products for XML`)

      res.set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      })

      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title><![CDATA[GrabA2Z Products]]></title>
    <link>https://www.grabatoz.ae</link>
    <description><![CDATA[GrabA2Z Product Feed for Google Merchant Center - Total: ${totalCount} products]]></description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
`

      let processedCount = 0
      const availabilityStats = {
        inStock: 0,
        outOfStock: 0,
        preOrder: 0,
      }

      for (const product of products) {
        try {
          // Skip products without a name
          if (!product.name || product.name.trim() === "") {
            console.warn(`Skipping product ${product._id} - missing name`)
            continue
          }

          // Escape & in slug for valid XML URLs
          const cleanSlug = (product.slug || product._id.toString()).replace(/&/g, '%26')
          const productUrl = `https://www.grabatoz.ae/product/${cleanSlug}`
          
          // Escape & in image URLs for valid XML
          let imageUrl = product.image
            ? product.image.startsWith("http")
              ? product.image
              : `https://www.grabatoz.ae${product.image}`
            : "https://www.grabatoz.ae/placeholder.jpg"
          imageUrl = imageUrl.replace(/&/g, '&amp;')

          // Use the improved availability logic
          const availability = determineAvailability(product)
          availabilityStats[availability.replace(" ", "").replace("of", "Of")]++

          // Handle pricing - set minimum 1 AED for zero-price products (Google requires valid price)
          let price = 0
          if (product.offerPrice && product.offerPrice > 0) {
            price = product.offerPrice
          } else if (product.price && product.price > 0) {
            price = product.price
          } else {
            // For zero-priced items, set 1 AED minimum for Google Merchant
            price = 1
          }

          const salePrice =
            product.offerPrice && product.offerPrice > 0 && product.price && product.offerPrice < product.price
              ? product.offerPrice
              : null

          // Clean and limit description
          const cleanDescription = truncateDescription(
            product.description || product.shortDescription || product.name || "No description available"
          )

          // Truncate title to Google's 150 character limit
          const truncatedTitle = truncateTitle(product.name)

          const googleProductCategory = determineGoogleCategory(product.parentCategory?.name, product.category?.name)
          const productType =
            (product.parentCategory?.name || "Uncategorized") +
            (product.category?.name ? ` > ${product.category.name}` : "")

          // Check if product has valid identifiers (GTIN or brand+MPN)
          const hasGtin = product.gtin && product.gtin.trim() !== ''
          const hasMpn = product.sku && product.sku.trim() !== ''
          const hasBrand = product.brand?.name && product.brand.name.toLowerCase() !== 'generic'
          const identifierExists = hasGtin || (hasBrand && hasMpn)

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
      <g:condition>new</g:condition>`

          if (product.brand?.name) {
            xml += `
      <g:brand><![CDATA[${cleanForCDATA(product.brand.name)}]]></g:brand>`
          } else {
            xml += `
      <g:brand><![CDATA[Generic]]></g:brand>`
          }

          if (product.gtin) {
            xml += `
      <g:gtin>${escapeXml(product.gtin)}</g:gtin>`
          }

          if (product.sku) {
            xml += `
      <g:mpn><![CDATA[${cleanForCDATA(product.sku)}]]></g:mpn>`
          } else {
            xml += `
      <g:mpn><![CDATA[${cleanForCDATA(product._id.toString())}]]></g:mpn>`
          }

          // Add identifier_exists - required by Google
          xml += `
      <g:identifier_exists>${identifierExists ? 'true' : 'false'}</g:identifier_exists>`

          xml += `
      <g:google_product_category><![CDATA[${googleProductCategory}]]></g:google_product_category>
      <g:product_type><![CDATA[${cleanForCDATA(productType)}]]></g:product_type>
      <g:item_group_id>${escapeXml(product._id.toString())}</g:item_group_id>`

          // Add shipping information - required for UAE
          xml += `
      <g:shipping>
        <g:country>AE</g:country>
        <g:service>Standard Shipping</g:service>
        <g:price>0.00 AED</g:price>
      </g:shipping>`

          // Add additional images if available
          if (product.galleryImages && product.galleryImages.length > 0) {
            product.galleryImages.slice(0, 10).forEach((img) => {
              if (img) {
                let additionalImageUrl = img.startsWith("http") ? img : `https://www.grabatoz.ae${img}`
                // Escape & for valid XML
                additionalImageUrl = additionalImageUrl.replace(/&/g, '&amp;')
                xml += `
      <g:additional_image_link>${additionalImageUrl}</g:additional_image_link>`
              }
            })
          }

          // Add weight if available
          if (product.weight && product.weight > 0) {
            xml += `
      <g:shipping_weight>${product.weight} kg</g:shipping_weight>`
          }

          // Add custom labels for filtering
          if (product.featured) {
            xml += `
      <g:custom_label_0>Featured</g:custom_label_0>`
          }

          if (product.tags && product.tags.length > 0) {
            const tagsString = product.tags.slice(0, 3).join(", ")
            xml += `
      <g:custom_label_1><![CDATA[${cleanForCDATA(tagsString)}]]></g:custom_label_1>`
          }

          xml += `
    </item>
`
          processedCount++
        } catch (productError) {
          console.error(`Error processing product ${product._id} for XML:`, productError)
          continue
        }
      }

      xml += `  </channel>
</rss>`

      console.log(`XML feed generated with ${processedCount} products out of ${totalCount} total`)
      console.log(`XML Availability stats:`, availabilityStats)
      res.send(xml)
    } catch (error) {
      console.error("Google Merchant XML feed error:", error)
      res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?>
<error>
  <message><![CDATA[Error generating product feed: ${error.message}]]></message>
</error>`)
    }
  }),
)

// @desc    Generate paginated feed for large datasets
// @route   GET /api/google-merchant/feed-paginated.json
// @access  Public
router.get(
  "/feed-paginated.json",
  asyncHandler(async (req, res) => {
    try {
      const page = Number.parseInt(req.query.page) || 1
      const limit = Number.parseInt(req.query.limit) || 500 // Default 500 products per page
      const skip = (page - 1) * limit

      const query = {
        $or: [{ isActive: true }, { isActive: { $exists: false } }],
      }

      const totalCount = await Product.countDocuments(query)
      const totalPages = Math.ceil(totalCount / limit)

      const products = await Product.find(query)
        .populate("brand", "name")
        .populate("category", "name")
        .populate("parentCategory", "name")
        .skip(skip)
        .limit(limit)
        .lean()

      res.json({
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalProducts: totalCount,
          productsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          nextPage: page < totalPages ? page + 1 : null,
          prevPage: page > 1 ? page - 1 : null,
        },
        products: products.map((product) => ({
          id: product._id.toString(),
          name: product.name,
          price: product.price,
          offerPrice: product.offerPrice,
          brand: product.brand?.name,
          category: product.category?.name,
          parentCategory: product.parentCategory?.name,
          stockStatus: product.stockStatus,
          countInStock: product.countInStock,
          isActive: product.isActive,
          availability: determineAvailability(product),
        })),
      })
    } catch (error) {
      console.error("Paginated feed error:", error)
      res.status(500).json({ error: error.message })
    }
  }),
)

// @desc    Generate Brand-specific XML Feed (e.g., Acer, Dell, HP)
// @route   GET /api/google-merchant/brand/:brandName/feed.xml
// @access  Public
router.get(
  "/brand/:brandName/feed.xml",
  asyncHandler(async (req, res) => {
    try {
      const brandName = req.params.brandName
      
      // Parse pagination parameters
      const page = Number.parseInt(req.query.page) || 1
      const limit = Number.parseInt(req.query.limit) || 0 // 0 means no limit
      const skip = limit > 0 ? (page - 1) * limit : 0

      console.log(`Generating XML feed for brand: ${brandName}`)

      // First, find the brand by name (case-insensitive)
      const Brand = (await import("../models/brandModel.js")).default
      const brand = await Brand.findOne({ 
        name: { $regex: new RegExp(`^${brandName}$`, 'i') } 
      })

      if (!brand) {
        res.status(404).send(`<?xml version="1.0" encoding="UTF-8"?>
<error>
  <message><![CDATA[Brand "${brandName}" not found]]></message>
</error>`)
        return
      }

      // Build query - include ALL active products for this brand
      const query = {
        name: { $exists: true, $ne: '' },
        brand: brand._id,
        $or: [{ isActive: true }, { isActive: { $exists: false } }]
      }

      console.log("Fetching products for brand XML with query:", JSON.stringify(query))

      // Get total count first
      const totalCount = await Product.countDocuments(query)
      console.log(`Total ${brandName} products for XML: ${totalCount}`)

      // Build the aggregation pipeline
      const aggregationPipeline = [
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
        {
          $unwind: {
            path: "$brand",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$category",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$parentCategory",
            preserveNullAndEmptyArrays: true,
          },
        },
      ]

      // Add pagination only if limit is specified
      if (limit > 0) {
        aggregationPipeline.push({ $skip: skip })
        aggregationPipeline.push({ $limit: limit })
      }

      const products = await Product.aggregate(aggregationPipeline)

      console.log(`Found ${products.length} ${brandName} products for XML`)

      res.set({
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      })

      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title><![CDATA[GrabA2Z ${brand.name} Products]]></title>
    <link>https://www.grabatoz.ae</link>
    <description><![CDATA[GrabA2Z ${brand.name} Product Feed - Total: ${totalCount} products]]></description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
`

      let processedCount = 0
      const availabilityStats = {
        inStock: 0,
        outOfStock: 0,
        preOrder: 0,
      }

      for (const product of products) {
        try {
          // Skip products without a name
          if (!product.name || product.name.trim() === "") {
            console.warn(`Skipping product ${product._id} - missing name`)
            continue
          }

          // Escape & in slug for valid XML URLs
          const cleanSlug = (product.slug || product._id.toString()).replace(/&/g, '%26')
          const productUrl = `https://www.grabatoz.ae/product/${cleanSlug}`
          
          // Escape & in image URLs for valid XML
          let imageUrl = product.image
            ? product.image.startsWith("http")
              ? product.image
              : `https://www.grabatoz.ae${product.image}`
            : "https://www.grabatoz.ae/placeholder.jpg"
          imageUrl = imageUrl.replace(/&/g, '&amp;')

          // Use the improved availability logic
          const availability = determineAvailability(product)
          if (availability === "in stock") availabilityStats.inStock++
          else if (availability === "out of stock") availabilityStats.outOfStock++
          else if (availability === "preorder") availabilityStats.preOrder++

          // Handle pricing
          let price = 0
          if (product.offerPrice && product.offerPrice > 0) {
            price = product.offerPrice
          } else if (product.price && product.price > 0) {
            price = product.price
          } else {
            price = 1
          }

          const salePrice =
            product.offerPrice && product.offerPrice > 0 && product.price && product.offerPrice < product.price
              ? product.offerPrice
              : null

          // Clean and limit description
          const cleanDescription = truncateDescription(
            product.description || product.shortDescription || product.name || "No description available"
          )

          // Truncate title
          const truncatedTitle = truncateTitle(product.name)

          const googleProductCategory = determineGoogleCategory(product.parentCategory?.name, product.category?.name)
          const productType =
            (product.parentCategory?.name || "Uncategorized") +
            (product.category?.name ? ` > ${product.category.name}` : "")

          // Check if product has valid identifiers
          const hasGtin = product.gtin && product.gtin.trim() !== ''
          const hasMpn = product.sku && product.sku.trim() !== ''
          const hasBrand = product.brand?.name && product.brand.name.toLowerCase() !== 'generic'
          const identifierExists = hasGtin || (hasBrand && hasMpn)

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
      <g:condition>new</g:condition>`

          if (product.brand?.name) {
            xml += `
      <g:brand><![CDATA[${cleanForCDATA(product.brand.name)}]]></g:brand>`
          }

          if (product.gtin) {
            xml += `
      <g:gtin>${escapeXml(product.gtin)}</g:gtin>`
          }

          if (product.sku) {
            xml += `
      <g:mpn><![CDATA[${cleanForCDATA(product.sku)}]]></g:mpn>`
          } else {
            xml += `
      <g:mpn><![CDATA[${cleanForCDATA(product._id.toString())}]]></g:mpn>`
          }

          xml += `
      <g:identifier_exists>${identifierExists ? 'true' : 'false'}</g:identifier_exists>`

          xml += `
      <g:google_product_category><![CDATA[${googleProductCategory}]]></g:google_product_category>
      <g:product_type><![CDATA[${cleanForCDATA(productType)}]]></g:product_type>
      <g:item_group_id>${escapeXml(product._id.toString())}</g:item_group_id>`

          xml += `
      <g:shipping>
        <g:country>AE</g:country>
        <g:service>Standard Shipping</g:service>
        <g:price>0.00 AED</g:price>
      </g:shipping>`

          // Add additional images if available
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

          // Add weight if available
          if (product.weight && product.weight > 0) {
            xml += `
      <g:shipping_weight>${product.weight} kg</g:shipping_weight>`
          }

          // Add custom labels
          xml += `
      <g:custom_label_0><![CDATA[${cleanForCDATA(brand.name)}]]></g:custom_label_0>`

          if (product.featured) {
            xml += `
      <g:custom_label_1>Featured</g:custom_label_1>`
          }

          if (product.tags && product.tags.length > 0) {
            const tagsString = product.tags.slice(0, 3).join(", ")
            xml += `
      <g:custom_label_2><![CDATA[${cleanForCDATA(tagsString)}]]></g:custom_label_2>`
          }

          xml += `
    </item>
`
          processedCount++
        } catch (productError) {
          console.error(`Error processing ${brandName} product ${product._id} for XML:`, productError)
          continue
        }
      }

      xml += `  </channel>
</rss>`

      console.log(`${brandName} XML feed generated with ${processedCount} products out of ${totalCount} total`)
      console.log(`${brandName} XML Availability stats:`, availabilityStats)
      res.send(xml)
    } catch (error) {
      console.error(`Brand ${req.params.brandName} XML feed error:`, error)
      res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?>
<error>
  <message><![CDATA[Error generating ${req.params.brandName} product feed: ${error.message}]]></message>
</error>`)
    }
  }),
)

// @desc    Get Brand product count
// @route   GET /api/google-merchant/brand/:brandName/count
// @access  Public
router.get(
  "/brand/:brandName/count",
  asyncHandler(async (req, res) => {
    try {
      const brandName = req.params.brandName
      
      // Find the brand by name (case-insensitive)
      const Brand = (await import("../models/brandModel.js")).default
      const brand = await Brand.findOne({ 
        name: { $regex: new RegExp(`^${brandName}$`, 'i') } 
      })

      if (!brand) {
        res.status(404).json({ error: `Brand "${brandName}" not found` })
        return
      }

      const query = {
        brand: brand._id,
        $or: [{ isActive: true }, { isActive: { $exists: false } }]
      }

      const totalCount = await Product.countDocuments(query)
      const activeCount = await Product.countDocuments({ ...query, isActive: true })
      const inStockCount = await Product.countDocuments({ ...query, stockStatus: "In Stock" })
      const outOfStockCount = await Product.countDocuments({ ...query, stockStatus: "Out of Stock" })

      res.json({
        brand: brand.name,
        brandId: brand._id,
        totalProducts: totalCount,
        activeProducts: activeCount,
        inStock: inStockCount,
        outOfStock: outOfStockCount,
        feedUrl: `/api/google-merchant/brand/${brandName}/feed.xml`
      })
    } catch (error) {
      console.error(`Brand ${req.params.brandName} count error:`, error)
      res.status(500).json({ error: error.message })
    }
  }),
)

export default router





