import Review from "../models/reviewModel.js"
import Product from "../models/productModel.js"

/**
 * Update product rating and review count based on approved reviews
 * @param {string} productId - The product ID to update
 */
export const updateProductReviewStats = async (productId) => {
  try {
    console.log(`[ReviewUtils] Updating review stats for product: ${productId}`)

    // Get all approved reviews for this product
    const approvedReviews = await Review.find({
      product: productId,
      status: "approved",
    })

    console.log(`[ReviewUtils] Found ${approvedReviews.length} approved reviews`)

    // Calculate new stats
    const numReviews = approvedReviews.length
    let rating = 0

    if (numReviews > 0) {
      const totalRating = approvedReviews.reduce((sum, review) => sum + Number(review.rating), 0)
      rating = Math.round((totalRating / numReviews) * 10) / 10 // Round to 1 decimal place
    }

    console.log(`[ReviewUtils] Calculated stats - Rating: ${rating}, NumReviews: ${numReviews}`)

    // Update the product
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        rating: rating,
        numReviews: numReviews,
      },
      { new: true },
    )

    if (updatedProduct) {
      console.log(`[ReviewUtils] Successfully updated product: ${updatedProduct.name}`)
      console.log(
        `[ReviewUtils] New stats - Rating: ${updatedProduct.rating}, NumReviews: ${updatedProduct.numReviews}`,
      )
    } else {
      console.error(`[ReviewUtils] Product not found: ${productId}`)
    }

    return updatedProduct
  } catch (error) {
    console.error(`[ReviewUtils] Error updating product review stats:`, error)
    throw error
  }
}

/**
 * Update review stats for multiple products
 * @param {string[]} productIds - Array of product IDs to update
 */
export const updateMultipleProductReviewStats = async (productIds) => {
  try {
    console.log(`[ReviewUtils] Updating review stats for ${productIds.length} products`)

    const results = []
    for (const productId of productIds) {
      try {
        const result = await updateProductReviewStats(productId)
        results.push(result)
      } catch (error) {
        console.error(`[ReviewUtils] Failed to update product ${productId}:`, error)
        results.push(null)
      }
    }

    return results
  } catch (error) {
    console.error(`[ReviewUtils] Error updating multiple product review stats:`, error)
    throw error
  }
}

/**
 * Recalculate review stats for all products (migration utility)
 */
export const recalculateAllProductReviewStats = async () => {
  try {
    console.log(`[ReviewUtils] Starting recalculation of all product review stats`)

    // Get all products
    const products = await Product.find({}, "_id name")
    console.log(`[ReviewUtils] Found ${products.length} products to update`)

    let updated = 0
    let errors = 0

    for (const product of products) {
      try {
        await updateProductReviewStats(product._id)
        updated++

        // Log progress every 50 products
        if (updated % 50 === 0) {
          console.log(`[ReviewUtils] Progress: ${updated}/${products.length} products updated`)
        }
      } catch (error) {
        console.error(`[ReviewUtils] Failed to update product ${product._id} (${product.name}):`, error)
        errors++
      }
    }

    console.log(`[ReviewUtils] Recalculation complete - Updated: ${updated}, Errors: ${errors}`)
    return { updated, errors, total: products.length }
  } catch (error) {
    console.error(`[ReviewUtils] Error in recalculateAllProductReviewStats:`, error)
    throw error
  }
}