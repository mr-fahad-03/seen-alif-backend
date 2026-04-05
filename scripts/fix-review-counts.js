import mongoose from "mongoose"
import dotenv from "dotenv"
import { recalculateAllProductReviewStats } from "../utils/reviewUtils.js"

// Load environment variables from the server directory
dotenv.config({ path: './.env' })

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI)
    console.log(`MongoDB Connected: ${conn.connection.host}`)
  } catch (error) {
    console.error("Database connection error:", error)
    process.exit(1)
  }
}

const fixReviewCounts = async () => {
  console.log("🚀 Starting review count migration...")
  console.log("This script will recalculate numReviews and rating for all products based on approved reviews.")
  console.log("=".repeat(80))

  try {
    // Connect to database
    await connectDB()

    // Run the migration
    const result = await recalculateAllProductReviewStats()

    console.log("=".repeat(80))
    console.log("✅ Migration completed successfully!")
    console.log(`📊 Results:`)
    console.log(`   - Total products: ${result.total}`)
    console.log(`   - Successfully updated: ${result.updated}`)
    console.log(`   - Errors: ${result.errors}`)

    if (result.errors > 0) {
      console.log("⚠️  Some products had errors during update. Check the logs above for details.")
    }

    console.log("=".repeat(80))
    console.log("🎉 All done! Your product review counts should now be accurate.")
  } catch (error) {
    console.error("❌ Migration failed:", error)
    process.exit(1)
  } finally {
    // Close database connection
    await mongoose.connection.close()
    console.log("📝 Database connection closed.")
    process.exit(0)
  }
}

// Run the migration
fixReviewCounts()
