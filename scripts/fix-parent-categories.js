import mongoose from "mongoose"
import Product from "../models/productModel.js"
import SubCategory from "../models/subCategoryModel.js"
import config from "../config/config.js"

const fixParentCategories = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI)
    console.log("✅ Connected to MongoDB")

    // Get all products that don't have parentCategory set
    const productsWithoutParentCategory = await Product.find({
      $or: [
        { parentCategory: { $exists: false } },
        { parentCategory: null },
        { parentCategory: "" }
      ]
    }).populate("category", "category")

    console.log(`📦 Found ${productsWithoutParentCategory.length} products without parentCategory`)

    if (productsWithoutParentCategory.length === 0) {
      console.log("✅ All products already have parentCategory set")
      return
    }

    let updatedCount = 0
    let skippedCount = 0

    for (const product of productsWithoutParentCategory) {
      try {
        // Get the subcategory to find its parent category
        if (product.category && product.category.category) {
          // Update the product with the parent category
          await Product.findByIdAndUpdate(product._id, {
            parentCategory: product.category.category
          })
          updatedCount++
          console.log(`✅ Updated product: ${product.name} (ID: ${product._id})`)
        } else {
          console.log(`⚠️  Skipped product: ${product.name} - no subcategory or parent category found`)
          skippedCount++
        }
      } catch (error) {
        console.error(`❌ Error updating product ${product._id}:`, error.message)
        skippedCount++
      }
    }

    console.log(`\n📊 Summary:`)
    console.log(`✅ Updated: ${updatedCount} products`)
    console.log(`⚠️  Skipped: ${skippedCount} products`)
    console.log(`📦 Total processed: ${productsWithoutParentCategory.length} products`)

  } catch (error) {
    console.error("❌ Error:", error)
  } finally {
    await mongoose.disconnect()
    console.log("🔌 Disconnected from MongoDB")
  }
}

// Run the script
fixParentCategories() 