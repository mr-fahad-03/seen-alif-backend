import nodemailer from "nodemailer"

// Helper to ensure image URLs are absolute for email clients
const toAbsoluteUrl = (src) => {
  if (!src) return "https://via.placeholder.com/56?text=No+Image"
  const s = String(src)
  if (s.startsWith("http://") || s.startsWith("https://")) return s
  if (s.startsWith("//")) return `https:${s}`
  // prefer explicit public/base URLs if provided
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.SERVER_PUBLIC_URL ||
    process.env.API_BASE_URL ||
    process.env.FRONTEND_URL ||
    "https://www.graba2z.ae"
  if (s.startsWith("/")) return `${base}${s}`
  // otherwise treat as uploads path
  return `${base}/uploads/${s}`
}

// Create transporters for order and support emails
const orderTransporter = nodemailer.createTransport({
  host: process.env.ORDER_EMAIL_HOST,
  port: Number(process.env.ORDER_EMAIL_PORT),
  secure: process.env.ORDER_EMAIL_SECURE === "true",
  auth: {
    user: process.env.ORDER_EMAIL_USER,
    pass: process.env.ORDER_EMAIL_PASS,
  },
})

const supportTransporter = nodemailer.createTransport({
  host: process.env.SUPPORT_EMAIL_HOST,
  port: Number(process.env.SUPPORT_EMAIL_PORT),
  secure: process.env.SUPPORT_EMAIL_SECURE === "true",
  auth: {
    user: process.env.SUPPORT_EMAIL_USER,
    pass: process.env.SUPPORT_EMAIL_PASS,
  },
})

const ORDER_NOTIFICATION_EMAIL = (process.env.ORDER_NOTIFICATION_EMAIL || "order@grabatoz.ae").trim()

const getOrderEmailRecipients = (customerEmail, includeCustomer = true) => {
  const candidates = []

  if (includeCustomer && customerEmail) {
    candidates.push(String(customerEmail).trim())
  }

  if (ORDER_NOTIFICATION_EMAIL) {
    candidates.push(ORDER_NOTIFICATION_EMAIL)
  }

  const uniqueRecipients = []
  for (const recipient of candidates) {
    if (!recipient) continue
    const exists = uniqueRecipients.some((email) => email.toLowerCase() === recipient.toLowerCase())
    if (!exists) uniqueRecipients.push(recipient)
  }

  return uniqueRecipients
}

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const formatCurrency = (value) => `${(Number(value) || 0).toFixed(2)} AED`

