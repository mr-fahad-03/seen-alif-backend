import mongoose from "mongoose"
import Category from "../models/categoryModel.js"
import SubCategory from "../models/subCategoryModel.js"
import dotenv from "dotenv"

dotenv.config()

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI)
    console.log(`MongoDB Connected: ${conn.connection.host}`)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

const fixCategories = async () => {
  try {
    await connectDB()

    console.log("Starting category cleanup...")

    // 1. Remove invalid categories (those with ID-like names)
    const invalidCategories = await Category.find({
      name: { $regex: /^[0-9a-fA-F]{24}$/ },
    })

    console.log(`Found ${invalidCategories.length} invalid categories with ID-like names`)

    for (const cat of invalidCategories) {
      console.log(`Removing invalid category: ${cat.name}`)
      await Category.findByIdAndDelete(cat._id)
    }

    // 2. Get all subcategories to understand the structure
    const allSubCategories = await SubCategory.find({}).populate("category")
    console.log(`Found ${allSubCategories.length} subcategories`)

    // 3. Create parent categories based on subcategory patterns
    const parentCategoryMap = new Map()

    allSubCategories.forEach((sub) => {
      // Extract parent category from subcategory name
      // e.g., "MSI Laptops" -> "Laptops"
      const parts = sub.name.split(" ")
      if (parts.length > 1) {
        const possibleParent = parts.slice(1).join(" ")
        if (!parentCategoryMap.has(possibleParent)) {
          parentCategoryMap.set(possibleParent, [])
        }
        parentCategoryMap.get(possibleParent).push(sub)
      }
    })

    console.log("Detected parent categories:", Array.from(parentCategoryMap.keys()))

    // 4. Create or update parent categories
    for (const [parentName, subcategories] of parentCategoryMap) {
      let parentCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${parentName}$`, "i") },
      })

      if (!parentCategory) {
        console.log(`Creating parent category: ${parentName}`)
        parentCategory = new Category({
          name: parentName,
          slug: parentName.toLowerCase().replace(/\s+/g, "-"),
          description: `${parentName} category`,
          isActive: true,
          isDeleted: false,
        })
        await parentCategory.save()
      }

      // 5. Update subcategories to reference the correct parent
      for (const sub of subcategories) {
        if (sub.category?._id?.toString() !== parentCategory._id.toString()) {
          console.log(`Updating subcategory ${sub.name} to reference ${parentName}`)
          await SubCategory.findByIdAndUpdate(sub._id, {
            category: parentCategory._id,
          })
        }
      }
    }

    // 6. Clean up any remaining invalid data
    await Category.deleteMany({
      $or: [{ name: { $exists: false } }, { name: "" }, { name: null }, { name: { $regex: /^[0-9a-fA-F]{24}$/ } }],
    })

    await SubCategory.deleteMany({
      $or: [{ name: { $exists: false } }, { name: "" }, { name: null }, { name: { $regex: /^[0-9a-fA-F]{24}$/ } }],
    })

    console.log("Category cleanup completed!")

    // 7. Display final structure
    const finalCategories = await Category.find({ isDeleted: { $ne: true } })
    const finalSubCategories = await SubCategory.find({}).populate("category")

    console.log("\nFinal category structure:")
    for (const cat of finalCategories) {
      const subs = finalSubCategories.filter(
        (sub) => (sub.category?._id || sub.category)?.toString() === cat._id.toString(),
      )
      console.log(`${cat.name} (${subs.length} subcategories)`)
      subs.forEach((sub) => console.log(`  - ${sub.name}`))
    }

    process.exit(0)
  } catch (error) {
    console.error("Error fixing categories:", error)
    process.exit(1)
  }
}

fixCategories()
