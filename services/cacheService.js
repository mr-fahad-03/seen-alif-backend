/**
 * Server-Side Cache Service
 * 
 * A comprehensive caching solution that supports both Redis and in-memory caching.
 * Features:
 * - Automatic cache invalidation on data updates
 * - Cache warming for frequently accessed data
 * - Pattern-based cache clearing
 * - TTL (Time To Live) support
 * - Statistics tracking
 * 
 * @module cacheService
 */

import { createClient } from 'redis'
import config from '../config/config.js'

// Cache configuration
const CACHE_CONFIG = {
  // Default TTL in seconds (1 hour)
  DEFAULT_TTL: 3600,
  
  // TTL for different data types (in seconds)
  TTL: {
    products: 1800,       // 30 minutes - products change frequently
    categories: 7200,     // 2 hours - categories are more stable
    brands: 7200,         // 2 hours
    banners: 3600,        // 1 hour
    settings: 86400,      // 24 hours - rarely changes
    homeSections: 3600,   // 1 hour
    offers: 1800,         // 30 minutes
    blogs: 3600,          // 1 hour
    gamingZone: 3600,     // 1 hour
    colors: 86400,        // 24 hours
    sizes: 86400,         // 24 hours
    units: 86400,         // 24 hours
    volumes: 86400,       // 24 hours
    warranties: 86400,    // 24 hours
    taxes: 86400,         // 24 hours
    deliveryCharges: 3600,// 1 hour
    coupons: 1800,        // 30 minutes
    reviews: 1800,        // 30 minutes
  },
  
  // Maximum items in in-memory cache
  MAX_MEMORY_ITEMS: 10000,
  
  // Cache key prefixes
  PREFIX: 'graba2z:',
}

// In-memory cache fallback
class MemoryCache {
  constructor(maxItems = 10000) {
    this.cache = new Map()
    this.maxItems = maxItems
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    }
  }

  async get(key) {
    const item = this.cache.get(key)
    if (!item) {
      this.stats.misses++
      return null
    }
    
    // Check if expired
    if (item.expiry && Date.now() > item.expiry) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }
    
    this.stats.hits++
    return item.value
  }

  async set(key, value, ttl) {
    // Evict oldest items if at capacity
    if (this.cache.size >= this.maxItems) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    
    this.cache.set(key, {
      value,
      expiry: ttl ? Date.now() + (ttl * 1000) : null,
      createdAt: Date.now(),
    })
    this.stats.sets++
    return true
  }

  async del(key) {
    this.stats.deletes++
    return this.cache.delete(key)
  }

  async keys(pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'))
    return Array.from(this.cache.keys()).filter(key => regex.test(key))
  }

  async flushAll() {
    this.cache.clear()
    return true
  }

  async getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxItems: this.maxItems,
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2) + '%'
        : '0%',
    }
  }

  async ping() {
    return 'PONG'
  }

  // Clean expired items
  cleanup() {
    const now = Date.now()
    for (const [key, item] of this.cache.entries()) {
      if (item.expiry && now > item.expiry) {
        this.cache.delete(key)
      }
    }
  }
}

