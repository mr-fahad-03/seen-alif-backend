import jwt from "jsonwebtoken"
import User from "../models/userModel.js"

// Protect routes
export const protect = async (req, res, next) => {
  let token

  try {
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1]
      console.log("🔐 Raw token received:", token ? `${token.substring(0, 20)}...` : "Missing")

      // Check if token is properly formatted
      if (!token || token === "null" || token === "undefined") {
        console.log("❌ Invalid token format")
        return res.status(401).json({ message: "Not authorized, invalid token format" })
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      console.log("✅ Token decoded successfully, user ID:", decoded.id)

      // Find user with admin permissions
      req.user = await User.findById(decoded.id).select("-password")

      if (!req.user) {
        console.log("❌ User not found with ID:", decoded.id)
        return res.status(401).json({ message: "Not authorized, user not found" })
      }

      console.log("✅ User authenticated:", req.user.email, "isAdmin:", req.user.isAdmin, "isSuperAdmin:", req.user.isSuperAdmin)
      next()
    } else {
      console.log("❌ No authorization header found")
      console.log("Available headers:", Object.keys(req.headers))
      res.status(401).json({ message: "Not authorized, no token provided" })
    }
  } catch (error) {
    console.error("❌ Auth error details:", {
      message: error.message,
      name: error.name,
      token: token ? `${token.substring(0, 20)}...` : "No token",
    })

    if (error.name === "JsonWebTokenError") {
      res.status(401).json({ message: "Not authorized, invalid token" })
    } else if (error.name === "TokenExpiredError") {
      res.status(401).json({ message: "Not authorized, token expired" })
    } else {
      res.status(401).json({ message: "Not authorized, token verification failed" })
    }
  }
}

// Admin middleware
export const admin = (req, res, next) => {
  try {
    console.log("👑 Admin check for user:", req.user?.email)
    console.log("👑 User isAdmin:", req.user?.isAdmin, "isSuperAdmin:", req.user?.isSuperAdmin)

    if (req.user && (req.user.isAdmin === true || req.user.isSuperAdmin === true)) {
      console.log("✅ Admin access granted")
      next()
    } else {
      console.log("❌ Admin access denied - not an admin user")
      res.status(403).json({ message: "Access denied - Admin privileges required" })
    }
  } catch (error) {
    console.error("❌ Admin check error:", error)
    res.status(500).json({ message: "Server error in admin verification" })
  }
}
