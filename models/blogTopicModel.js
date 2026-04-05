import mongoose from "mongoose"
import { getBlogConnection } from "../config/db.js"

const blogTopicSchema = new mongoose.Schema(
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
    color: {
      type: String,
      default: "#3B82F6",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    blogCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
)

// Lazy initialization
let BlogTopic = null

function getModel() {
  if (!BlogTopic) {
    const connection = getBlogConnection()
    // Delete existing model if it exists to prevent schema caching issues
    if (connection.models.BlogTopic) {
      delete connection.models.BlogTopic
    }
    BlogTopic = connection.model("BlogTopic", blogTopicSchema)
  }
  return BlogTopic
}

const BlogTopicProxy = new Proxy(function() {}, {
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

export default BlogTopicProxy
