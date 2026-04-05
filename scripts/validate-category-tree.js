import dotenv from 'dotenv'
import connectDB from '../config/db.js'
import Category from '../models/categoryModel.js'
import SubCategory from '../models/subCategoryModel.js'

dotenv.config()

const run = async () => {
  await connectDB()

  const cats = await Category.find({}).select('_id name').lean()
  const subs = await SubCategory.find({}).select('_id name category parentSubCategory isActive isDeleted').lean()

  const catIds = new Set(cats.map(c => String(c._id)))
  const subMap = new Map(subs.map(s => [String(s._id), s]))

  
  const issues = { missingCategory: [], missingParent: [], selfParent: [], cycles: [] }

  // Referential checks
  for (const s of subs) {
    const sid = String(s._id)
    if (s.category && !catIds.has(String(s.category))) {
      issues.missingCategory.push({ _id: sid, name: s.name, category: String(s.category) })
    }
    if (s.parentSubCategory) {
      const pid = String(s.parentSubCategory)
      if (pid === sid) issues.selfParent.push({ _id: sid, name: s.name })
      if (!subMap.has(pid)) issues.missingParent.push({ _id: sid, name: s.name, parentSubCategory: pid })
    }
  }

  // Cycle detection (DFS)
  const visited = new Set()
  const stack = new Set()

  const getChildren = (id) => {
    const children = []
    for (const s of subs) {
      if (s.parentSubCategory && String(s.parentSubCategory) === id) children.push(String(s._id))
    }
    return children
  }

  const path = []
  const dfs = (id) => {
    if (stack.has(id)) {
      const idx = path.indexOf(id)
      issues.cycles.push(path.slice(idx).concat(id))
      return
    }
    if (visited.has(id)) return
    visited.add(id)
    stack.add(id)
    path.push(id)
    for (const child of getChildren(id)) dfs(child)
    path.pop()
    stack.delete(id)
  }

  for (const s of subs) dfs(String(s._id))

  console.log('Category tree validation results:')
  console.log(JSON.stringify(issues, null, 2))

  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
