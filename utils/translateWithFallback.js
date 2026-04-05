import axios from "axios"

const PRIMARY_TRANSLATION_URL =
  process.env.TRANSLATION_PRIMARY_URL || "https://langaimodel.grabatoz.ae/api/translate/en-ar"
const PRIMARY_TRANSLATION_TIMEOUT_MS = Number(process.env.TRANSLATION_TIMEOUT_MS || 4000)
const BING_TRANSLATION_TIMEOUT_MS = Number(process.env.BING_TRANSLATION_TIMEOUT_MS || 3000)
const BING_TRANSLATION_COOLDOWN_MS = Number(process.env.BING_TRANSLATION_COOLDOWN_MS || 300000)
const ENABLE_PRIMARY_TRANSLATION = process.env.ENABLE_PRIMARY_TRANSLATION !== "false"
const ENABLE_BING_TRANSLATION_FALLBACK = process.env.ENABLE_BING_TRANSLATION_FALLBACK !== "false"

let cachedBingTranslate = null
let bingLoaderAttempted = false
let bingUnavailableUntil = 0

const withTimeout = (promise, ms, timeoutMessage) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), ms)
    }),
  ])

const loadBingTranslate = async () => {
  if (bingLoaderAttempted) return cachedBingTranslate
  bingLoaderAttempted = true

  try {
    const bingModule = await import("bing-translate-api")
    cachedBingTranslate = bingModule?.translate || null
    if (!cachedBingTranslate) {
      console.error("Bing translation fallback unavailable: translate export not found")
    }
  } catch (error) {
    console.error("Bing translation package unavailable:", error.message)
    cachedBingTranslate = null
  }

  return cachedBingTranslate
}

export const translateEnToAr = async (text) => {
  const normalizedText = typeof text === "string" ? text.trim() : ""
  if (!normalizedText) return ""

  if (ENABLE_PRIMARY_TRANSLATION) {
    try {
      const response = await axios.post(
        PRIMARY_TRANSLATION_URL,
        { text: normalizedText },
        { timeout: PRIMARY_TRANSLATION_TIMEOUT_MS },
      )
      const translated = response?.data?.translation
      if (typeof translated === "string" && translated.trim()) {
        return translated.trim()
      }
    } catch (error) {
      console.error("Primary translation failed, trying Bing fallback:", error.message)
    }
  }

  if (!ENABLE_BING_TRANSLATION_FALLBACK) return ""
  if (Date.now() < bingUnavailableUntil) return ""

  try {
    const bingTranslate = await loadBingTranslate()
    if (!bingTranslate) {
      bingUnavailableUntil = Date.now() + BING_TRANSLATION_COOLDOWN_MS
      return ""
    }

    const bingResult = await withTimeout(
      bingTranslate(normalizedText, null, "ar"),
      BING_TRANSLATION_TIMEOUT_MS,
      "Bing translation timeout",
    )
    const translated = bingResult?.translation
    if (typeof translated === "string" && translated.trim()) {
      return translated.trim()
    }
  } catch (error) {
    console.error("Bing fallback translation failed:", error.message)
  }

  bingUnavailableUntil = Date.now() + BING_TRANSLATION_COOLDOWN_MS
  return ""
}

export default {
  translateEnToAr,
}
