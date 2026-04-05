import express from "express"
import asyncHandler from "express-async-handler"
import { protect } from "../middleware/authMiddleware.js"
import User from "../models/userModel.js"
import Product from "../models/productModel.js"

const router = express.Router()

// @desc    Get current user's wishlist
// @route   GET /api/wishlist
// @access  Private
router.get(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).populate({
      path: "wishlist",
      populate: [
        { path: "category", select: "name" },
        { path: "subCategory", select: "name" },
        { path: "brand", select: "name" },
      ],
    })
    res.json(user.wishlist)
  })
)

// @desc    Add product to wishlist
// @route   POST /api/wishlist
// @access  Private
router.post(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    const { productId } = req.body
    const user = await User.findById(req.user._id)
    if (!user.wishlist.includes(productId)) {
      user.wishlist.push(productId)
      await user.save()
    }
    const updatedUser = await User.findById(req.user._id).populate({
      path: "wishlist",
      populate: [
        { path: "category", select: "name" },
        { path: "subCategory", select: "name" },
        { path: "brand", select: "name" },
      ],
    })
    res.json(updatedUser.wishlist)
  })
)

// @desc    Remove product from wishlist
// @route   DELETE /api/wishlist/:productId
// @access  Private
router.delete(
  "/:productId",
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
    user.wishlist = user.wishlist.filter(
      (id) => id.toString() !== req.params.productId
    )
    await user.save()
    const updatedUser = await User.findById(req.user._id).populate({
      path: "wishlist",
      populate: [
        { path: "category", select: "name" },
        { path: "subCategory", select: "name" },
        { path: "brand", select: "name" },
      ],
    })
    res.json(updatedUser.wishlist)
  })
)

export default router