const formatDateTime = (value) => {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "N/A"
  return date.toLocaleString("en-AE", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const formatDeliveryType = (deliveryType) => (deliveryType === "pickup" ? "Store Pickup" : "Home Delivery")

const formatPaymentMethod = (actualPaymentMethod, paymentMethod) => {
  const method = (actualPaymentMethod || paymentMethod || "").toString().trim().toLowerCase()
  switch (method) {
    case "tabby":
      return "Tabby"
    case "tamara":
      return "Tamara"
    case "card":
      return "Card"
    case "cod":
    case "cash on delivery":
      return "Cash on Delivery"
    default:
      return paymentMethod || actualPaymentMethod || "N/A"
  }
}

// Helper to select transporter and from address
const getMailConfig = (type) => {
  if (type === "order") {
    return {
      transporter: orderTransporter,
      from: `Graba2z Orders <${process.env.ORDER_EMAIL_USER}>`,
    }
  } else {
    return {
      transporter: supportTransporter,
      from: `Graba2z Support <${process.env.SUPPORT_EMAIL_USER}>`,
    }
  }
}

// Email templates
const getEmailTemplate = (type, data) => {
  const baseStyle = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; 
        line-height: 1.6; 
        color: #333; 
        background-color: #f5f5f5; 
        margin: 0; 
        padding: 20px;
      }
      .email-container { 
        max-width: 600px; 
        margin: 0 auto; 
        background-color: #ffffff; 
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      }
      .header { 
        background-color: #ffffff; 
        padding: 30px 20px 20px; 
        text-align: center; 
        border-bottom: 1px solid #eee;
      }
      .logo { 
        max-width: 200px; 
        height: auto; 
        margin-bottom: 20px;
      }
      .order-icon {
        width: 80px;
        height: 80px;
        background-color: #2c3e50;
        border-radius: 50%;
        margin: 20px auto;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 30px;
      }
      .content { 
        padding: 30px 20px; 
        background-color: #ffffff;
      }
      .order-number {
        font-size: 24px;
        font-weight: bold;
        color: #333;
        text-align: center;
        margin-bottom: 20px;
      }
      .greeting {
        font-size: 18px;
        text-align: center;
        margin-bottom: 10px;
        color: #333;
      }
      .processing-text {
        font-size: 16px;
        text-align: center;
        color: #666;
        margin-bottom: 30px;
      }
      .action-buttons {
        text-align: center;
        margin: 30px 0;
      }
      .button {
        display: inline-block;
        background-color: #8BC34A;
        color: white;
        padding: 15px 30px;
        text-decoration: none;
        border-radius: 25px;
        font-weight: bold;
        font-size: 14px;
        margin: 5px 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .button:hover {
        background-color: #7CB342;
      }
      .product-section {
        margin: 30px 0;
        padding: 20px;
        background-color: #f9f9f9;
        border-radius: 8px;
      }
      .product-item {
        display: flex;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 20px;
        border-bottom: 1px solid #eee;
      }
      .product-item:last-child {
        border-bottom: none;
        margin-bottom: 0;
        padding-bottom: 0;
      }
      .product-image {
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 8px;
        margin-right: 15px;
        background-color: #f0f0f0;
      }
      .product-details {
        flex: 1;
      }
      .product-name {
        font-weight: bold;
        font-size: 16px;
        color: #333;
        margin-bottom: 5px;
        line-height: 1.4;
      }
      .product-quantity {
        color: #666;
        font-size: 14px;
        margin-bottom: 5px;
      }
      .product-price {
        font-weight: bold;
        color: #8BC34A;
        font-size: 16px;
      }
      .order-summary {
        background-color: #f9f9f9;
        padding: 20px;
        border-radius: 8px;
        margin: 20px 0;
      }
      .summary-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
        font-size: 16px;
      }
      .summary-row.total {
        font-weight: bold;
        font-size: 18px;
        color: #333;
        border-top: 1px solid #ddd;
        padding-top: 10px;
        margin-top: 15px;
      }
      .vat-note {
        font-size: 14px;
        color: #666;
        text-align: right;
        margin-top: 5px;
      }
      .info-section {
        margin: 20px 0;
      }
      .info-title {
        font-weight: bold;
        font-size: 18px;
        color: #333;
        margin-bottom: 15px;
      }
      .info-content {
        background-color: #f9f9f9;
        padding: 15px;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.6;
      }
      .address-section {
        display: flex;
        gap: 20px;
        margin: 20px 0;
      }
      .address-block {
        flex: 1;
      }
      .footer {
        background-color: #8BC34A;
        color: white;
        padding: 30px 20px;
        text-align: center;
      }
      .footer h3 {
        margin-bottom: 20px;
        font-size: 20px;
      }
      .social-icons {
        margin: 20px 0;
      }
      .social-icon {
        display: inline-block;
        width: 40px;
        height: 40px;
        background-color: white;
        border-radius: 50%;
        margin: 0 10px;
        line-height: 40px;
        text-decoration: none;
        color: #8BC34A;
        font-weight: bold;
      }
      .contact-info {
        margin-top: 20px;
        font-size: 14px;
      }
      .contact-info a {
        color: white;
        text-decoration: underline;
      }
      @media (max-width: 600px) {
        .email-container { margin: 0; border-radius: 0; }
        .content { padding: 20px 15px; }
        .address-section { flex-direction: column; }
        .product-item { flex-direction: column; text-align: center; }
        .product-image { margin: 0 auto 15px; }
        .button { display: block; margin: 10px 0; }
      }
    </style>
  `

  switch (type) {
    case "emailVerification":
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Email Verification</title>
          <style>
            body {
              background-color: #e8f7ee;
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 32px auto;
              background-color: #ffffff;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 24px rgba(0,0,0,0.08);
              border: 1px solid #e0e0e0;
            }
            .header {
              background-color: #fff;
              padding: 32px 0 16px 0;
              text-align: center;
              border-bottom: 1px solid #e0e0e0;
            }
            .header a {
              display: inline-block;
            }
            .header img {
              max-height: 60px;
            }
            .content {
              padding: 40px 30px 32px 30px;
              text-align: center;
            }
            .content h2 {
              color: #222;
              font-size: 1.5rem;
              margin-bottom: 0.5em;
            }
            .content p {
              color: #444;
              font-size: 1.1rem;
              margin: 0.5em 0 1.5em 0;
            }
            .code-box {
              background: #f4f4f4;
              border-radius: 10px;
              margin: 32px auto 24px auto;
              padding: 24px 0;
              font-size: 2.2rem;
              font-weight: bold;
              color: #1abc7b;
              letter-spacing: 10px;
              max-width: 320px;
            }
            .copy-btn {
              display: inline-block;
              background: #1abc7b;
              color: #fff;
              font-weight: 600;
              padding: 16px 40px;
              border-radius: 8px;
              text-decoration: none;
              font-size: 1.1rem;
              margin: 24px 0 0 0;
              transition: background 0.2s;
              cursor: pointer;
            }
            .copy-btn:hover {
              background: #159c65;
            }
            .footer {
              background-color: #e8f7ee;
              padding: 32px 20px 20px 20px;
              text-align: center;
              font-size: 13px;
              color: #888;
            }
            .footer .socials {
              margin: 18px 0 10px 0;
            }
            .footer .socials a {
              display: inline-block;
              margin: 0 10px;
              text-decoration: none;
            }
            .footer .socials img {
              width: 32px;
              height: 32px;
              vertical-align: middle;
              border-radius: 50%;
              background: #fff;
              box-shadow: 0 2px 8px rgba(0,0,0,0.04);
              transition: box-shadow 0.2s;
            }
            .footer .socials img:hover {
              box-shadow: 0 4px 16px rgba(26,188,123,0.15);
            }
            @media (max-width: 600px) {
              .container { border-radius: 0; margin: 0; }
              .content { padding: 24px 8px 24px 8px; }
              .footer { padding: 24px 4px 12px 4px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <a href="https://www.graba2z.ae/" target="_blank">
                <img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753105567/admin-logo_ruxcjj.png" alt="Graba2z Logo" />
              </a>
            </div>
            <div class="content">
              <h2>Email Verification</h2>
              <p>Hi <b>${data.name || "User"}</b>,<br />
              Thank you for registering with Graba2z. Please verify your email address by entering the verification code below:</p>
              <div class="code-box">${data.code || "000000"}</div>
              <p style="margin: 16px 0 0 0; color: #1abc7b; font-weight: bold;">
                Copy the code above and paste it on the website to verify your email.
              </p>
              <p style="margin-top: 2em; color: #888; font-size: 1em;">This code will expire in 10 minutes.<br />If you didn't create an account with us, please ignore this email.</p>
            </div>
            <div class="footer">
              <div class="socials">
                <a href="https://www.facebook.com/grabatozae/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_1_axvzvv.jpg" alt="Facebook" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.instagram.com/grabatoz/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107124/WhatsApp_Image_2025-07-21_at_7.10.18_AM_xgjv5f.jpg" alt="Instagram" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://x.com/GrabAtoz" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107545/WhatsApp_Image_2025-07-21_at_7.10.18_AM_2_cwzjg6.png" alt="X" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.linkedin.com/company/grabatozae" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_3_ll6y2i.jpg" alt="LinkedIn" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
              </div>
              <p>This email was sent by: support@grabatoz.ae</p>
              <br/>
              <p>Kindly Do Not Reply to this Email</p>
              <br/>
              <div style="margin-top: 10px; color: #888;">
                &copy; 2025 Graba2z. All rights reserved.<br />
                <span style="font-size:12px;">If you did not enter this email address when signing up for Graba2z, disregard this message.</span>
              </div>
            </div>
          </div>
        </body>
        </html>
      `

    case "orderConfirmation":
      const orderItems = Array.isArray(data.orderItems) ? data.orderItems : []
      const orderItemsHtml = orderItems
        .map(
          (item) => `
        <div class="product-item">
          <img src="${toAbsoluteUrl(item.product?.image || item.image)}" alt="${item.product?.name || item.name || "Product"}" class="product-image" />
          <div class="product-details">
            <div class="product-name">${item.product?.name || item.name || "Product"}</div>
            <div class="product-quantity">Quantity: ${item.quantity || 1}</div>
            <div class="product-price">${(item.price || 0).toFixed(2)}AED</div>
          </div>
        </div>
      `,
        )
        .join("")

      const subtotal = data.itemsPrice || 0
      const shipping = data.shippingPrice || 0
      const total = data.totalPrice || 0
      const vatAmount = (total * 0.05).toFixed(2) // Assuming 5% VAT

      // Get customer info - works for both guest and logged-in users
      const customerName = data.shippingAddress?.name || data.pickupDetails?.name || data.customerName || "Customer"
      const customerEmail = data.shippingAddress?.email || data.pickupDetails?.email || data.customerEmail || ""
      const customerPhone = data.shippingAddress?.phone || data.pickupDetails?.phone || ""

      // Determine payment method display
      const paymentMethodDisplay = data.paymentMethod || (data.paymentResult?.method) || "Cash on Delivery"

      // Billing and Shipping addresses - handle both guest and logged-in users
      const billingAddress = data.shippingAddress || data.pickupDetails || {}
      const shippingAddress = data.deliveryType === "pickup" ? data.pickupDetails : data.shippingAddress

      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Order Confirmation</title>
          <style>
            body {
              background-color: #e8f7ee;
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 32px auto;
              background-color: #ffffff;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 24px rgba(0,0,0,0.08);
              border: 1px solid #e0e0e0;
            }
            .header {
              background-color: #fff;
              padding: 32px 0 16px 0;
              text-align: center;
              border-bottom: 1px solid #e0e0e0;
            }
            .header a {
              display: inline-block;
            }
            .header img {
              max-height: 60px;
            }
            .order-icon {
              width: 80px;
              height: 80px;
              background-color: #8BC34A;
              border-radius: 50%;
              margin: 20px auto 0 auto;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 30px;
              line-height: 1;
            }
            .content {
              padding: 40px 30px 32px 30px;
              background: #fff;
            }
            .order-number {
              font-size: 24px;
              font-weight: bold;
              color: #333;
              text-align: center;
              margin-bottom: 20px;
            }
            .greeting {
              font-size: 18px;
              text-align: center;
              margin-bottom: 10px;
              color: #333;
            }
            .processing-text {
              font-size: 16px;
              text-align: center;
              color: #666;
              margin-bottom: 30px;
            }
            .action-buttons {
              text-align: center;
              margin: 30px 0;
            }
            .button {
              display: inline-block;
              background-color: #8BC34A;
              color: white;
              padding: 15px 30px;
              text-decoration: none;
              border-radius: 25px;
              font-weight: bold;
              font-size: 14px;
              margin: 5px 10px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .button:hover {
              background-color: #7CB342;
            }
            .product-section {
              margin: 30px 0;
              padding: 20px;
              background-color: #f9f9f9;
              border-radius: 8px;
            }
            .product-item {
              display: flex;
              align-items: center;
              margin-bottom: 20px;
              padding-bottom: 20px;
              border-bottom: 1px solid #eee;
            }
            .product-item:last-child {
              border-bottom: none;
              margin-bottom: 0;
              padding-bottom: 0;
            }
            .product-image {
              width: 80px;
              height: 80px;
              object-fit: cover;
              border-radius: 8px;
              margin-right: 15px;
              background-color: #f0f0f0;
            }
            .product-details {
              flex: 1;
            }
            .product-name {
              font-weight: bold;
              font-size: 16px;
              color: #333;
              margin-bottom: 5px;
              line-height: 1.4;
            }
            .product-quantity {
              color: #666;
              font-size: 14px;
              margin-bottom: 5px;
            }
            .product-price {
              font-weight: bold;
              color: #8BC34A;
              font-size: 16px;
            }
            .order-summary {
              background-color: #f9f9f9;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .summary-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 10px;
              font-size: 16px;
            }
            .summary-row.total {
              font-weight: bold;
              font-size: 18px;
              color: #333;
              border-top: 1px solid #ddd;
              padding-top: 10px;
              margin-top: 15px;
            }
            .vat-note {
              font-size: 14px;
              color: #666;
              text-align: right;
              margin-top: 5px;
            }
            .info-section {
              margin: 20px 0;
            }
            .info-title {
              font-weight: bold;
              font-size: 18px;
              color: #333;
              margin-bottom: 15px;
            }
            .info-content {
              background-color: #f9f9f9;
              padding: 15px;
              border-radius: 8px;
              font-size: 14px;
              line-height: 1.6;
            }
            .address-section {
              display: flex;
              gap: 0;
              margin: 20px 0;
            }
            .address-block {
              flex: 1;
            }
            .footer {
              background-color: #e8f7ee;
              padding: 32px 20px 20px 20px;
              text-align: center;
              font-size: 13px;
              color: #888;
            }
            .footer .socials {
              margin: 18px 0 10px 0;
            }
            .footer .socials a {
              display: inline-block;
              margin: 0 10px;
              text-decoration: none;
            }
            .footer .socials img {
              width: 32px;
              height: 32px;
              vertical-align: middle;
              border-radius: 50%;
              background: #fff;
              box-shadow: 0 2px 8px rgba(0,0,0,0.04);
              transition: box-shadow 0.2s;
            }
            .footer .socials img:hover {
              box-shadow: 0 4px 16px rgba(26,188,123,0.15);
            }
            @media (max-width: 600px) {
              .container { border-radius: 0; margin: 0; }
              .content { padding: 24px 8px 24px 8px; }
              .footer { padding: 24px 4px 12px 4px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <a href="https://www.graba2z.ae/" target="_blank">
                <img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753105567/admin-logo_ruxcjj.png" alt="Graba2z Logo" />
              </a>
            </div>
            <div class="content">
              <div class="status-section" style="background:#E8F5E9;border-radius:16px;padding:40px 30px 32px;margin:0 auto 30px;max-width:520px;text-align:center;">
                <div class="order-number" style="margin-bottom:18px;">Order #${data.orderNumber || data._id?.toString().slice(-6) || "N/A"}</div>
                <div class="greeting" style="margin-bottom:8px;">Hi ${customerName}, Thank you for your purchase.</div>
                <div class="processing-text" style="margin-bottom:32px;">Your order has been placed.</div>
                <div class="status-card" style="background:transparent;padding:0;margin:0;">
                  <div class="status-icon" style="color:#2E7D32;font-size:44px;line-height:1;margin:0 auto 12px auto;">📦</div>
                  <div class="status-label" style="color:#2E7D32;margin-top:4px;font-size:20px;font-weight:700;letter-spacing:0.2px;">Order Placed</div>
                </div>
              </div>
              <div style="text-align:center;margin-top:16px;">
                <a href="https://www.graba2z.ae/track-order" 
                   style="display:inline-block;background:#84cc16;color:#ffffff;text-decoration:none;padding:14px 32px;font-size:14px;font-weight:600;border-radius:28px;letter-spacing:0.5px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
                  TRACK YOUR ORDER
                </a>
              </div>
            </div>
            <div class="footer">
              <div class="socials">
                <a href="https://www.facebook.com/grabatozae/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_1_axvzvv.jpg" alt="Facebook" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.instagram.com/grabatoz/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107124/WhatsApp_Image_2025-07-21_at_7.10.18_AM_xgjv5f.jpg" alt="Instagram" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://x.com/GrabAtoz" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107545/WhatsApp_Image_2025-07-21_at_7.10.18_AM_2_cwzjg6.png" alt="X" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.linkedin.com/company/grabatozae" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_3_ll6y2i.jpg" alt="LinkedIn" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
              </div>
              <p>This email was sent by: order@grabatoz.ae</p>
              <br/>
              <p>Kindly Do Not Reply to this Email</p>
              <br/>
              <div style="margin-top: 10px; color: #888;">
                &copy; 2025 Graba2z. All rights reserved.<br />
                <span style="font-size:12px;">If you did not enter this email address when signing up for Graba2z, disregard this message.</span>
              </div>
            </div>
          </div>
        </body>
        </html>
      `

    case "orderStatusUpdate":
      // Status icon/label and theming
      const statusSteps = [
        { key: "Order Placed", label: "Order Placed", icon: "🛒" },
        { key: "Order Processing", label: "Order Processing", icon: "🔄" },
        { key: "On Hold", label: "On Hold", icon: "⏸️" },
        { key: "Confirmed", label: "Confirmed", icon: "✅" },
        { key: "Ready for Shipment", label: "Ready for Shipment", icon: "📦" },
        { key: "Shipped", label: "Shipped", icon: "📦" },
        { key: "On the Way", label: "On the Way", icon: "🚚" },
        { key: "Out for Delivery", label: "Out for Delivery", icon: "🚚" },
        { key: "Delivered", label: "Delivered", icon: "🎉" },
        { key: "Cancelled", label: "Cancelled", icon: "❌" },
      ]
      const getCurrentStep = (status) => {
        if (!status) return statusSteps[0]
        const normalized = status.trim().toLowerCase()
        // Map legacy initial statuses to Order Placed for customer-facing display
        if (["new", "new order", "order placed"].includes(normalized)) return statusSteps.find(s=>s.key==="Order Placed")
        if (["processing", "in process", "order processing"].includes(normalized)) return statusSteps.find(s=>s.key==="Order Processing")
        if (["on hold", "on-hold", "hold"].includes(normalized)) return statusSteps.find(s=>s.key==="On Hold")
        if (["confirmed", "confirm"].includes(normalized)) return statusSteps.find(s=>s.key==="Confirmed")
        if (["ready for shipment", "ready for shipping", "ready to ship", "rts"].includes(normalized)) return statusSteps.find(s=>s.key==="Ready for Shipment")
        if (["shipped", "dispatched", "dispatch"].includes(normalized)) return statusSteps.find(s=>s.key==="Shipped")
        if (["on the way", "on-the-way"].includes(normalized)) return statusSteps.find(s=>s.key==="On the Way")
        if (["out for delivery", "out of delivery", "out-of-delivery"].includes(normalized)) return statusSteps.find(s=>s.key==="Out for Delivery")
        if (["delivered"].includes(normalized)) return statusSteps.find(s=>s.key==="Delivered")
        if (["cancelled", "canceled"].includes(normalized)) return statusSteps.find(s=>s.key==="Cancelled")
        return statusSteps.find(s=>s.key==="Order Placed")
      }
      const currentStep = getCurrentStep(data.status)

      // Theme colors per status (background, text, icon background)
      const getTheme = (status) => {
        const n = (status || "").toString().trim().toLowerCase()
        if (["order placed", "new order", "new"].includes(n)) return { bg: "#E3F2FD", text: "#1565C0", iconBg: "#1E88E5" }
        if (["processing", "in process", "order processing"].includes(n)) return { bg: "#E3F2FD", text: "#1565C0", iconBg: "#1E88E5" }
        if (["confirmed", "confirm"].includes(n)) return { bg: "#E8F5E9", text: "#2E7D32", iconBg: "#43A047" }
        if (["ready for shipment", "ready for shipping", "ready to ship", "rts"].includes(n)) return { bg: "#FFF3E0", text: "#EF6C00", iconBg: "#FB8C00" }
        if (["shipped", "dispatched", "dispatch"].includes(n)) return { bg: "#E3F2FD", text: "#1565C0", iconBg: "#1E88E5" }
        if (["on the way", "on-the-way"].includes(n)) return { bg: "#E3F2FD", text: "#1565C0", iconBg: "#1E88E5" }
        if (["out for delivery", "out of delivery", "out-of-delivery"].includes(n)) return { bg: "#FFF8E1", text: "#F57F17", iconBg: "#F9A825" }
        if (["delivered"].includes(n)) return { bg: "#E8F5E9", text: "#2E7D32", iconBg: "#43A047" }
        if (["cancelled", "canceled"].includes(n)) return { bg: "#FFEBEE", text: "#C62828", iconBg: "#E53935" }
        if (["on hold", "on-hold", "hold"].includes(n)) return { bg: "#ECEFF1", text: "#455A64", iconBg: "#78909C" }
        // default: processing
        return { bg: "#E3F2FD", text: "#1565C0", iconBg: "#1E88E5" }
      }
      const theme = getTheme(data.status)
      // Build invoice table ONLY for Delivered status
      const normalizedStatusForInvoice = (data.status || '').toString().trim().toLowerCase()
      const isDeliveredStatus = normalizedStatusForInvoice === 'delivered'
      const orderItemsList = Array.isArray(data.orderItems) ? data.orderItems : []
      const currency = 'AED'
      const itemsSubtotal = orderItemsList.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0)
      const shippingPrice = Number(data.shippingPrice || 0)
      const taxPrice = Number(data.taxPrice || 0)
      const discountAmount = Number(data.discountAmount || 0)
      // Calculate grandTotal from items to ensure accuracy (handles variations correctly)
      const calculatedTotal = itemsSubtotal + shippingPrice + taxPrice - discountAmount
      const storedTotal = Number(data.totalPrice || 0)
      // Use calculated total if higher (indicates stored value might be wrong due to variations)
      const grandTotal = calculatedTotal > storedTotal ? calculatedTotal : storedTotal
      const paymentMethod = data.paymentMethod || 'Cash on Delivery'
      const paymentStatus = data.isPaid ? 'Paid' : 'Unpaid'
      const paidAtDisplay = data.isPaid && data.paidAt ? new Date(data.paidAt).toLocaleDateString() : ''
      const invoiceSection = isDeliveredStatus ? `
        <style>
          .invoice-wrapper {margin:40px auto 24px;max-width:560px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:12px;padding:24px;}
          .invoice-wrapper h3 {margin:0 0 16px;font-size:20px;color:#333;font-weight:600;}
          table.invoice-table {width:100%;border-collapse:collapse;font-size:14px;}
          table.invoice-table thead th {text-align:left;background:#eceff1;padding:10px 8px;font-weight:600;color:#37474f;border-bottom:1px solid #cfd8dc;}
          table.invoice-table tbody td {padding:8px 8px;border-bottom:1px solid #e0e0e0;vertical-align:middle;}
          table.invoice-table tbody tr:last-child td {border-bottom:none;}
          table.invoice-table tfoot td {padding:8px 8px;font-weight:600;}
          table.invoice-table tfoot tr.total-row td {border-top:2px solid #ccc;font-size:15px;}
          .text-right {text-align:right;}
          .muted {color:#666;font-weight:400;}
          .paid-at {font-size:12px;color:#2e7d32;font-weight:500;}
          /* Force predictable image sizing in most email clients */
          .img-cell {width:56px;}
          .img-cell img {display:block;width:56px;height:56px;max-width:56px;max-height:56px;object-fit:cover;border-radius:8px;background:#fff;border:1px solid #ddd;}
          @media (max-width:600px){
            .invoice-wrapper{padding:16px;margin:32px 8px;}
            table.invoice-table thead{display:none;}
            table.invoice-table tbody td{display:block;padding:6px 4px;border-bottom:1px solid #e0e0e0;}
            table.invoice-table tbody tr{margin-bottom:16px;display:block;}
            table.invoice-table tbody td[data-label]{position:relative;padding-left:52%;}
            table.invoice-table tbody td[data-label]:before{content:attr(data-label);position:absolute;left:0;width:48%;padding-left:4px;font-weight:600;color:#455a64;}
            table.invoice-table tbody td.img-cell{padding-left:0;}
            /* Larger but constrained image on mobile */
            table.invoice-table tbody td.img-cell img{display:block;width:96px;height:96px;max-width:96px;max-height:96px;border-radius:10px;object-fit:cover;}
          }
        </style>
        <div class="invoice-wrapper">
          <h3>Delivery Invoice</h3>
          <table class="invoice-table" role="presentation" cellspacing="0" cellpadding="0">
            <thead>
              <tr>
                <th style="width:12%;">Image</th>
                <th style="width:56%;">Item</th>
                <th style="width:12%;">Qty</th>
                <th style="width:20%;" class="text-right">Price (${currency})</th>
              </tr>
            </thead>
            <tbody>
              ${orderItemsList.map(it => {
                const lineTotal = (Number(it.price)||0) * (Number(it.quantity)||1)
                const name = (it.product && (it.product.name || it.product.title)) || it.name || 'Item'
                const rawImg = (it.product && it.product.image) || it.image
                const imgSrc = toAbsoluteUrl(rawImg)
                const colorInfo = it.selectedColorData && it.selectedColorData.colorName ? `<br><span style="font-size:12px;color:#7c3aed;">Color: ${it.selectedColorData.colorName}</span>` : ''
                const dosInfo = it.selectedDosData && it.selectedDosData.dosType ? `<br><span style="font-size:12px;color:#2563eb;">OS: ${it.selectedDosData.dosType}</span>` : ''
                return `<tr>
                  <td class="img-cell" data-label="Image" style="width:56px;">
                    <img src="${imgSrc}" alt="${name}" width="56" height="56" style="display:block;width:56px;height:56px;max-width:56px;max-height:56px;object-fit:cover;border-radius:8px;background:#fff;border:1px solid #ddd;" />
                  </td>
                  <td data-label="Item">${name}${colorInfo}${dosInfo}</td>
                  <td data-label="Qty">${Number(it.quantity)||1}</td>
                  <td data-label="Price" class="text-right">${(Number(it.price)||0).toFixed(2)}</td>
                </tr>`
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" class="text-right muted">Items Subtotal</td>
                <td class="text-right">${itemsSubtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td colspan="3" class="text-right muted">Shipping</td>
                <td class="text-right">${shippingPrice.toFixed(2)}</td>
              </tr>
              ${taxPrice > 0 ? `<tr>
                <td colspan="3" class="text-right muted">Tax</td>
                <td class="text-right">${taxPrice.toFixed(2)}</td>
              </tr>` : ''}
              ${discountAmount > 0 ? `<tr>
                <td colspan="3" class="text-right muted">Discount</td>
                <td class="text-right">- ${discountAmount.toFixed(2)}</td>
              </tr>` : ''}
              <tr class="total-row">
                <td colspan="3" class="text-right">Grand Total (${currency})</td>
                <td class="text-right">${grandTotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td colspan="3" class="text-right muted">Payment Method</td>
                <td class="text-right">${paymentMethod}</td>
              </tr>
              <tr>
                <td colspan="3" class="text-right muted">Payment Status</td>
                <td class="text-right">${paymentStatus} ${paidAtDisplay ? `<span class="paid-at">(on ${paidAtDisplay})</span>` : ''}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : ''
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Order Status Update</title>
          <style>
            body { background-color: #e8f7ee; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 32px auto; background-color: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); border: 1px solid #e0e0e0; }
            .action-buttons {
              text-align: center;
              margin: 30px 0;
            }
            .button {
              display: inline-block;
              background-color: #8BC34A;
              color: white;
              padding: 15px 30px;
              text-decoration: none;
              border-radius: 25px;
              font-weight: bold;
              font-size: 14px;
              margin: 5px 10px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .header { background-color: #fff; padding: 32px 0 16px 0; text-align: center; border-bottom: 1px solid #e0e0e0; }
            .header a { display: inline-block; }
            .header img { max-height: 60px; }
            .order-icon { width: 80px; height: 80px; background-color: #2c3e50; border-radius: 50%; margin: 20px auto 0 auto; display: flex; align-items: center; justify-content: center; color: white; font-size: 30px; }
            .content { padding: 40px 30px 32px 30px; background: #fff; }
            .order-number { font-size: 24px; font-weight: bold; color: #333; text-align: center; margin-bottom: 20px; }
            .greeting { font-size: 18px; text-align: center; margin-bottom: 10px; color: #333; }
            .processing-text { font-size: 16px; text-align: center; color: #666; margin-bottom: 30px; }
            .status-card { margin: 0 auto 24px auto; padding: 24px; border-radius: 12px; text-align: center; }
            .status-icon { font-size: 44px; line-height: 1; margin: 0 auto 12px auto; }
            .status-label { font-size: 20px; font-weight: 700; letter-spacing: 0.2px; }
            /* Removed tables per request */
            .footer { background-color: #e8f7ee; padding: 32px 20px 20px 20px; text-align: center; font-size: 13px; color: #888; }
            .footer .socials { margin: 18px 0 10px 0; }
            .footer .socials a { display: inline-block; margin: 0 10px; text-decoration: none; }
            .footer .socials img { width: 32px; height: 32px; vertical-align: middle; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.04); transition: box-shadow 0.2s; }
            .footer .socials img:hover { box-shadow: 0 4px 16px rgba(26,188,123,0.15); }
            @media (max-width: 600px) { .container { border-radius: 0; margin: 0; } .content { padding: 24px 8px 24px 8px; } .footer { padding: 24px 4px 12px 4px; } }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <a href="https://www.graba2z.ae/" target="_blank">
                <img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753105567/admin-logo_ruxcjj.png" alt="Graba2z Logo" />
              </a>
            </div>
            <div class="content">
              <div class="status-section" style="background:${theme.bg};border-radius:16px;padding:40px 30px 32px;margin:0 auto 30px;max-width:520px;">
                <div class="order-number" style="margin-bottom:18px;">Order #${data.orderNumber || data._id?.toString().slice(-6) || "N/A"}</div>
                <div class="greeting" style="margin-bottom:8px;">Hello ${data.customerName || "Customer"}!</div>
                <div class="processing-text" style="margin-bottom:32px;">Your order status has been updated.</div>
                <div class="status-card" style="background:transparent;padding:0;margin:0;">
                  <div class="status-icon" style="color:${theme.text};">${currentStep.icon}</div>
                  <div class="status-label" style="color:${theme.text};margin-top:4px;">${currentStep.label}</div>
                </div>
              </div>
              <!-- STATUS_TEMPLATE_MINIMAL v2: only header + status badge retained -->
              <!-- If you still see tables, production hasn't redeployed this file. -->
              ${invoiceSection}
              ${data.sellerMessage ? `
              <div style="max-width:520px;margin:24px auto;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;">
                <div style="font-size:14px;font-weight:600;color:#166534;margin-bottom:8px;display:flex;align-items:center;">
                  <span style="margin-right:8px;">📝</span> Message from Seller
                </div>
                <div style="font-size:14px;color:#15803d;line-height:1.6;white-space:pre-wrap;">${data.sellerMessage}</div>
              </div>
              ` : ''}
              <div style="text-align:center;margin-top:16px;">
                <a href="https://www.graba2z.ae/track-order" 
                   style="display:inline-block;background:#84cc16;color:#ffffff;text-decoration:none;padding:14px 32px;font-size:14px;font-weight:600;border-radius:28px;letter-spacing:0.5px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
                  TRACK YOUR ORDER
                </a>
              </div>
            </div>
            <div class="footer">
              <div class="socials">
                <a href="https://www.facebook.com/grabatozae/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_1_axvzvv.jpg" alt="Facebook" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.instagram.com/grabatoz/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107124/WhatsApp_Image_2025-07-21_at_7.10.18_AM_xgjv5f.jpg" alt="Instagram" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://x.com/GrabAtoz" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107545/WhatsApp_Image_2025-07-21_at_7.10.18_AM_2_cwzjg6.png" alt="X" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.linkedin.com/company/grabatozae" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_3_ll6y2i.jpg" alt="LinkedIn" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
              </div>
              <p>This email was sent by: order@grabatoz.ae</p>
              <br/>
              <p>Kindly Do Not Reply to this Email</p>
              <br/>
              <div style="margin-top: 10px; color: #888;">
                &copy; 2025 Graba2z. All rights reserved.<br />
                <span style="font-size:12px;">If you did not enter this email address when signing up for Graba2z, disregard this message.</span>
              </div>
            </div>
          </div>
        </body>
        </html>
      `

    case "accountDeletion":
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Account Deletion Verification</title>
          <style>
            body {
              background-color: #fee;
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 32px auto;
              background-color: #ffffff;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 24px rgba(0,0,0,0.08);
              border: 1px solid #e0e0e0;
            }
            .header {
              background-color: #fff;
              padding: 32px 0 16px 0;
              text-align: center;
              border-bottom: 1px solid #e0e0e0;
            }
            .header a {
              display: inline-block;
            }
            .header img {
              max-height: 60px;
            }
            .content {
              padding: 40px 30px 32px 30px;
              text-align: center;
            }
            .warning-icon {
              width: 80px;
              height: 80px;
              background-color: #ef4444;
              border-radius: 50%;
              margin: 20px auto;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 40px;
            }
            .content h2 {
              color: #dc2626;
              font-size: 1.5rem;
              margin-bottom: 0.5em;
            }
            .content p {
              color: #444;
              font-size: 1.1rem;
              margin: 0.5em 0 1.5em 0;
            }
            .code-box {
              background: #fef2f2;
              border: 2px solid #fecaca;
              border-radius: 10px;
              margin: 32px auto 24px auto;
              padding: 24px 0;
              font-size: 2.2rem;
              font-weight: bold;
              color: #dc2626;
              letter-spacing: 10px;
              max-width: 320px;
            }
            .warning-box {
              background: #fef2f2;
              border-left: 4px solid #ef4444;
              border-radius: 8px;
              padding: 16px 20px;
              margin: 20px 0;
              text-align: left;
            }
            .warning-box strong {
              color: #dc2626;
            }
            .footer {
              background-color: #fee;
              padding: 32px 20px 20px 20px;
              text-align: center;
              font-size: 13px;
              color: #888;
            }
            .footer .socials {
              margin: 18px 0 10px 0;
            }
            .footer .socials a {
              display: inline-block;
              margin: 0 10px;
              text-decoration: none;
            }
            .footer .socials img {
              width: 32px;
              height: 32px;
              vertical-align: middle;
              border-radius: 50%;
              background: #fff;
              box-shadow: 0 2px 8px rgba(0,0,0,0.04);
              transition: box-shadow 0.2s;
            }
            .footer .socials img:hover {
              box-shadow: 0 4px 16px rgba(239,68,68,0.15);
            }
            @media (max-width: 600px) {
              .container { border-radius: 0; margin: 0; }
              .content { padding: 24px 8px 24px 8px; }
              .footer { padding: 24px 4px 12px 4px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <a href="https://www.graba2z.ae/" target="_blank">
                <img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753105567/admin-logo_ruxcjj.png" alt="Graba2z Logo" />
              </a>
              <div class="warning-icon">⚠️</div>
            </div>
            <div class="content">
              <h2>Account Deletion Request</h2>
              <p>Hi <b>${data.name || "User"}</b>,<br />
              We received a request to permanently delete your Graba2z account. If you want to proceed, please enter the verification code below:</p>
              <div class="code-box">${data.code || "000000"}</div>
              <div class="warning-box">
                <strong>⚠️ Warning:</strong> This action is permanent and cannot be undone. Once your account is deleted:
                <ul style="text-align: left; margin: 10px 0 0 0; padding-left: 20px; color: #666;">
                  <li>All your personal data will be permanently removed</li>
                  <li>Your order history will be deleted</li>
                  <li>Your wishlist and preferences will be lost</li>
                  <li>You won't be able to recover your account</li>
                </ul>
              </div>
              <p style="margin: 16px 0 0 0; color: #dc2626; font-weight: bold;">
                Copy the code above and paste it on the website to confirm account deletion.
              </p>
              <p style="margin-top: 2em; color: #888; font-size: 1em;">This code will expire in 10 minutes.<br />If you didn't request account deletion, please ignore this email and secure your account immediately.</p>
            </div>
            <div class="footer">
              <div class="socials">
                <a href="https://www.facebook.com/grabatozae/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_1_axvzvv.jpg" alt="Facebook" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.instagram.com/grabatoz/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107124/WhatsApp_Image_2025-07-21_at_7.10.18_AM_xgjv5f.jpg" alt="Instagram" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://x.com/GrabAtoz" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107545/WhatsApp_Image_2025-07-21_at_7.10.18_AM_2_cwzjg6.png" alt="X" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.linkedin.com/company/grabatozae" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_3_ll6y2i.jpg" alt="LinkedIn" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
              </div>
              <p>This email was sent by: support@grabatoz.ae</p>
              <br/>
              <p>Kindly Do Not Reply to this Email</p>
              <br/>
              <div style="margin-top: 10px; color: #888;">
                &copy; 2025 Graba2z. All rights reserved.<br />
                <span style="font-size:12px;">If you did not request account deletion, please secure your account immediately.</span>
              </div>
            </div>
          </div>
        </body>
        </html>
      `

    case "reviewVerification":
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Review Verification</title>
          <style>
            body {
              background-color: #e8f7ee;
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 32px auto;
              background-color: #ffffff;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 24px rgba(0,0,0,0.08);
              border: 1px solid #e0e0e0;
            }
            .header {
              background-color: #fff;
              padding: 32px 0 16px 0;
              text-align: center;
              border-bottom: 1px solid #e0e0e0;
            }
            .header a {
              display: inline-block;
            }
            .header img {
              max-height: 60px;
            }
            .content {
              padding: 40px 30px 32px 30px;
              text-align: center;
            }
            .content h2 {
              color: #222;
              font-size: 1.5rem;
              margin-bottom: 0.5em;
            }
            .content p {
              color: #444;
              font-size: 1.1rem;
              margin: 0.5em 0 1.5em 0;
            }
            .code-box {
              background: #f4f4f4;
              border-radius: 10px;
              margin: 32px auto 24px auto;
              padding: 24px 0;
              font-size: 2.2rem;
              font-weight: bold;
              color: #1abc7b;
              letter-spacing: 10px;
              max-width: 320px;
            }
            .product-info {
              background: #f9f9f9;
              border-radius: 8px;
              padding: 20px;
              margin: 20px 0;
              text-align: left;
            }
            .footer {
              background-color: #e8f7ee;
              padding: 32px 20px 20px 20px;
              text-align: center;
              font-size: 13px;
              color: #888;
            }
            .footer .socials {
              margin: 18px 0 10px 0;
            }
            .footer .socials a {
              display: inline-block;
              margin: 0 10px;
              text-decoration: none;
            }
            .footer .socials img {
              width: 32px;
              height: 32px;
              vertical-align: middle;
              border-radius: 50%;
              background: #fff;
              box-shadow: 0 2px 8px rgba(0,0,0,0.04);
              transition: box-shadow 0.2s;
            }
            .footer .socials img:hover {
              box-shadow: 0 4px 16px rgba(26,188,123,0.15);
            }
            @media (max-width: 600px) {
              .container { border-radius: 0; margin: 0; }
              .content { padding: 24px 8px 24px 8px; }
              .footer { padding: 24px 4px 12px 4px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <a href="https://www.graba2z.ae/" target="_blank">
                <img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753105567/admin-logo_ruxcjj.png" alt="Graba2z Logo" />
              </a>
            </div>
            <div class="content">
              <h2>Verify Your Review</h2>
              <p>Hi <b>${data.name || "Customer"}</b>,<br />
              Thank you for taking the time to review our product. Please verify your email address by entering the verification code below:</p>
              <div class="code-box">${data.code || "000000"}</div>
              <div class="product-info">
                <strong>Product:</strong> ${data.productName || "Product"}<br />
                <strong>Your Rating:</strong> ${data.rating || 5}/5 stars<br />
                <strong>Your Review:</strong> "${data.comment || "No comment"}"
              </div>
              <p style="margin: 16px 0 0 0; color: #1abc7b; font-weight: bold;">
                Copy the code above and paste it on the website to verify and publish your review.
              </p>
              <p style="margin-top: 2em; color: #888; font-size: 1em;">This code will expire in 10 minutes.<br />If you didn't submit this review, please ignore this email.</p>
            </div>
            <div class="footer">
              <div class="socials">
                <a href="https://www.facebook.com/grabatozae/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_1_axvzvv.jpg" alt="Facebook" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.instagram.com/grabatoz/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107124/WhatsApp_Image_2025-07-21_at_7.10.18_AM_xgjv5f.jpg" alt="Instagram" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://x.com/GrabAtoz" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107545/WhatsApp_Image_2025-07-21_at_7.10.18_AM_2_cwzjg6.png" alt="X" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.linkedin.com/company/grabatozae" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_3_ll6y2i.jpg" alt="LinkedIn" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
              </div>
              <p>This email was sent by: support@grabatoz.ae</p>
              <br/>
              <p>Kindly Do Not Reply to this Email</p>
              <br/>
              <div style="margin-top: 10px; color: #888;">
                &copy; 2025 Graba2z. All rights reserved.<br />
                <span style="font-size:12px;">If you did not submit this review, disregard this message.</span>
              </div>
            </div>
          </div>
        </body>
        </html>
      `

    case "guestAccountCreated":
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Your Account Has Been Created</title>
          <style>
            body {
              background-color: #e8f7ee;
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 32px auto;
              background-color: #ffffff;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 24px rgba(0,0,0,0.08);
              border: 1px solid #e0e0e0;
            }
            .header {
              background-color: #fff;
              padding: 32px 0 16px 0;
              text-align: center;
              border-bottom: 1px solid #e0e0e0;
            }
            .header a {
              display: inline-block;
            }
            .header img {
              max-height: 60px;
            }
            .content {
              padding: 40px 30px 32px 30px;
              text-align: center;
            }
            .success-icon {
              width: 80px;
              height: 80px;
              background-color: #1abc7b;
              border-radius: 50%;
              margin: 20px auto;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 40px;
            }
            .content h2 {
              color: #1abc7b;
              font-size: 1.5rem;
              margin-bottom: 0.5em;
            }
            .content p {
              color: #444;
              font-size: 1.1rem;
              margin: 0.5em 0 1.5em 0;
            }
            .credentials-box {
              background: #f0fdf4;
              border: 2px solid #86efac;
              border-radius: 10px;
              margin: 32px auto 24px auto;
              padding: 24px;
              max-width: 400px;
              text-align: left;
            }
            .credentials-box .label {
              color: #666;
              font-size: 0.9rem;
              margin-bottom: 4px;
            }
            .credentials-box .value {
              color: #1abc7b;
              font-size: 1.2rem;
              font-weight: bold;
              margin-bottom: 16px;
              word-break: break-all;
            }
            .credentials-box .value:last-child {
              margin-bottom: 0;
            }
            .login-btn {
              display: inline-block;
              background: #1abc7b;
              color: #fff;
              font-weight: 600;
              padding: 16px 40px;
              border-radius: 8px;
              text-decoration: none;
              font-size: 1.1rem;
              margin: 24px 0 0 0;
              transition: background 0.2s;
            }
            .login-btn:hover {
              background: #159c65;
            }
            .note-box {
              background: #fef3c7;
              border-left: 4px solid #f59e0b;
              border-radius: 8px;
              padding: 16px 20px;
              margin: 20px 0;
              text-align: left;
              font-size: 0.95rem;
            }
            .note-box strong {
              color: #b45309;
            }
            .footer {
              background-color: #e8f7ee;
              padding: 32px 20px 20px 20px;
              text-align: center;
              font-size: 13px;
              color: #888;
            }
            .footer .socials {
              margin: 18px 0 10px 0;
            }
            .footer .socials a {
              display: inline-block;
              margin: 0 10px;
              text-decoration: none;
            }
            .footer .socials img {
              width: 32px;
              height: 32px;
              vertical-align: middle;
              border-radius: 50%;
              background: #fff;
              box-shadow: 0 2px 8px rgba(0,0,0,0.04);
              transition: box-shadow 0.2s;
            }
            .footer .socials img:hover {
              box-shadow: 0 4px 16px rgba(26,188,123,0.15);
            }
            @media (max-width: 600px) {
              .container { border-radius: 0; margin: 0; }
              .content { padding: 24px 8px 24px 8px; }
              .footer { padding: 24px 4px 12px 4px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <a href="https://www.graba2z.ae/" target="_blank">
                <img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753105567/admin-logo_ruxcjj.png" alt="Graba2z Logo" />
              </a>
            </div>
            <div class="content">
              <div class="success-icon">✓</div>
              <h2>Welcome to Graba2z!</h2>
              <p>Hi <b>${data.name || "Customer"}</b>,<br />
              Your account has been created successfully. You can now use the following credentials to log in anytime:</p>
              <div class="credentials-box">
                <div class="label">Email</div>
                <div class="value">${data.email || ""}</div>
                <div class="label">Password</div>
                <div class="value">${data.password || ""}</div>
              </div>
              <div class="note-box">
                <strong>Important:</strong> We recommend changing your password after your first login for security purposes.
              </div>
              <a href="https://www.graba2z.ae/login" class="login-btn">Login to Your Account</a>
              <p style="margin-top: 2em; color: #888; font-size: 1em;">Continue shopping and enjoy exclusive deals on Graba2z!</p>
            </div>
            <div class="footer">
              <div class="socials">
                <a href="https://www.facebook.com/grabatozae/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_1_axvzvv.jpg" alt="Facebook" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.instagram.com/grabatoz/" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107124/WhatsApp_Image_2025-07-21_at_7.10.18_AM_xgjv5f.jpg" alt="Instagram" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://x.com/GrabAtoz" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107545/WhatsApp_Image_2025-07-21_at_7.10.18_AM_2_cwzjg6.png" alt="X" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
                <a href="https://www.linkedin.com/company/grabatozae" target="_blank"><img src="https://res.cloudinary.com/dyfhsu5v6/image/upload/v1753107123/WhatsApp_Image_2025-07-21_at_7.10.18_AM_3_ll6y2i.jpg" alt="LinkedIn" style="width:32px;height:32px;margin:0 10px;vertical-align:middle;background:transparent;border-radius:8px;box-shadow:none;" /></a>
              </div>
              <p>This email was sent by: support@grabatoz.ae</p>
              <br/>
              <p>Kindly Do Not Reply to this Email</p>
              <br/>
              <div style="margin-top: 10px; color: #888;">
                &copy; 2025 Graba2z. All rights reserved.<br />
                <span style="font-size:12px;">If you did not create this account, please contact our support team.</span>
              </div>
            </div>
          </div>
        </body>
        </html>
      `

    default:
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Graba2z</title>
          ${baseStyle}
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <img src="https://graba2z.ae/logo.png" alt="Graba2z" class="logo" />
            </div>
            <div class="content">
              <p>Thank you for choosing Graba2z!</p>
            </div>
            <div class="footer">
              <h3>Get in Touch</h3>
              <div class="social-icons">
                <a href="https://facebook.com/graba2z" class="social-icon">f</a>
                <a href="https://twitter.com/graba2z" class="social-icon">t</a>
                <a href="https://instagram.com/graba2z" class="social-icon">@</a>
                <a href="https://linkedin.com/company/graba2z" class="social-icon">in</a>
              </div>
              <div class="contact-info">
                <p><strong>This email was sent by:</strong><br>
                <a href="mailto:order@grabatoz.ae">order@grabatoz.ae</a></p>
                <p><strong>For any questions please send an email to:</strong><br>
                <a href="mailto:support@grabatoz.ae">support@grabatoz.ae</a></p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
  }
}

const getAdminOrderNotificationTemplate = (data) => {
  const orderItems = Array.isArray(data.orderItems) ? data.orderItems : []
  const orderNumber = data.orderNumber || data._id?.toString().slice(-6) || "N/A"
  const customerName = data.shippingAddress?.name || data.pickupDetails?.name || data.user?.name || "N/A"
  const customerEmail = data.shippingAddress?.email || data.pickupDetails?.email || data.user?.email || "N/A"
  const customerPhone = data.shippingAddress?.phone || data.pickupDetails?.phone || "N/A"
  const orderDate = data.createdAt || new Date().toISOString()
  const isGuestOrder = !data.user
  const userId = data.user?._id?.toString?.() || data.user?.toString?.() || "N/A"

  const shippingAddress = data.shippingAddress
    ? `${data.shippingAddress.address || ""}, ${data.shippingAddress.city || ""}, ${data.shippingAddress.state || ""}, ${data.shippingAddress.zipCode || ""}`
        .replace(/,\s*,/g, ",")
        .replace(/^,\s*|\s*,$/g, "")
        .trim() || "N/A"
    : "N/A"

  const pickupLocation = data.pickupDetails?.location || "N/A"
  const pickupStoreId = data.pickupDetails?.storeId || "N/A"
  const customerNotes = data.customerNotes || "N/A"

  const itemRows = orderItems
    .map((item, index) => {
      const name = item.product?.name || item.name || "Product"
      const quantity = Number(item.quantity) || 1
      const unitPrice = Number(item.price) || 0
      const lineTotal = quantity * unitPrice
      const color = item.selectedColorData?.color ? ` | Color: ${item.selectedColorData.color}` : ""
      const os = item.selectedDosData?.dosType ? ` | OS: ${item.selectedDosData.dosType}` : ""

      return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">${index + 1}</td>
          <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(name)}${escapeHtml(color)}${escapeHtml(os)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${quantity}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatCurrency(unitPrice)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatCurrency(lineTotal)}</td>
        </tr>
      `
    })
    .join("")

  const itemsPrice = Number(data.itemsPrice) || 0
  const shippingPrice = Number(data.shippingPrice) || 0
  const totalPrice = Number(data.totalPrice) || 0

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>New Order - Admin Notification</title>
    </head>
    <body style="margin:0;padding:16px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <div style="max-width:900px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <div style="background:#84cc16;color:#fff;padding:16px 20px;">
          <h2 style="margin:0;font-size:20px;">New Order Received</h2>
          <div style="margin-top:6px;font-size:14px;">Order #${escapeHtml(orderNumber)} (${escapeHtml(data._id?.toString?.() || "N/A")})</div>
        </div>
        <div style="padding:20px;">
          <h3 style="margin:0 0 10px 0;font-size:16px;">Customer Details</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            <tr><td style="padding:8px;border:1px solid #ddd;width:220px;background:#f9fafb;"><strong>Name</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(customerName)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Email</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(customerEmail)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Phone</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(customerPhone)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Customer Type</strong></td><td style="padding:8px;border:1px solid #ddd;">${isGuestOrder ? "Guest" : "Logged-in User"}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>User ID</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(userId)}</td></tr>
          </table>

          <h3 style="margin:0 0 10px 0;font-size:16px;">Order Details</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            <tr><td style="padding:8px;border:1px solid #ddd;width:220px;background:#f9fafb;"><strong>Order Date</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(formatDateTime(orderDate))}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Delivery Type</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(formatDeliveryType(data.deliveryType))}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Shipping Address</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(shippingAddress)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Pickup Location</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(pickupLocation)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Pickup Store ID</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(pickupStoreId)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Payment Method</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(formatPaymentMethod(data.actualPaymentMethod, data.paymentMethod))}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Status</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(data.status || "New")}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Customer Notes</strong></td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(customerNotes)}</td></tr>
          </table>

          <h3 style="margin:0 0 10px 0;font-size:16px;">Products</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:8px;border:1px solid #ddd;text-align:left;">#</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:left;">Product</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:center;">Qty</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:right;">Unit Price</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows || `<tr><td colspan="5" style="padding:10px;border:1px solid #ddd;text-align:center;">No items</td></tr>`}
            </tbody>
          </table>

          <h3 style="margin:0 0 10px 0;font-size:16px;">Amount Summary</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;border:1px solid #ddd;width:220px;background:#f9fafb;"><strong>Items Price</strong></td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatCurrency(itemsPrice)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Shipping Price</strong></td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatCurrency(shippingPrice)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #ddd;background:#f9fafb;"><strong>Total Price</strong></td><td style="padding:8px;border:1px solid #ddd;text-align:right;"><strong>${formatCurrency(totalPrice)}</strong></td></tr>
          </table>
        </div>
      </div>
    </body>
    </html>
  `
}

// Generic send email function with sender type
const sendEmail = async (to, subject, html, senderType = "support") => {
  try {
    console.log(`[sendEmail] Starting - To: ${to}, Subject: ${subject}, Sender: ${senderType}`)
    const { transporter, from } = getMailConfig(senderType)
    console.log(`[sendEmail] Transporter configured, From: ${from}`)
    if (senderType === "support") {
      console.log("[sendEmail] SUPPORT_EMAIL_USER:", process.env.SUPPORT_EMAIL_USER)
      console.log("[sendEmail] SUPPORT_EMAIL_HOST:", process.env.SUPPORT_EMAIL_HOST)
      console.log("[sendEmail] SUPPORT_EMAIL_PORT:", process.env.SUPPORT_EMAIL_PORT)
    }
    const mailOptions = {
      from,
      to,
      subject,
      html,
    }
    console.log("[sendEmail] Sending email with options:", { from, to, subject: mailOptions.subject })
    const result = await transporter.sendMail(mailOptions)
    console.log(`[sendEmail] Email sent successfully from ${from}:`, result.messageId)
    return { success: true, messageId: result.messageId }
  } catch (error) {
    console.error("[sendEmail] Failed to send email:", error)
    console.error("[sendEmail] Error code:", error.code)
    console.error("[sendEmail] Error response:", error.response)
    throw new Error(`Email sending failed: ${error.message}`)
  }
}

// Send verification email
export const sendVerificationEmail = async (email, name, code) => {
  try {
    const html = getEmailTemplate("emailVerification", { name, code })
    await sendEmail(email, "Verify Your Email - Graba2z", html, "support")
    return { success: true }
  } catch (error) {
    console.error("Failed to send verification email:", error)
    throw error
  }
}

// Send order placed email
export const sendOrderPlacedEmail = async (order) => {
  try {
    const orderNumber = order._id.toString().slice(-6)

    // Get customer name and email - works for both guest and logged-in users
    const customerName = order.shippingAddress?.name || order.pickupDetails?.name || order.user?.name || "Customer"
    const customerEmail = order.shippingAddress?.email || order.pickupDetails?.email || order.user?.email

    if (!customerEmail) {
      console.warn(`[sendOrderPlacedEmail] No customer email found for order ${order._id}. Sending internal email only.`)
    }

    const isGuestOrder = !order.user
    const orderData = typeof order.toObject === "function" ? order.toObject() : order
    const recipientsSent = []
    const orderEmail = ORDER_NOTIFICATION_EMAIL || ""

    const shouldSendCustomerEmail =
      !!customerEmail &&
      (!orderEmail || customerEmail.toLowerCase().trim() !== orderEmail.toLowerCase().trim())

    if (shouldSendCustomerEmail) {
      const customerHtml = getEmailTemplate("orderConfirmation", {
        ...orderData,
        orderNumber,
        customerName,
        customerEmail,
      })

      const customerSubject = `Order Confirmation #${orderNumber} - Graba2z`
      await sendEmail(customerEmail, customerSubject, customerHtml, "order")
      recipientsSent.push(customerEmail)
    }

    if (orderEmail) {
      const adminHtml = getAdminOrderNotificationTemplate({
        ...orderData,
        orderNumber,
        customerName,
        customerEmail,
      })
      const adminSubject = `New Order #${orderNumber} - Admin Notification`
      await sendEmail(orderEmail, adminSubject, adminHtml, "order")
      recipientsSent.push(orderEmail)
    }

    if (recipientsSent.length === 0) {
      console.error("No email recipients found for order:", order._id)
      return { success: false, error: "No recipients" }
    }

    console.log(
      `[sendOrderPlacedEmail] Sent order placed emails for ${isGuestOrder ? "GUEST" : "LOGGED-IN"} user order ${order._id} to ${recipientsSent.join(", ")}`,
    )
    console.log(
      `[sendOrderPlacedEmail] Confirmation email sent successfully for order ${order._id} to ${recipientsSent.length} recipient(s)`,
    )
    return { success: true, recipients: recipientsSent }
  } catch (error) {
    console.error("Failed to send order placed email:", error)
    throw error
  }
}

// Send order status update email
export const sendOrderStatusUpdateEmail = async (order) => {
  try {
    // Normalize status for checking
    const normalizedStatus = (order.status || '').toString().trim().toLowerCase()
    const sendToCustomer = normalizedStatus !== "deleted"

    const orderNumber = order._id.toString().slice(-6)
    
    // Get customer name - works for both guest and logged-in users
    const customerName = order.shippingAddress?.name || order.pickupDetails?.name || order.user?.name || "Customer"
    
    // Get customer email - works for both guest and logged-in users
    // Priority: shippingAddress.email > pickupDetails.email > user.email
    const customerEmail = order.shippingAddress?.email || order.pickupDetails?.email || order.user?.email

    if (!customerEmail && sendToCustomer) {
      console.warn(
        `[sendOrderStatusUpdateEmail] No customer email found for order ${order._id}. Sending internal email only.`,
      )
    }

    // Log whether this is a guest or logged-in user order
    const isGuestOrder = !order.user
    const recipients = getOrderEmailRecipients(customerEmail, sendToCustomer)
    if (recipients.length === 0) {
      console.error("No email recipients found for order:", order._id)
      return { success: false, error: "No recipients" }
    }

    if (!sendToCustomer) {
      console.log(`[sendOrderStatusUpdateEmail] Customer email suppressed for Deleted status order ${order._id}`)
    }

    console.log(
      `[sendOrderStatusUpdateEmail] Sending email for ${isGuestOrder ? "GUEST" : "LOGGED-IN"} user order ${order._id} to ${recipients.join(", ")}`,
    )

    const html = getEmailTemplate("orderStatusUpdate", {
      ...order.toObject(),
      orderNumber,
      customerName,
    })
    // Defensive: strip any product/totals blocks if present due to stale template
    let sanitizedHtml = html
      // Remove product-section blocks
      .replace(/<div class="product-section">[\s\S]*?<\/div>\s*/g, '')
      // Remove order-summary blocks
      .replace(/<div class="order-summary">[\s\S]*?<\/div>\s*/g, '')
      // Remove summary rows if present standalone
      .replace(/<div class="summary-row[^"]*">[\s\S]*?<\/div>\s*/g, '')
    
    // Debug marker to ensure minimal template is deployed
    console.log('[sendOrderStatusUpdateEmail] Template length:', sanitizedHtml.length)
    console.log('[sendOrderStatusUpdateEmail] Minimal marker present:', sanitizedHtml.includes('STATUS_TEMPLATE_MINIMAL'))

    const statusMessages = {
      processing: "Order Processing",
      "in process": "Order Placed",
      placed: "Order Placed",
      "order placed": "Order Placed",
      "new order": "Order Placed",
      new: "Order Placed",
      confirmed: "Order Confirmed",
      "ready for shipment": "Order Ready for Shipment",
      "ready for shipping": "Order Ready for Shipment",
      "ready to ship": "Order Ready for Shipment",
      rts: "Order Ready for Shipment",
      shipped: "Order Shipped",
      delivered: "Order Delivered",
      cancelled: "Order Cancelled",
      hold: "Order On Hold",
      "on hold": "Order On Hold",
      dispatched: "Order Shipped",
      "on the way": "Order On The Way",
      "out for delivery": "Order Out for Delivery",
      returned: "Order Returned",
    }

    const subject = `${statusMessages[normalizedStatus] || "Order Update"} #${orderNumber} - Graba2z`
    for (const recipient of recipients) {
      await sendEmail(recipient, subject, sanitizedHtml, "order")
    }

    console.log(`[sendOrderStatusUpdateEmail] Email sent successfully for order ${order._id} to ${recipients.length} recipient(s)`)
    return { success: true, recipients }
  } catch (error) {
    console.error("Failed to send order status update email:", error)
    throw error
  }
}

// Send review verification email
export const sendReviewVerificationEmail = async (email, name, code, productName, rating, comment) => {
  try {
    const html = getEmailTemplate("reviewVerification", { name, code, productName, rating, comment })
    await sendEmail(email, "Verify Your Product Review - Graba2z", html, "support")
    return { success: true }
  } catch (error) {
    console.error("Failed to send review verification email:", error)
    throw error
  }
}

// Send account deletion verification email
export const sendAccountDeletionEmail = async (email, name, code) => {
  try {
    console.log("[sendAccountDeletionEmail] Starting - Email:", email, "Name:", name, "Code:", code)
    const html = getEmailTemplate("accountDeletion", { name, code })
    console.log("[sendAccountDeletionEmail] Template generated, length:", html.length)
    console.log("[sendAccountDeletionEmail] Calling sendEmail with support sender")
    const result = await sendEmail(email, "Account Deletion Verification - Graba2z", html, "support")
    console.log("[sendAccountDeletionEmail] Email sent successfully:", result)
    return { success: true }
  } catch (error) {
    console.error("[sendAccountDeletionEmail] Failed to send account deletion email:", error)
    console.error("[sendAccountDeletionEmail] Error details:", error.message)
    console.error("[sendAccountDeletionEmail] Error stack:", error.stack)
    throw error
  }
}

// Backward compatibility exports
export const sendOrderNotification = sendOrderStatusUpdateEmail
export const sendTrackingUpdateEmail = sendOrderStatusUpdateEmail

export const sendNewsletterConfirmation = async (email, preferences) => {
  const html = `
    <div>
      <h2>Thank you for subscribing to our newsletter!</h2>
      <p>Your preferences: <b>${(preferences || []).join(", ")}</b></p>
      <p>You will now receive updates according to your selected preferences.</p>
      <p style="color: #888; font-size: 13px; margin-top: 24px;">This is an automated message. Please do not reply.</p>
    </div>
  `
  await sendEmail(email, "Newsletter Subscription Confirmed - Graba2z", html, "support")
}

export const sendResetPasswordEmail = async (email, name, resetLink) => {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 32px;">
        <h2 style="color: #2c3e50;">Reset Your Password</h2>
        <p>Hi ${name || "User"},</p>
        <p>We received a request to reset your password. Click the button below to set a new password. This link is valid for 60 minutes.</p>
        <a href="${resetLink}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #84cc16; color: #fff; border-radius: 4px; text-decoration: none; font-weight: bold;">Reset Password</a>
        <p>If you did not request this, you can safely ignore this email.</p>
        <p style="color: #888; font-size: 12px; margin-top: 32px;">&copy; ${new Date().getFullYear()} Graba2z</p>
      </div>
    `
    await sendEmail(email, "Reset Your Password - Graba2z", html, "support")
    return { success: true }
  } catch (error) {
    console.error("Failed to send reset password email:", error)
    throw error
  }
}

// Send guest account created email with login credentials
export const sendGuestAccountCreatedEmail = async (email, name, password) => {
  try {
    console.log(`[sendGuestAccountCreatedEmail] Sending account credentials to ${email}`)
    const html = getEmailTemplate("guestAccountCreated", { name, email, password })
    await sendEmail(email, "Your Graba2z Account Has Been Created - Graba2z", html, "support")
    console.log(`[sendGuestAccountCreatedEmail] Email sent successfully to ${email}`)
    return { success: true }
  } catch (error) {
    console.error("[sendGuestAccountCreatedEmail] Failed to send email:", error)
    throw error
  }
}

export { sendEmail }

export default {
  sendVerificationEmail,
  sendOrderPlacedEmail,
  sendOrderStatusUpdateEmail,
  sendOrderNotification,
  sendTrackingUpdateEmail,
  sendNewsletterConfirmation,
  sendReviewVerificationEmail,
}






















































































































