// Cache Service Class
class CacheService {
  constructor() {
    this.client = null
    this.memoryCache = new MemoryCache(CACHE_CONFIG.MAX_MEMORY_ITEMS)
    this.REDIS_COMMAND_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 250)
    this.isRedisConnected = false
    this.useRedis = false
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      invalidations: 0,
    }
    
    // Start cleanup interval for memory cache
    setInterval(() => this.memoryCache.cleanup(), 60000) // Clean every minute
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    const redisUrl = config.REDIS_URL || process.env.REDIS_URL
    
    if (!redisUrl) {
      console.log('📦 Cache: Using in-memory cache (Redis URL not configured)')
      this.useRedis = false
      return
    }

    try {
      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.log('📦 Cache: Max Redis reconnection attempts reached, using memory cache')
              return false
            }
            return Math.min(retries * 100, 3000)
          },
        },
      })

      this.client.on('error', (err) => {
        console.error('📦 Cache Redis Error:', err.message)
        this.isRedisConnected = false
      })

      this.client.on('connect', () => {
        console.log('📦 Cache: Redis connected successfully')
        this.isRedisConnected = true
        this.useRedis = true
      })

      this.client.on('reconnecting', () => {
        console.log('📦 Cache: Redis reconnecting...')
      })

      await this.client.connect()
      this.isRedisConnected = true
      this.useRedis = true
      console.log('📦 Cache: Redis initialization complete')
    } catch (error) {
      console.error('📦 Cache: Redis connection failed:', error.message)
      console.log('📦 Cache: Falling back to in-memory cache')
      this.useRedis = false
    }
  }

  /**
   * Get the active cache client
   */
  getClient() {
    if (this.useRedis && this.isRedisConnected && this.client) {
      return this.client
    }
    return this.memoryCache
  }

  /**
   * Run a Redis operation with a hard timeout so cache issues don't slow API responses.
   */
  async runRedisCommand(commandPromise, timeoutMessage = 'Redis command timeout') {
    return Promise.race([
      commandPromise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(timeoutMessage)), this.REDIS_COMMAND_TIMEOUT_MS)
      }),
    ])
  }

  /**
   * Disable Redis usage and immediately fall back to memory cache.
   */
  fallbackToMemory(reason) {
    if (this.useRedis || this.isRedisConnected) {
      console.warn(`Cache: Falling back to memory cache (${reason})`)
    }
    this.useRedis = false
    this.isRedisConnected = false
  }

  /**
   * Generate cache key with prefix
   */
  generateKey(type, identifier = '') {
    const baseKey = `${CACHE_CONFIG.PREFIX}${type}`
    return identifier ? `${baseKey}:${identifier}` : baseKey
  }

  /**
   * Get cached data
   */
  async get(key) {
    this.stats.totalRequests++
    const fullKey = key.startsWith(CACHE_CONFIG.PREFIX) ? key : `${CACHE_CONFIG.PREFIX}${key}`
    
    try {
      let data
      
      if (this.useRedis && this.isRedisConnected) {
        try {
          const redisValue = await this.runRedisCommand(
            this.client.get(fullKey),
            `Redis GET timeout after ${this.REDIS_COMMAND_TIMEOUT_MS}ms`,
          )
          data = redisValue ? JSON.parse(redisValue) : null
        } catch (redisError) {
          this.fallbackToMemory(redisError.message)
          data = await this.memoryCache.get(fullKey)
        }
      } else {
        const client = this.getClient()
        data = await client.get(fullKey)
      }
      
      if (data) {
        this.stats.cacheHits++
        return data
      }
      
      this.stats.cacheMisses++
      return null
    } catch (error) {
      console.error('📦 Cache Get Error:', error.message)
      this.stats.cacheMisses++
      return null
    }
  }

  /**
   * Set cached data
   */
  async set(key, data, customTtl = null) {
    const fullKey = key.startsWith(CACHE_CONFIG.PREFIX) ? key : `${CACHE_CONFIG.PREFIX}${key}`
    const ttl = customTtl || CACHE_CONFIG.DEFAULT_TTL
    
    try {
      if (this.useRedis && this.isRedisConnected) {
        try {
          await this.runRedisCommand(
            this.client.setEx(fullKey, ttl, JSON.stringify(data)),
            `Redis SET timeout after ${this.REDIS_COMMAND_TIMEOUT_MS}ms`,
          )
        } catch (redisError) {
          this.fallbackToMemory(redisError.message)
          await this.memoryCache.set(fullKey, data, ttl)
        }
      } else {
        const client = this.getClient()
        await client.set(fullKey, data, ttl)
      }
      
      return true
    } catch (error) {
      console.error('📦 Cache Set Error:', error.message)
      return false
    }
  }

  /**
   * Delete specific cache key
   */
  async del(key) {
    const fullKey = key.startsWith(CACHE_CONFIG.PREFIX) ? key : `${CACHE_CONFIG.PREFIX}${key}`
    
    try {
      const client = this.getClient()
      await client.del(fullKey)
      this.stats.invalidations++
      return true
    } catch (error) {
      console.error('📦 Cache Delete Error:', error.message)
      return false
    }
  }

  /**
   * Invalidate cache by pattern (e.g., "products:*" will clear all product caches)
   */
  async invalidatePattern(pattern) {
    const fullPattern = pattern.startsWith(CACHE_CONFIG.PREFIX) 
      ? pattern 
      : `${CACHE_CONFIG.PREFIX}${pattern}`
    
    try {
      const client = this.getClient()
      
      if (this.useRedis && this.isRedisConnected) {
        // Use SCAN for Redis to avoid blocking
        let cursor = 0
        let deletedCount = 0
        
        do {
          const result = await client.scan(cursor, {
            MATCH: fullPattern,
            COUNT: 100,
          })
          cursor = result.cursor
          const keys = result.keys
          
          if (keys.length > 0) {
            await client.del(keys)
            deletedCount += keys.length
          }
        } while (cursor !== 0)
        
        this.stats.invalidations += deletedCount
        console.log(`📦 Cache: Invalidated ${deletedCount} keys matching pattern: ${pattern}`)
        return deletedCount
      } else {
        // In-memory cache
        const keys = await client.keys(fullPattern)
        for (const key of keys) {
          await client.del(key)
        }
        this.stats.invalidations += keys.length
        console.log(`📦 Cache: Invalidated ${keys.length} keys matching pattern: ${pattern}`)
        return keys.length
      }
    } catch (error) {
      console.error('📦 Cache Pattern Invalidation Error:', error.message)
      return 0
    }
  }

  /**
   * Invalidate cache for a specific entity type
   */
  async invalidateEntity(entityType) {
    return this.invalidatePattern(`${entityType}:*`)
  }

  /**
   * Invalidate multiple entity types at once
   */
  async invalidateMultiple(entityTypes) {
    const results = await Promise.all(
      entityTypes.map(type => this.invalidateEntity(type))
    )
    return results.reduce((sum, count) => sum + count, 0)
  }

  /**
   * Clear all cache
   */
  async flushAll() {
    try {
      const client = this.getClient()
      
      if (this.useRedis && this.isRedisConnected) {
        // Only flush keys with our prefix
        const deletedCount = await this.invalidatePattern('*')
        console.log(`📦 Cache: Flushed all cache (${deletedCount} keys)`)
        return deletedCount
      } else {
        await client.flushAll()
        console.log('📦 Cache: Flushed all in-memory cache')
        return true
      }
    } catch (error) {
      console.error('📦 Cache Flush Error:', error.message)
      return false
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    const client = this.getClient()
    const clientStats = await client.getStats?.() || {}
    
    return {
      ...this.stats,
      ...clientStats,
      cacheType: this.useRedis && this.isRedisConnected ? 'Redis' : 'Memory',
      hitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
        ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2) + '%'
        : '0%',
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const client = this.getClient()
      const pong = await client.ping()
      return {
        status: 'healthy',
        cacheType: this.useRedis && this.isRedisConnected ? 'Redis' : 'Memory',
        response: pong,
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      }
    }
  }

  /**
   * Get TTL for entity type
   */
  getTTL(entityType) {
    return CACHE_CONFIG.TTL[entityType] || CACHE_CONFIG.DEFAULT_TTL
  }

  /**
   * Cache wrapper function - automatically handles get/set
   */
  async getOrSet(key, fetchFunction, ttl = null) {
    // Try to get from cache
    const cached = await this.get(key)
    if (cached !== null) {
      return { data: cached, fromCache: true }
    }

    // Fetch fresh data
    const data = await fetchFunction()
    
    // Cache the result
    await this.set(key, data, ttl)
    
    return { data, fromCache: false }
  }
}

