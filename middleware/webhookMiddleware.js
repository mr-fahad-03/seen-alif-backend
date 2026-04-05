/**
 * Middleware to capture raw body for webhook signature validation
 * This must be applied before express.json() middleware
 */
export const captureRawBody = (req, res, next) => {
  if (req.path.includes("/webhook")) {
    let data = ""
    req.setEncoding("utf8")

    req.on("data", (chunk) => {
      data += chunk
    })

    req.on("end", () => {
      req.rawBody = data
      try {
        req.body = JSON.parse(data)
      } catch (error) {
        console.error("Error parsing webhook JSON:", error)
        return res.status(400).json({ error: "Invalid JSON" })
      }
      next()
    })
  } else {
    next()
  }
}

/**
 * Rate limiting middleware for webhooks to prevent abuse
 */
export const webhookRateLimit = (req, res, next) => {
  // Simple in-memory rate limiting (in production, use Redis)
  const ip = req.ip || req.connection.remoteAddress
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute
  const maxRequests = 100 // Max 100 requests per minute per IP

  if (!global.webhookRateLimit) {
    global.webhookRateLimit = new Map()
  }

  const requests = global.webhookRateLimit.get(ip) || []
  const validRequests = requests.filter((time) => now - time < windowMs)

  if (validRequests.length >= maxRequests) {
    return res.status(429).json({
      error: "Too many webhook requests",
      retryAfter: Math.ceil(windowMs / 1000),
    })
  }

  validRequests.push(now)
  global.webhookRateLimit.set(ip, validRequests)

  next()
}

/**
 * Webhook authentication middleware
 */
export const authenticateWebhook = (req, res, next) => {
  const authHeader = req.headers.authorization
  const expectedToken = process.env.WEBHOOK_AUTH_TOKEN

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ error: "Unauthorized webhook request" })
  }

  next()
}

const webhookMiddleware = {
  captureRawBody,
  webhookRateLimit,
  authenticateWebhook,
}

export default webhookMiddleware
