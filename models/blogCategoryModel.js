import mongoose from "mongoose"
import { getBlogConnection } from "../config/db.js"

const blogCategorySchema = new mongoose.Schema(
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
    image: {
      type: String,
    },
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogCategory",
      default: null,
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

// Lazy initialization - model created on first use
let BlogCategory = null

function getModel() {
  if (!BlogCategory) {
    const connection = getBlogConnection()
    // Delete existing model if it exists to prevent schema caching issues
    if (connection.models.BlogCategory) {
      delete connection.models.BlogCategory
    }
    BlogCategory = connection.model("BlogCategory", blogCategorySchema)
  }
  return BlogCategory
}

// Create a callable function that can be used with 'new'
const BlogCategoryProxy = new Proxy(function() {}, {
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

export default BlogCategoryProxy
