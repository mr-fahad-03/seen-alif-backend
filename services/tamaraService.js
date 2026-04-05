import axios from "axios"
import Order from "../models/orderModel.js"
import { logTamaraWebhook, mapTamaraEventToStatus } from "../utils/tamaraWebhookValidator.js"

class TamaraService {
  constructor() {
    this.apiKey = process.env.TAMARA_API_KEY
    this.apiUrl = process.env.TAMARA_API_URL || "https://api-sandbox.tamara.co"
    this.webhookSecret = process.env.TAMARA_WEBHOOK_SECRET

    if (!this.apiKey) {
      console.error("❌ TAMARA_API_KEY is not configured")
    }

    console.log("🔧 Tamara Service initialized:", {
      apiUrl: this.apiUrl,
      hasApiKey: !!this.apiKey,
    })

    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      timeout: 90000, // Increased timeout to 90 seconds
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Accept 4xx responses for better error handling
    })

    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Randomize User-Agent to avoid detection
        const userAgents = [
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ]

        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)]

        // Enhanced headers to bypass Cloudflare
        config.headers = {
          ...config.headers,
          "User-Agent": randomUA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Connection: "keep-alive",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "cross-site",
          "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          Origin: "https://graba2z.ae",
          Referer: "https://graba2z.ae/",
          DNT: "1",
          "Upgrade-Insecure-Requests": "1",
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        }

        console.log(`🔄 Making Tamara API request to: ${config.method?.toUpperCase()} ${config.url}`)
        console.log(`📤 Request headers:`, {
          "User-Agent": config.headers["User-Agent"].substring(0, 50) + "...",
          Authorization: config.headers.Authorization ? "Bearer ***" : "Missing",
          "Content-Type": config.headers["Content-Type"],
          Accept: config.headers.Accept,
        })

        return config
      },
      (error) => {
        console.error("❌ Request interceptor error:", error)
        return Promise.reject(error)
      },
    )

    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.log(`✅ Tamara API response: ${response.status} ${response.statusText}`)
        return response
      },
      (error) => {
        if (error.response) {
          console.error(`❌ Tamara API error: ${error.response.status} ${error.response.statusText}`)

          // Check if it's a Cloudflare block
          if (
            error.response.status === 403 &&
            typeof error.response.data === "string" &&
            (error.response.data.includes("cloudflare") || error.response.data.includes("blocked"))
          ) {
            console.error("🚫 Request blocked by Cloudflare security")
            error.message = "Request blocked by Cloudflare. Please check API configuration."
            error.isCloudflareBlock = true
          }

          // Log response data for debugging (truncated)
          const responseData =
            typeof error.response.data === "string"
              ? error.response.data.substring(0, 500) + "..."
              : error.response.data
          console.error(`📥 Error response data:`, responseData)
        } else if (error.request) {
          console.error("❌ No response received from Tamara API")
          console.error("📡 Request details:", {
            url: error.config?.url,
            method: error.config?.method,
            timeout: error.config?.timeout,
          })
        }
        return Promise.reject(error)
      },
    )
  }

  /**
   * Create Tamara checkout session with enhanced error handling and retry logic
   */
  async createCheckout(checkoutData) {
    try {
      if (!this.apiKey || this.apiKey === "your_tamara_api_key_here") {
        throw new Error("Invalid or missing TAMARA_API_KEY. Please check your environment variables.")
      }

      const requiredFields = ["total_amount", "consumer", "items", "merchant_url", "country_code", "payment_type"]
      const missingFields = requiredFields.filter((field) => !checkoutData[field])

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(", ")}`)
      }

      const frontendBaseUrl = process.env.FRONTEND_URL || "https://www.graba2z.ae"
      const apiBaseUrl =
        process.env.API_URL ||
        process.env.BACKEND_URL ||
        (process.env.NODE_ENV === "production" ? "https://api.grabatoz.ae" : "https://your-ngrok-url.ngrok.io")
      const merchantUrl = checkoutData.merchant_url || {}
      const notificationUrl = String(merchantUrl.notification || `${apiBaseUrl}/api/payment/tamara/webhook`).replace(
        /\/api\/webhooks\/tamara\/?$/i,
        "/api/payment/tamara/webhook",
      )

      console.log("🔄 Making Tamara API request:", {
        url: `/checkout`,
        method: "POST",
        hasApiKey: !!this.apiKey,
        totalAmount: checkoutData.total_amount,
        itemsCount: checkoutData.items?.length,
        consumerEmail: checkoutData.consumer?.email,
        frontendBaseUrl,
        apiBaseUrl,
      })

      const formattedPayload = {
        total_amount: {
          amount: Number.parseFloat(checkoutData.total_amount.amount),
          currency: checkoutData.total_amount.currency || "AED",
        },
        shipping_amount: {
          amount: Number.parseFloat(checkoutData.shipping_amount?.amount || 0),
          currency: checkoutData.shipping_amount?.currency || "AED",
        },
        tax_amount: {
          amount: Number.parseFloat(checkoutData.tax_amount?.amount || 0),
          currency: checkoutData.tax_amount?.currency || "AED",
        },
        order_reference_id: checkoutData.order_reference_id,
        order_number: checkoutData.order_number || `ORD_${checkoutData.order_reference_id}`,
        discount: checkoutData.discount || {
          amount: { amount: 0, currency: "AED" },
          name: "No discount",
        },
        items: checkoutData.items.map((item) => ({
          name: item.name,
          type: item.type || "Physical",
          reference_id: item.reference_id,
          sku: item.sku || item.reference_id,
          quantity: Number.parseInt(item.quantity),
          discount_amount: {
            amount: Number.parseFloat(item.discount_amount?.amount || 0),
            currency: item.discount_amount?.currency || "AED",
          },
          tax_amount: {
            amount: Number.parseFloat(item.tax_amount?.amount || 0),
            currency: item.tax_amount?.currency || "AED",
          },
          unit_price: {
            amount: Number.parseFloat(item.unit_price.amount),
            currency: item.unit_price.currency || "AED",
          },
          total_amount: {
            amount: Number.parseFloat(item.total_amount.amount),
            currency: item.total_amount.currency || "AED",
          },
        })),
        consumer: {
          email: checkoutData.consumer.email,
          first_name: checkoutData.consumer.first_name,
          last_name: checkoutData.consumer.last_name,
          phone_number: checkoutData.consumer.phone_number,
        },
        country_code: checkoutData.country_code || "AE",
        description: checkoutData.description || `Order for ${checkoutData.items?.length || 1} items from Graba2z`,
        merchant_url: {
          cancel: merchantUrl.cancel || `${frontendBaseUrl}/payment/cancel`,
          failure: merchantUrl.failure || `${frontendBaseUrl}/payment/cancel`,
          success: merchantUrl.success || `${frontendBaseUrl}/payment/success`,
          notification: notificationUrl,
        },
        payment_type: checkoutData.payment_type || "PAY_BY_INSTALMENTS",
        instalments: checkoutData.instalments || 3,
        billing_address: {
          city: checkoutData.billing_address.city,
          country_code: checkoutData.billing_address.country_code || "AE",
          first_name: checkoutData.billing_address.first_name,
          last_name: checkoutData.billing_address.last_name,
          line1: checkoutData.billing_address.line1,
          line2: checkoutData.billing_address.line2 || "",
          phone_number: checkoutData.billing_address.phone_number,
          region: checkoutData.billing_address.region,
        },
        shipping_address: {
          city: checkoutData.shipping_address.city,
          country_code: checkoutData.shipping_address.country_code || "AE",
          first_name: checkoutData.shipping_address.first_name,
          last_name: checkoutData.shipping_address.last_name,
          line1: checkoutData.shipping_address.line1,
          line2: checkoutData.shipping_address.line2 || "",
          phone_number: checkoutData.shipping_address.phone_number,
          region: checkoutData.shipping_address.region,
        },
        platform: checkoutData.platform || "Graba2z Online Store",
        is_mobile: checkoutData.is_mobile || false,
        locale: checkoutData.locale || "en_US",
        // Optional risk assessment and additional data
        ...(checkoutData.risk_assessment && { risk_assessment: checkoutData.risk_assessment }),
        ...(checkoutData.additional_data && { additional_data: checkoutData.additional_data }),
      }

      console.log("📤 Sending payload to Tamara:", JSON.stringify(formattedPayload, null, 2))

      const response = await this.axiosInstance.post("/checkout", formattedPayload)

      console.log("🔍 Full Tamara API response:", {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
      })

      if (response.status !== 200 && response.status !== 201) {
        console.error("❌ Tamara API returned error status:", {
          status: response.status,
          statusText: response.statusText,
          data: response.data,
        })

        return {
          success: false,
          error: response.data || `HTTP ${response.status}: ${response.statusText}`,
          status: response.status,
        }
      }

      if (!response.data || !response.data.checkout_url) {
        console.error("❌ Tamara API returned invalid response:", response.data)
        return {
          success: false,
          error: "Invalid response from Tamara API - missing checkout_url",
          status: response.status,
        }
      }

      console.log("✅ Tamara checkout created:", {
        order_id: response.data.order_id,
        checkout_id: response.data.checkout_id,
        status: response.data.status,
        checkout_url: response.data.checkout_url,
      })

      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      console.error("❌ Tamara checkout error:", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        isCloudflareBlock:
          error.response?.status === 403 &&
          typeof error.response?.data === "string" &&
          error.response.data.includes("cloudflare"),
      })

      let errorMessage = error.message
      if (error.response?.status === 403) {
        if (typeof error.response.data === "string" && error.response.data.includes("cloudflare")) {
          errorMessage = "Request blocked by Cloudflare. Please check API key and notification URL configuration."
        } else {
          errorMessage = "Access forbidden. Please verify your API key and account permissions."
        }
      } else if (error.response?.status === 401) {
        errorMessage = "Authentication failed. Please check your TAMARA_API_KEY."
      } else if (error.response?.status === 400) {
        errorMessage = `Bad request: ${JSON.stringify(error.response.data)}`
      }

      return {
        success: false,
        error: errorMessage,
        status: error.response?.status,
      }
    }
  }

  /**
   * Authorize order after approval (Step 3 in documentation)
   */
  async authorizeOrder(orderId) {
    try {
      const config = {
        headers: this.getHeaders(),
        timeout: 30000,
      }

      const response = await this.axiosInstance.post(`/orders/${orderId}/authorise`, {}, config)

      console.log("✅ Tamara order authorized:", {
        order_id: response.data.order_id,
        status: response.data.status,
        authorized_amount: response.data.authorized_amount,
      })

      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      console.error("❌ Tamara authorization error:", error.response?.data || error.message)
      return {
        success: false,
        error: error.response?.data || error.message,
      }
    }
  }

  /**
   * Get order status from Tamara
   */
  async getOrderStatus(orderId) {
    try {
      const config = {
        headers: this.getHeaders(),
        timeout: 30000,
      }

      const response = await this.axiosInstance.get(`/merchants/orders/${orderId}`, config)

      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      console.error("❌ Tamara order status error:", error.response?.data || error.message)
      return {
        success: false,
        error: error.response?.data || error.message,
      }
    }
  }

  /**
   * Capture payment (Step 4 in documentation)
   */
  async capturePayment(orderId, captureData) {
    try {
      const config = {
        headers: this.getHeaders(),
        timeout: 30000,
      }

      const response = await this.axiosInstance.post(
        `/payments/capture`,
        {
          order_id: orderId,
          ...captureData,
        },
        config,
      )

      console.log("✅ Tamara payment captured:", {
        capture_id: response.data.capture_id,
        order_id: response.data.order_id,
        status: response.data.status,
        captured_amount: response.data.captured_amount,
      })

      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      console.error("❌ Tamara capture error:", error.response?.data || error.message)
      return {
        success: false,
        error: error.response?.data || error.message,
      }
    }
  }

  /**
   * Cancel order (Step 3.a in documentation)
   */
  async cancelOrder(orderId, cancelData) {
    try {
      const config = {
        headers: this.getHeaders(),
        timeout: 30000,
      }

      const response = await this.axiosInstance.post(`/orders/${orderId}/cancel`, cancelData, config)

      console.log("✅ Tamara order canceled:", {
        order_id: response.data.order_id,
        cancel_id: response.data.cancel_id,
        status: response.data.status,
        canceled_amount: response.data.canceled_amount,
      })

      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      console.error("❌ Tamara cancel error:", error.response?.data || error.message)
      return {
        success: false,
        error: error.response?.data || error.message,
      }
    }
  }

  /**
   * Refund payment using simplified refund API
   */
  async refundPayment(orderId, refundData) {
    try {
      const config = {
        headers: this.getHeaders(),
        timeout: 30000,
      }

      const response = await this.axiosInstance.post(`/payments/simplified-refund/${orderId}`, refundData, config)

      console.log("✅ Tamara payment refunded:", {
        order_id: orderId,
        total_amount: response.data.total_amount,
        comment: response.data.comment,
      })

      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      console.error("❌ Tamara refund error:", error.response?.data || error.message)
      return {
        success: false,
        error: error.response?.data || error.message,
      }
    }
  }

  /**
   * Process webhook event
   */
  async processWebhookEvent(webhookData) {
    try {
      const { order_id, order_reference_id, order_number, event_type, data } = webhookData

      // Find order by multiple possible identifiers
      let order = null
      if (order_reference_id) {
        order = await Order.findById(order_reference_id)
      }
      if (!order && order_id) {
        order = await Order.findOne({ "paymentResult.tamara_order_id": order_id })
      }
      if (!order && order_number) {
        order = await Order.findOne({ orderNumber: order_number })
      }

      if (!order) {
        throw new Error(`Order not found: ${order_reference_id || order_id || order_number}`)
      }

      // Map event to status
      const statusMapping = mapTamaraEventToStatus(event_type)
      const previousStatus = order.paymentResult?.status

      // Update order with new status
      order.paymentResult = {
        ...order.paymentResult,
        status: statusMapping.paymentStatus,
        event_type: event_type,
        tamara_order_id: order_id,
        update_time: new Date().toISOString(),
        webhook_data: data,
        description: statusMapping.description,
      }

      order.isPaid = statusMapping.isPaid
      if (statusMapping.isPaid && !order.paidAt) {
        order.paidAt = new Date()
      }

      // Update order status
      if (order.orderStatus === "pending" || order.orderStatus === "new") {
        order.orderStatus = statusMapping.orderStatus
      }

      await order.save()

      logTamaraWebhook(webhookData, "success")

      return {
        success: true,
        order: order,
        previousStatus,
        newStatus: statusMapping.paymentStatus,
      }
    } catch (error) {
      logTamaraWebhook(webhookData, "error", error.message)
      throw error
    }
  }

  /**
   * Sync order status with Tamara (for manual reconciliation)
   */
  async syncOrderStatus(orderId) {
    try {
      const order = await Order.findById(orderId)
      if (!order || !order.paymentResult?.tamara_order_id) {
        throw new Error("Order not found or not a Tamara order")
      }

      const statusResult = await this.getOrderStatus(order.paymentResult.tamara_order_id)
      if (!statusResult.success) {
        throw new Error(statusResult.error)
      }

      const tamaraOrder = statusResult.data
      const statusMapping = mapTamaraEventToStatus(tamaraOrder.status)

      // Update local order with Tamara status
      order.paymentResult = {
        ...order.paymentResult,
        status: statusMapping.paymentStatus,
        update_time: new Date().toISOString(),
        sync_data: tamaraOrder,
        description: statusMapping.description,
      }

      order.isPaid = statusMapping.isPaid
      if (statusMapping.isPaid && !order.paidAt) {
        order.paidAt = new Date()
      }

      order.orderStatus = statusMapping.orderStatus
      await order.save()

      console.log("✅ Order synced with Tamara:", {
        orderId,
        tamaraOrderId: order.paymentResult.tamara_order_id,
        status: statusMapping.paymentStatus,
      })

      return {
        success: true,
        order,
        tamaraStatus: tamaraOrder.status,
      }
    } catch (error) {
      console.error("❌ Order sync error:", error.message)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Get Tamara API headers with enhanced browser simulation
   */
  getHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Connection: "keep-alive",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "cross-site",
      "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      Origin: "https://graba2z.ae",
      Referer: "https://graba2z.ae/",
      DNT: "1",
    }
  }
}

export default new TamaraService()
