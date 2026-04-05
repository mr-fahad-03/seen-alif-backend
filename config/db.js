import mongoose from "mongoose"

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI)
    console.log(`MongoDB Connected: ${conn.connection.host}`)
  } catch (error) {
    console.error(`Error: ${error.message}`)
    process.exit(1)
  }
}

// Separate connection for blogs
let blogConnection = null

const connectBlogDB = async () => {
  if (!blogConnection) {
    try {
      // Check if MONGODB_URI_2 is configured
      if (!process.env.MONGODB_URI_2) {
        console.warn(`⚠️  MONGODB_URI_2 not configured. Falling back to main MongoDB connection for blogs.`)
        // Use the default mongoose connection as a fallback so blog routes still work
        blogConnection = mongoose.connection
        return blogConnection
      }
      blogConnection = await mongoose.createConnection(process.env.MONGODB_URI_2).asPromise()
      console.log(`✅ Blog MongoDB Connected: ${blogConnection.host}`)
    } catch (error) {
      console.error(`❌ Blog DB Error: ${error.message}`)
      console.warn(`⚠️  Blog database connection failed. Blog features will be disabled.`)
      // Don't exit process - allow main site to continue running
      // As a last resort, fallback to main mongoose connection if available
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        console.warn(`⚠️ Falling back to main mongoose connection for blogs due to blog DB error.`)
        blogConnection = mongoose.connection
        return blogConnection
      }
      return null
    }
  }
  return blogConnection
}

// Get existing blog connection
const getBlogConnection = () => {
  if (!blogConnection) {
    // If blogConnection is not set, fallback to main mongoose connection if available
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      console.warn("⚠️ blogConnection not initialized - using main mongoose connection as fallback.")
      blogConnection = mongoose.connection
      return blogConnection
    }
    throw new Error("Blog database not connected. Make sure MONGODB_URI_2 is configured and connectBlogDB() was called.")
  }
  return blogConnection
}

export default connectDB
export { connectBlogDB, getBlogConnection }

