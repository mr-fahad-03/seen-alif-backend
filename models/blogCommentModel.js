import mongoose from "mongoose"
import { getBlogConnection } from "../config/db.js"

const blogCommentSchema = new mongoose.Schema(
  {
    blog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Blog",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
    },
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogComment",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "spam"],
      default: "pending",
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
    },
    likes: {
      type: Number,
      default: 0,
    },
    dislikes: {
      type: Number,
      default: 0,
    },
    adminReply: {
      type: String,
      trim: true,
    },
    ipAddress: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
)

// Index for faster queries
blogCommentSchema.index({ blog: 1, status: 1 })
blogCommentSchema.index({ user: 1 })
blogCommentSchema.index({ createdAt: -1 })

// Lazy initialization
let BlogComment = null

function getModel() {
  if (!BlogComment) {
    const connection = getBlogConnection()
    BlogComment = connection.model("BlogComment", blogCommentSchema)
  }
  return BlogComment
}

const BlogCommentProxy = new Proxy(function() {}, {
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

export default BlogCommentProxy
