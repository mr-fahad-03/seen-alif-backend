import ActivityLog from "../models/activityLogModel.js"

/**
 * Middleware to check if user has specific permission
 * @param {string} permission - The permission key to check
 */
export const checkPermission = (permission) => {
  return async (req, res, next) => {
    try {
      const user = req.user

      if (!user) {
        return res.status(401).json({ message: "Not authorized" })
      }

      // Super Admin has full access to everything
      if (user.isSuperAdmin) {
        return next()
      }

      // Check if user is admin
      if (!user.isAdmin) {
        return res.status(403).json({ message: "Access denied - Admin privileges required" })
      }

      // If user has full access permission
      if (user.adminPermissions?.fullAccess) {
        return next()
      }

      // Check specific permission
      if (user.adminPermissions && user.adminPermissions[permission]) {
        return next()
      }

      // Access denied
      console.log(`❌ Permission denied for user ${user.email} - Missing permission: ${permission}`)
      return res.status(403).json({
        message: `Access denied - You don't have permission to access this resource`,
        requiredPermission: permission,
      })
    } catch (error) {
      console.error("Permission check error:", error)
      res.status(500).json({ message: "Server error in permission verification" })
    }
  }
}

/**
 * Middleware to check if user is Super Admin
 */
export const superAdmin = (req, res, next) => {
  try {
    console.log("👑 Super Admin check for user:", req.user?.email)

    if (req.user && req.user.isSuperAdmin === true) {
      console.log("✅ Super Admin access granted")
      next()
    } else {
      console.log("❌ Super Admin access denied")
      res.status(403).json({ message: "Access denied - Super Admin privileges required" })
    }
  } catch (error) {
    console.error("❌ Super Admin check error:", error)
    res.status(500).json({ message: "Server error in super admin verification" })
  }
}

/**
 * Helper function to get real IP address from request
 * @param {Object} req - Express request object
 */
const getClientIp = (req) => {
  if (!req) return "unknown"
  
  // Check various headers for IP address (in order of reliability)
  const forwardedFor = req.headers["x-forwarded-for"]
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one (original client)
    const ips = forwardedFor.split(",").map(ip => ip.trim())
    return ips[0]
  }
  
  // Check other common headers
  const realIp = req.headers["x-real-ip"]
  if (realIp) return realIp
  
  const cfConnectingIp = req.headers["cf-connecting-ip"] // Cloudflare
  if (cfConnectingIp) return cfConnectingIp
  
  const trueClientIp = req.headers["true-client-ip"] // Akamai and Cloudflare
  if (trueClientIp) return trueClientIp
  
  // Fallback to connection info
  const socketRemoteAddress = req.socket?.remoteAddress
  if (socketRemoteAddress) {
    // Handle IPv6 mapped IPv4 addresses (::ffff:127.0.0.1)
    if (socketRemoteAddress.startsWith("::ffff:")) {
      return socketRemoteAddress.substring(7)
    }
    return socketRemoteAddress
  }
  
  // Legacy fallbacks
  if (req.connection?.remoteAddress) return req.connection.remoteAddress
  if (req.ip) return req.ip
  
  return "unknown"
}

/**
 * Helper function to log activity
 * @param {Object} params - Activity log parameters
 */
export const logActivity = async ({
  user,
  action,
  module,
  description,
  targetId = null,
  targetName = null,
  previousData = null,
  newData = null,
  req = null,
}) => {
  try {
    const ipAddress = getClientIp(req)
    
    const logEntry = new ActivityLog({
      user: user._id,
      userName: user.name,
      userEmail: user.email,
      action,
      module,
      description,
      targetId,
      targetName,
      previousData,
      newData,
      ipAddress,
      userAgent: req?.get("User-Agent") || req?.headers?.["user-agent"] || "unknown",
    })

    await logEntry.save()
    console.log(`📝 Activity logged: ${action} on ${module} by ${user.email}`)
  } catch (error) {
    console.error("Failed to log activity:", error)
    // Don't throw - logging failure shouldn't break the main operation
  }
}

/**
 * Middleware to automatically log admin actions
 * Use this after protect and admin middleware
 */
export const activityLogger = (action, module, descriptionFn) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res)

    res.json = async (data) => {
      // Only log successful responses (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        try {
          const description = typeof descriptionFn === "function" ? descriptionFn(req, data) : descriptionFn

          await logActivity({
            user: req.user,
            action,
            module,
            description,
            targetId: req.params.id || data?._id || null,
            targetName: data?.name || data?.title || null,
            previousData: req.previousData || null,
            newData: req.body || null,
            req,
          })
        } catch (error) {
          console.error("Activity logging failed:", error)
        }
      }

      return originalJson(data)
    }

    next()
  }
}
