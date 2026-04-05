import express from "express"
import asyncHandler from "express-async-handler"
import CacheVersion from "../models/cacheVersionModel.js"
import { protect, admin } from "../middleware/authMiddleware.js"
import cacheService, { cacheHelpers } from "../services/cacheService.js"

const router = express.Router()

// @desc    Get current cache version
// @route   GET /api/cache/version
// @access  Public
router.get(
  "/version",
  asyncHandler(async (req, res) => {
    let cacheData = await CacheVersion.findOne({})

    if (!cacheData) {
      cacheData = new CacheVersion({ version: 1 })
      await cacheData.save()
    }

    res.json({
      version: cacheData.version,
      resetAt: cacheData.resetAt,
    })
  })
)

// @desc    Get cache statistics
// @route   GET /api/cache/stats
// @access  Private/Admin
router.get(
  "/stats",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const stats = await cacheService.getStats()
    const health = await cacheService.healthCheck()
    
    res.json({
      success: true,
      stats,
      health,
    })
  })
)

// @desc    Get cache health status
// @route   GET /api/cache/health
// @access  Public
router.get(
  "/health",
  asyncHandler(async (req, res) => {
    const health = await cacheService.healthCheck()
    res.json(health)
  })
)

// @desc    Get cache reset history
// @route   GET /api/cache/history
// @access  Private/Admin
router.get(
  "/history",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    let cacheData = await CacheVersion.findOne({}).populate("resetHistory.resetBy", "name email")

    if (!cacheData) {
      cacheData = new CacheVersion({ version: 1 })
      await cacheData.save()
    }

    res.json({
      currentVersion: cacheData.version,
      lastResetAt: cacheData.resetAt,
      history: cacheData.resetHistory || [],
    })
  })
)

// @desc    Reset cache for all users (client-side cache version)
// @route   POST /api/cache/reset
// @access  Private/Admin
router.post(
  "/reset",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    let cacheData = await CacheVersion.findOne({})

    if (!cacheData) {
      cacheData = new CacheVersion({ version: 1 })
    }

    // Increment cache version
    const newVersion = (cacheData.version || 1) + 1
    const resetTime = new Date()

    // Add to history
    if (!cacheData.resetHistory) {
      cacheData.resetHistory = []
    }
    cacheData.resetHistory.unshift({
      version: newVersion,
      resetAt: resetTime,
      resetBy: req.user._id,
    })

    // Keep only last 20 reset records
    if (cacheData.resetHistory.length > 20) {
      cacheData.resetHistory = cacheData.resetHistory.slice(0, 20)
    }

    cacheData.version = newVersion
    cacheData.resetAt = resetTime
    cacheData.resetBy = req.user._id

    await cacheData.save()

    res.json({
      success: true,
      message: "Cache reset successfully! All users will get fresh content on their next visit.",
      version: cacheData.version,
      resetAt: cacheData.resetAt,
    })
  })
)

// @desc    Flush all server-side cache
// @route   POST /api/cache/flush
// @access  Private/Admin
router.post(
  "/flush",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const result = await cacheService.flushAll()
    
    // Also update cache version for client-side
    let cacheData = await CacheVersion.findOne({})
    if (!cacheData) {
      cacheData = new CacheVersion({ version: 1 })
    }
    
    const newVersion = (cacheData.version || 1) + 1
    cacheData.version = newVersion
    cacheData.resetAt = new Date()
    cacheData.resetBy = req.user._id
    
    if (!cacheData.resetHistory) {
      cacheData.resetHistory = []
    }
    cacheData.resetHistory.unshift({
      version: newVersion,
      resetAt: cacheData.resetAt,
      resetBy: req.user._id,
      reason: 'Full cache flush',
    })
    
    await cacheData.save()
    
    res.json({
      success: true,
      message: "All server-side cache has been flushed successfully!",
      result,
      clientCacheVersion: newVersion,
    })
  })
)

// @desc    Invalidate cache for specific entity type
// @route   POST /api/cache/invalidate/:entityType
// @access  Private/Admin
router.post(
  "/invalidate/:entityType",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { entityType } = req.params
    
    // Valid entity types
    const validTypes = [
      'products', 'categories', 'subCategories', 'brands', 'banners', 'bannerCards',
      'settings', 'homeSections', 'offers', 'gamingZone', 'blogs', 'colors', 
      'sizes', 'units', 'volumes', 'warranties', 'taxes', 'deliveryCharges',
      'coupons', 'reviews', 'customSliderItems', 'buyerProtection'
    ]
    
    if (!validTypes.includes(entityType)) {
      res.status(400)
      throw new Error(`Invalid entity type. Valid types: ${validTypes.join(', ')}`)
    }
    
    const helper = cacheHelpers[entityType]
    let invalidatedCount = 0
    
    if (helper?.invalidate) {
      invalidatedCount = await helper.invalidate()
    } else {
      invalidatedCount = await cacheService.invalidateEntity(entityType)
    }
    
    res.json({
      success: true,
      message: `Cache for '${entityType}' has been invalidated.`,
      invalidatedKeys: invalidatedCount,
    })
  })
)

// @desc    Invalidate multiple entity types
// @route   POST /api/cache/invalidate-multiple
// @access  Private/Admin
router.post(
  "/invalidate-multiple",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { entityTypes } = req.body
    
    if (!entityTypes || !Array.isArray(entityTypes) || entityTypes.length === 0) {
      res.status(400)
      throw new Error("Please provide an array of entity types to invalidate")
    }
    
    const results = {}
    let totalInvalidated = 0
    
    for (const entityType of entityTypes) {
      const helper = cacheHelpers[entityType]
      let count = 0
      
      if (helper?.invalidate) {
        count = await helper.invalidate()
      } else {
        count = await cacheService.invalidateEntity(entityType)
      }
      
      results[entityType] = count
      totalInvalidated += count
    }
    
    res.json({
      success: true,
      message: `Cache invalidated for ${entityTypes.length} entity types.`,
      results,
      totalInvalidated,
    })
  })
)

// @desc    Warm up cache for critical data
// @route   POST /api/cache/warm
// @access  Private/Admin
router.post(
  "/warm",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    // This endpoint can be used to pre-populate cache with frequently accessed data
    // Implementation depends on specific needs
    
    res.json({
      success: true,
      message: "Cache warming initiated. Critical data will be cached as it's accessed.",
    })
  })
)

// @desc    Get list of available entity types for cache management
// @route   GET /api/cache/entity-types
// @access  Private/Admin
router.get(
  "/entity-types",
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const entityTypes = Object.keys(cacheHelpers).map(key => ({
      name: key,
      description: `Cache for ${key}`,
    }))
    
    res.json({
      success: true,
      entityTypes,
    })
  })
)

export default router
