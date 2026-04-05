import dotenv from 'dotenv'
import connectDB from '../config/db.js'
import Product from '../models/productModel.js'

dotenv.config()

const generateSafeSlug = (name) => {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, '-and-')
    .replace(/["'’`]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function run() {
  await connectDB()
  console.log('Scanning products for invalid/missing/duplicate slugs...')

  const products = await Product.find({}).select('_id name slug').lean()

  const seen = new Map() // slug -> productIds
  const issues = { missing: [], empty: [], unsafe: [], duplicate: [] }

  for (const p of products) {
    const original = p.slug
    if (original === undefined) {
      issues.missing.push({ _id: p._id, name: p.name, suggested: generateSafeSlug(p.name) })
      continue
    }
    if (original === null || original === '') {
      issues.empty.push({ _id: p._id, name: p.name, suggested: generateSafeSlug(p.name) })
      continue
    }
    const safe = generateSafeSlug(original)
    if (safe !== original) {
      issues.unsafe.push({ _id: p._id, name: p.name, slug: original, suggested: safe })
    }
    if (!seen.has(original)) seen.set(original, [])
    seen.get(original).push(p._id)
  }

  for (const [slug, ids] of seen.entries()) {
    if (ids.length > 1) {
      issues.duplicate.push({ slug, count: ids.length, ids })
    }
  }

  console.log('Slug scan results:')
  console.log(JSON.stringify(issues, null, 2))
  console.log('\nSummary:')
  console.log(' Missing:', issues.missing.length)
  console.log(' Empty:', issues.empty.length)
  console.log(' Unsafe:', issues.unsafe.length)
  console.log(' Duplicate groups:', issues.duplicate.length)

  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
