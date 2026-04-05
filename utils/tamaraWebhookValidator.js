import crypto from "crypto"

/**
 * Validates Tamara webhook signature
 * @param {string} payload - Raw request body as string
 * @param {string} signature - X-Tamara-Signature header value
 * @param {string} secret - Tamara webhook secret
 * @returns {boolean} - True if signature is valid
 */
export const validateTamaraWebhook = (payload, signature, secret) => {
  if (!secret || !signature) {
    return false
  }

  try {
    const expectedSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex")

    return signature === expectedSignature
  } catch (error) {
    console.error("Error validating Tamara webhook signature:", error)
    return false
  }
}

/**
 * Maps Tamara event types to internal order statuses
 * @param {string} eventType - Tamara event type
 * @returns {object} - Status mapping object
 */
export const mapTamaraEventToStatus = (eventType) => {
  const statusMap = {
    order_approved: {
      paymentStatus: "approved",
      isPaid: true,
      orderStatus: "confirmed",
      description: "Payment approved by Tamara",
    },
    order_declined: {
      paymentStatus: "declined",
      isPaid: false,
      orderStatus: "cancelled",
      description: "Payment declined by Tamara",
    },
    order_expired: {
      paymentStatus: "expired",
      isPaid: false,
      orderStatus: "cancelled",
      description: "Payment session expired",
    },
    order_canceled: {
      paymentStatus: "canceled",
      isPaid: false,
      orderStatus: "cancelled",
      description: "Payment cancelled by customer",
    },
    order_authorised: {
      paymentStatus: "authorised",
      isPaid: true,
      orderStatus: "confirmed",
      description: "Payment authorised by Tamara",
    },
    order_captured: {
      paymentStatus: "fully_captured",
      isPaid: true,
      orderStatus: "processing",
      description: "Payment captured successfully",
    },
    order_refunded: {
      paymentStatus: "refunded",
      isPaid: false,
      orderStatus: "refunded",
      description: "Payment refunded",
    },
  }

  return (
    statusMap[eventType] || {
      paymentStatus: eventType,
      isPaid: false,
      orderStatus: "pending",
      description: `Unknown event: ${eventType}`,
    }
  )
}

/**
 * Logs Tamara webhook events for debugging and audit
 * @param {object} webhookData - Webhook payload data
 * @param {string} status - Processing status (success/error)
 * @param {string} error - Error message if any
 */
export const logTamaraWebhook = (webhookData, status, error = null) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event_type: webhookData.event_type,
    order_id: webhookData.order_id,
    order_reference_id: webhookData.order_reference_id,
    status,
    error,
    data: webhookData,
  }

  if (status === "success") {
    console.log("✅ Tamara webhook processed successfully:", logEntry)
  } else {
    console.error("❌ Tamara webhook processing failed:", logEntry)
  }

  // In production, you might want to store these logs in a database
  // or send them to a logging service like Winston, Loggly, etc.
}
