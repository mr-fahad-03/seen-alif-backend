import mongoose from "mongoose"

const cacheVersionSchema = mongoose.Schema(
  {
    version: {
      type: Number,
      default: 1,
    },
    resetAt: {
      type: Date,
      default: null,
    },
    resetBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    resetHistory: [
      {
        version: Number,
        resetAt: Date,
        resetBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
  },
  {
    timestamps: true,
  }
)

const CacheVersion = mongoose.model("CacheVersion", cacheVersionSchema)

export default CacheVersion
