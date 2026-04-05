import mongoose from "mongoose"
import { getBlogConnection } from "../config/db.js"

const blogBrandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
    },
    website: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    blogCount: {
      type: Number,
      default: 0,
    },
    metaTitle: {
      type: String,
    },
    metaDescription: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
)

// Lazy initialization
let BlogBrand = null

function getModel() {
  if (!BlogBrand) {
    const connection = getBlogConnection()
    // Delete existing model if it exists to prevent schema caching issues
    if (connection.models.BlogBrand) {
      delete connection.models.BlogBrand
    }
    BlogBrand = connection.model("BlogBrand", blogBrandSchema)
  }
  return BlogBrand
}

const BlogBrandProxy = new Proxy(function() {}, {
  get(target, prop) {
    return getModel()[prop]
  },
  construct(target, args) {
    const Model = getModel()
    return new Model(...args)
  },
  apply(target, thisArg, args) {
    return getModel()(...args)
  }
})

export default BlogBrandProxy
