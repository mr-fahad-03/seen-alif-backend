import mongoose from "mongoose"
import dotenv from "dotenv"
import Redirect from "../models/redirectModel.js"
import config from "../config/config.js"

dotenv.config()

const normalizeUrl = (url) => {
  if (!url) return url
  
  // Don't normalize external URLs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  
  // Remove trailing slash except for root
  if (url.length > 1 && url.endsWith('/')) {
    return url.slice(0, -1)
  }
  
  return url
}

const fixRedirects = async () => {
  try {
    console.log('🔄 Connecting to database...')
    await mongoose.connect(config.MONGO_URI)
    console.log('✅ Connected to database')

    // Fetch all redirects
    const redirects = await Redirect.find({})
    console.log(`📊 Found ${redirects.length} redirects to process`)

    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const updates = []

    for (const redirect of redirects) {
      const originalFrom = redirect.redirectFrom
      const originalTo = redirect.redirectTo
      
      const normalizedFrom = normalizeUrl(originalFrom)
      const normalizedTo = normalizeUrl(originalTo)
      
      // Check if normalization changed anything
      if (originalFrom !== normalizedFrom || originalTo !== normalizedTo) {
        // Check if normalized 'from' URL already exists (to avoid duplicates)
        if (originalFrom !== normalizedFrom) {
          const existingRedirect = await Redirect.findOne({
            redirectFrom: normalizedFrom,
            _id: { $ne: redirect._id }
          })
          
          if (existingRedirect) {
            console.log(`⚠️  Skipping duplicate: ${originalFrom} -> ${normalizedFrom} (already exists)`)
            skippedCount++
            continue
          }
        }
        
        try {
          redirect.redirectFrom = normalizedFrom
          redirect.redirectTo = normalizedTo
          await redirect.save()
          
          updates.push({
            id: redirect._id,
            oldFrom: originalFrom,
            newFrom: normalizedFrom,
            oldTo: originalTo,
            newTo: normalizedTo
          })
          
          updatedCount++
          
          if (updatedCount % 50 === 0) {
            console.log(`📝 Processed ${updatedCount} redirects...`)
          }
        } catch (error) {
          console.error(`❌ Error updating redirect ${redirect._id}:`, error.message)
          errorCount++
        }
      } else {
        skippedCount++
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('📋 SUMMARY')
    console.log('='.repeat(60))
    console.log(`✅ Total redirects processed: ${redirects.length}`)
    console.log(`✅ Updated: ${updatedCount}`)
    console.log(`⏭️  Skipped (no changes needed): ${skippedCount}`)
    console.log(`❌ Errors: ${errorCount}`)
    console.log('='.repeat(60))

    if (updates.length > 0 && updates.length <= 20) {
      console.log('\n📝 Updated redirects:')
      updates.forEach((update, index) => {
        console.log(`\n${index + 1}.`)
        if (update.oldFrom !== update.newFrom) {
          console.log(`   From: ${update.oldFrom} → ${update.newFrom}`)
        }
        if (update.oldTo !== update.newTo) {
          console.log(`   To:   ${update.oldTo} → ${update.newTo}`)
        }
      })
    } else if (updates.length > 20) {
      console.log(`\n📝 ${updates.length} redirects were updated (too many to display)`)
    }

    console.log('\n✅ Redirect normalization completed!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error fixing redirects:', error)
    process.exit(1)
  }
}

// Run the fix
fixRedirects()