// Create singleton instance
const cacheService = new CacheService()

// Entity-specific cache helpers
export const cacheHelpers = {
  // Products
  products: {
    getKey: (params = '') => cacheService.generateKey('products', params),
    getTTL: () => cacheService.getTTL('products'),
    invalidate: () => cacheService.invalidateEntity('products'),
  },
  
  // Categories
  categories: {
    getKey: (params = '') => cacheService.generateKey('categories', params),
    getTTL: () => cacheService.getTTL('categories'),
    invalidate: () => cacheService.invalidateEntity('categories'),
  },
  
  // Brands
  brands: {
    getKey: (params = '') => cacheService.generateKey('brands', params),
    getTTL: () => cacheService.getTTL('brands'),
    invalidate: () => cacheService.invalidateEntity('brands'),
  },
  
  // Banners
  banners: {
    getKey: (params = '') => cacheService.generateKey('banners', params),
    getTTL: () => cacheService.getTTL('banners'),
    invalidate: () => cacheService.invalidateEntity('banners'),
  },
  
  // Banner Cards
  bannerCards: {
    getKey: (params = '') => cacheService.generateKey('bannerCards', params),
    getTTL: () => cacheService.getTTL('banners'),
    invalidate: () => cacheService.invalidateEntity('bannerCards'),
  },
  
  // Settings
  settings: {
    getKey: (params = '') => cacheService.generateKey('settings', params),
    getTTL: () => cacheService.getTTL('settings'),
    invalidate: () => cacheService.invalidateEntity('settings'),
  },
  
  // Home Sections
  homeSections: {
    getKey: (params = '') => cacheService.generateKey('homeSections', params),
    getTTL: () => cacheService.getTTL('homeSections'),
    invalidate: () => cacheService.invalidateEntity('homeSections'),
  },
  
  // Offers
  offers: {
    getKey: (params = '') => cacheService.generateKey('offers', params),
    getTTL: () => cacheService.getTTL('offers'),
    invalidate: () => cacheService.invalidateMultiple(['offers', 'offerPages', 'offerProducts', 'offerBrands', 'offerCategories']),
  },
  
  // Gaming Zone
  gamingZone: {
    getKey: (params = '') => cacheService.generateKey('gamingZone', params),
    getTTL: () => cacheService.getTTL('gamingZone'),
    invalidate: () => cacheService.invalidateMultiple(['gamingZone', 'gamingZonePages', 'gamingZoneCategories', 'gamingZoneBrands']),
  },
  
  // Blogs
  blogs: {
    getKey: (params = '') => cacheService.generateKey('blogs', params),
    getTTL: () => cacheService.getTTL('blogs'),
    invalidate: () => cacheService.invalidateMultiple(['blogs', 'blogCategories', 'blogTopics', 'blogBrands']),
  },
  
  // Colors
  colors: {
    getKey: (params = '') => cacheService.generateKey('colors', params),
    getTTL: () => cacheService.getTTL('colors'),
    invalidate: () => cacheService.invalidateEntity('colors'),
  },
  
  // Sizes
  sizes: {
    getKey: (params = '') => cacheService.generateKey('sizes', params),
    getTTL: () => cacheService.getTTL('sizes'),
    invalidate: () => cacheService.invalidateEntity('sizes'),
  },
  
  // Units
  units: {
    getKey: (params = '') => cacheService.generateKey('units', params),
    getTTL: () => cacheService.getTTL('units'),
    invalidate: () => cacheService.invalidateEntity('units'),
  },
  
  // Volumes
  volumes: {
    getKey: (params = '') => cacheService.generateKey('volumes', params),
    getTTL: () => cacheService.getTTL('volumes'),
    invalidate: () => cacheService.invalidateEntity('volumes'),
  },
  
  // Warranties
  warranties: {
    getKey: (params = '') => cacheService.generateKey('warranties', params),
    getTTL: () => cacheService.getTTL('warranties'),
    invalidate: () => cacheService.invalidateEntity('warranties'),
  },
  
  // Taxes
  taxes: {
    getKey: (params = '') => cacheService.generateKey('taxes', params),
    getTTL: () => cacheService.getTTL('taxes'),
    invalidate: () => cacheService.invalidateEntity('taxes'),
  },
  
  // Delivery Charges
  deliveryCharges: {
    getKey: (params = '') => cacheService.generateKey('deliveryCharges', params),
    getTTL: () => cacheService.getTTL('deliveryCharges'),
    invalidate: () => cacheService.invalidateEntity('deliveryCharges'),
  },
  
  // Coupons
  coupons: {
    getKey: (params = '') => cacheService.generateKey('coupons', params),
    getTTL: () => cacheService.getTTL('coupons'),
    invalidate: () => cacheService.invalidateEntity('coupons'),
  },
  
  // Reviews
  reviews: {
    getKey: (params = '') => cacheService.generateKey('reviews', params),
    getTTL: () => cacheService.getTTL('reviews'),
    invalidate: () => cacheService.invalidateEntity('reviews'),
  },
  
  // SubCategories
  subCategories: {
    getKey: (params = '') => cacheService.generateKey('subCategories', params),
    getTTL: () => cacheService.getTTL('categories'),
    invalidate: () => cacheService.invalidateEntity('subCategories'),
  },
  
  // Custom Slider Items
  customSliderItems: {
    getKey: (params = '') => cacheService.generateKey('customSliderItems', params),
    getTTL: () => cacheService.getTTL('homeSections'),
    invalidate: () => cacheService.invalidateEntity('customSliderItems'),
  },
  
  // Buyer Protection
  buyerProtection: {
    getKey: (params = '') => cacheService.generateKey('buyerProtection', params),
    getTTL: () => cacheService.getTTL('settings'),
    invalidate: () => cacheService.invalidateEntity('buyerProtection'),
  },
}

// Export
export default cacheService
export { CACHE_CONFIG }
