// import mongoose from "mongoose"

// const categorySchema = mongoose.Schema(
//   {
//     name: {
//       type: String,
//       required: true,
//       trim: true,
//     },
//     slug: {
//       type: String,
//       required: true,
//       unique: true,
//       lowercase: true,
//     },
//     description: {
//       type: String,
//       trim: true,
//     },
//     image: {
//       type: String,
//     },
//     isActive: {
//       type: Boolean,
//       default: true,
//     },
//     sortOrder: {
//       type: Number,
//       default: 0,
//     },
//     isDeleted: {
//       type: Boolean,
//       default: false,
//     },
//     deletedAt: {
//       type: Date,
//     },
//     createdBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//     },
//   },
//   {
//     timestamps: true,
//   },
// )

// // Add index for better performance
// categorySchema.index({ isDeleted: 1, isActive: 1 })

// const Category = mongoose.model("Category", categorySchema)

// export default Category


import mongoose from "mongoose"

const categorySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameAr: {
      type: String,
      default: "",
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
    },
    description: {
      type: String,
      default: "",
    },
    descriptionAr: {
      type: String,
      default: "",
    },
    seoContent: {
      type: String,
      default: "",
    },
    seoContentAr: {
      type: String,
      default: "",
    },
    metaTitle: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100, // Increased limit for better SEO flexibility
    },
    metaTitleAr: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    metaDescription: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300, // Increased limit for better SEO flexibility
    },
    metaDescriptionAr: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    customSchema: {
      type: String,
      default: "",
    },
    redirectUrl: {
      type: String,
      default: "",
      trim: true,
    },
    image: {
      type: String,
      default: "",
    },
    // Whether this category should appear in the Home page category slider
    showInSlider: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
)

// Index for better performance
categorySchema.index({ name: 1 })
categorySchema.index({ isActive: 1 })

const Category = mongoose.model("Category", categorySchema)

export default Category
