/**
 * Cache Middleware
 * 
 * Express middleware for automatic caching of GET requests.
 * Features:
 * - Automatic response caching
 * - Cache key generation from URL and query params
 * - Skip caching for authenticated/admin routes when needed
 * - Automatic cache invalidation on mutations
 * 
 * @module cacheMiddleware
 */

import cacheService, { cacheHelpers, CACHE_CONFIG } from '../services/cacheService.js'

/**
 * Create a unique cache key from request
 */
const createCacheKey = (req, prefix) => {
  const query = req.query ? JSON.stringify(req.query) : ''
  const params = req.params ? JSON.stringify(req.params) : ''
  const key = `${prefix}:${req.originalUrl}:${query}:${params}`
  return key.replace(/[{}":]/g, '_').replace(/\s/g, '')
}

/**
 * Cache middleware for GET requests
 * 
 * @param {string} entityType - The entity type (products, categories, etc.)
 * @param {object} options - Additional options
 * @param {number} options.ttl - Custom TTL in seconds
 * @param {boolean} options.skipAuth - Skip caching for authenticated requests
 * @param {boolean} options.skipQuery - Skip certain query parameters in key
 */
export const cacheMiddleware = (entityType, options = {}) => {
  const { ttl, skipAuth = false, keyPrefix = '' } = options
  
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next()
    }
    
    // Skip caching for authenticated requests if specified
    if (skipAuth && req.user) {
      return next()
    }
    
    try {
      const helper = cacheHelpers[entityType]
      const cacheKey = keyPrefix 
        ? `${entityType}:${keyPrefix}:${createCacheKey(req, entityType)}`
        : createCacheKey(req, entityType)
      
      // Try to get from cache
      const cachedData = await cacheService.get(cacheKey)
      
      if (cachedData) {
        // Add cache header
        res.set('X-Cache', 'HIT')
        res.set('X-Cache-Key', cacheKey)
        return res.json(cachedData)
      }
      
      // Store original json method
      const originalJson = res.json.bind(res)
      
      // Override json method to cache response
      res.json = (data) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const cacheTtl = ttl || helper?.getTTL() || CACHE_CONFIG.DEFAULT_TTL
          cacheService.set(cacheKey, data, cacheTtl).catch((error) => {
            console.error('Cache set error:', error.message)
          })
          res.set('X-Cache', 'MISS')
          res.set('X-Cache-Key', cacheKey)
        }
        
        return originalJson(data)
      }
      
      next()
    } catch (error) {
      console.error('Cache middleware error:', error.message)
      next()
    }
  }
}

/**
 * Cache invalidation middleware for POST/PUT/DELETE requests
 * 
 * @param {string|string[]} entityTypes - Entity type(s) to invalidate
 * @param {object} options - Additional options
 * @param {string[]} options.alsoInvalidate - Additional entity types to invalidate
 */
export const invalidateCacheMiddleware = (entityTypes, options = {}) => {
  const { alsoInvalidate = [] } = options
  const types = Array.isArray(entityTypes) ? entityTypes : [entityTypes]
  const allTypes = [...types, ...alsoInvalidate]
  
  return async (req, res, next) => {
    // Only invalidate on mutations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next()
    }
    
    // Store original json method
    const originalJson = res.json.bind(res)
    
    // Override json method to invalidate cache after successful response
    res.json = async (data) => {
      // Only invalidate on successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          for (const entityType of allTypes) {
            const helper = cacheHelpers[entityType]
            if (helper?.invalidate) {
              await helper.invalidate()
            } else {
              await cacheService.invalidateEntity(entityType)
            }
          }
          console.log(`📦 Cache: Invalidated cache for: ${allTypes.join(', ')}`)
        } catch (error) {
          console.error('Cache invalidation error:', error.message)
        }
      }
      
      return originalJson(data)
    }
    
    next()
  }
}

/**
 * Combined middleware for routes that need both caching and invalidation
 * 
 * @param {string} entityType - The entity type
 * @param {object} options - Options for both caching and invalidation
 */
export const cacheWithInvalidation = (entityType, options = {}) => {
  return (req, res, next) => {
    if (req.method === 'GET') {
      return cacheMiddleware(entityType, options)(req, res, next)
    } else {
      return invalidateCacheMiddleware(entityType, options)(req, res, next)
    }
  }
}

/**
 * Middleware to attach cache service to request
 */
export const attachCacheService = (req, res, next) => {
  req.cache = cacheService
  req.cacheHelpers = cacheHelpers
  next()
}

/**
 * Global auto-invalidation middleware.
 * Clears server cache after any successful mutation request so data stays real-time.
 *
 * @param {object} options
 * @param {string[]} options.excludePaths - URL prefixes to skip
 */
export const autoInvalidateAllCacheOnMutation = (options = {}) => {
  const { excludePaths = ["/api/cache"] } = options

  return (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      return next()
    }

    const requestPath = req.originalUrl || ""
    const isExcluded = excludePaths.some((prefix) => requestPath.startsWith(prefix))
    if (isExcluded) {
      return next()
    }

    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return
      }

      // Invalidate asynchronously after response is sent.
      ;(async () => {
        try {
          const invalidatedCount = await cacheService.invalidatePattern("*")
          console.log(
            `Cache: Auto-invalidated ${invalidatedCount} key(s) after ${req.method} ${requestPath} (${res.statusCode})`,
          )
        } catch (error) {
          console.error("Cache auto-invalidation error:", error.message)
        }
      })()
    })

    next()
  }
}

/**
 * Express middleware function to wrap existing route handlers with caching
 * 
 * @param {string} entityType - The entity type
 * @param {function} handler - The async route handler
 * @param {object} options - Cache options
 */
export const withCache = (entityType, handler, options = {}) => {
  const { ttl } = options
  
  return async (req, res, next) => {
    const helper = cacheHelpers[entityType]
    const cacheKey = createCacheKey(req, entityType)
    
    try {
      // Try to get from cache
      const cachedData = await cacheService.get(cacheKey)
      
      if (cachedData) {
        res.set('X-Cache', 'HIT')
        return res.json(cachedData)
      }
      
      // Store original json method
      const originalJson = res.json.bind(res)
      
      // Override json method to cache response
      res.json = (data) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const cacheTtl = ttl || helper?.getTTL() || CACHE_CONFIG.DEFAULT_TTL
          cacheService.set(cacheKey, data, cacheTtl).catch((error) => {
            console.error('Cache set error:', error.message)
          })
          res.set('X-Cache', 'MISS')
        }
        return originalJson(data)
      }
      
      // Call the original handler
      await handler(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Helper function to manually invalidate cache in route handlers
 */
export const invalidateCache = async (entityTypes) => {
  const types = Array.isArray(entityTypes) ? entityTypes : [entityTypes]
  
  for (const entityType of types) {
    const helper = cacheHelpers[entityType]
    if (helper?.invalidate) {
      await helper.invalidate()
    } else {
      await cacheService.invalidateEntity(entityType)
    }
  }
  
  console.log(`📦 Cache: Manually invalidated: ${types.join(', ')}`)
}

export default {
  cacheMiddleware,
  invalidateCacheMiddleware,
  cacheWithInvalidation,
  attachCacheService,
  autoInvalidateAllCacheOnMutation,
  withCache,
  invalidateCache,
}
