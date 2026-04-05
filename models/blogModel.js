import mongoose from "mongoose"
import { getBlogConnection } from "../config/db.js"

const blogSchema = new mongoose.Schema(
  {
    blogName: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    featured: {
      type: Boolean,
      default: false,
    },
    trending: {
      type: Boolean,
      default: false,
    },
    blogCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogCategory",
    },
    // Keep old fields for backward compatibility
    mainCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    subCategory1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    subCategory2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    subCategory3: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    subCategory4: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogTopic",
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogBrand",
    },
    mainImage: {
      type: String,
    },
    additionalImage: {
      type: String,
    },
    readMinutes: {
      type: Number,
      default: 5,
    },
    postedBy: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    metaTitle: {
      type: String,
    },
    metaDescription: {
      type: String,
    },
    schema: {
      type: String,
      default: "",
    },
    tags: mongoose.Schema.Types.Mixed,
    views: {
      type: Number,
      default: 0,
    },
    likes: {
      type: Number,
      default: 0,
    },
    shares: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
)

// Index for search functionality (removed tags from text index to fix validation error)
blogSchema.index({ title: "text", description: "text" })
blogSchema.index({ status: 1, createdAt: -1 })
blogSchema.index({ status: 1, featured: 1, createdAt: -1 })
blogSchema.index({ status: 1, trending: 1, createdAt: -1 })

function getModel() {
  const connection = getBlogConnection()
  if (connection.models.Blog) {
    return connection.models.Blog
  }
  return connection.model("Blog", blogSchema)
}

const BlogProxy = new Proxy(function() {}, {
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

export default BlogProxy

