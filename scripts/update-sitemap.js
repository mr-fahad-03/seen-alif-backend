import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const updateSitemap = async () => {
  try {
    console.log('🚀 Fetching latest sitemap from server...')
    
    // Determine the server URL
    const serverUrl = process.env.NODE_ENV === 'production' 
      ? 'https://api.grabatoz.ae' 
      : 'http://localhost:5000'
    
    // Fetch sitemap from server
    const response = await axios.get(`${serverUrl}/sitemap.xml`, {
      headers: {
        'Accept': 'application/xml'
      }
    })
    
    if (response.status !== 200) {
      throw new Error(`Failed to fetch sitemap: ${response.status}`)
    }
    
    // Path to save the sitemap in client public folder
    const sitemapPath = path.join(__dirname, '../../client/public/sitemap.xml')
    
    // Write the sitemap to file
    fs.writeFileSync(sitemapPath, response.data, 'utf8')
    
    console.log('✅ Sitemap updated successfully!')
    console.log(`📍 Location: ${sitemapPath}`)
    console.log(`📊 Total entries: ${(response.data.match(/<url>/g) || []).length}`)
    
  } catch (error) {
    console.error('❌ Error updating sitemap:', error.message)
    if (error.response) {
      console.error('Response status:', error.response.status)
      console.error('Response data:', error.response.data)
    }
    process.exit(1)
  }
}

// Run the update
updateSitemap()
