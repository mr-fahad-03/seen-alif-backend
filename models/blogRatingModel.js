import mongoose from "mongoose"
import { getBlogConnection } from "../config/db.js"

const blogRatingSchema = new mongoose.Schema(
  {
    blog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Blog",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
)

// Ensure one rating per user per blog
blogRatingSchema.index({ blog: 1, user: 1 }, { unique: true })

// Lazy initialization
let BlogRating = null

function getModel() {
  if (!BlogRating) {
    const connection = getBlogConnection()
    BlogRating = connection.model("BlogRating", blogRatingSchema)
  }
  return BlogRating
}

const BlogRatingProxy = new Proxy(function() {}, {
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

export default BlogRatingProxy
