import mongoose from 'mongoose';
import Category from '../models/categoryModel.js';
import SubCategory from '../models/subCategoryModel.js';
import config from '../config/config.js';

// Function to create a slug from text
const createSlug = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

// Function to ensure unique slug
const ensureUniqueSlug = async (baseSlug, model, excludeId = null) => {
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const query = { slug };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    
    const existing = await model.findOne(query);
    if (!existing) {
      return slug;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
};

// Update categories with slugs
const updateCategorySlugs = async () => {
  try {
    console.log('Updating category slugs...');
    
    const categories = await Category.find({});
    
    for (const category of categories) {
      if (!category.slug || category.slug.trim() === '') {
        const baseSlug = createSlug(category.name);
        const uniqueSlug = await ensureUniqueSlug(baseSlug, Category, category._id);
        
        await Category.findByIdAndUpdate(category._id, { slug: uniqueSlug });
        console.log(`Updated category "${category.name}" with slug: ${uniqueSlug}`);
      }
    }
    
    console.log('Category slugs updated successfully!');
  } catch (error) {
    console.error('Error updating category slugs:', error);
  }
};

// Update subcategories with slugs
const updateSubCategorySlugs = async () => {
  try {
    console.log('Updating subcategory slugs...');
    
    const subcategories = await SubCategory.find({});
    
    for (const subcategory of subcategories) {
      if (!subcategory.slug || subcategory.slug.trim() === '') {
        const baseSlug = createSlug(subcategory.name);
        const uniqueSlug = await ensureUniqueSlug(baseSlug, SubCategory, subcategory._id);
        
        await SubCategory.findByIdAndUpdate(subcategory._id, { slug: uniqueSlug });
        console.log(`Updated subcategory "${subcategory.name}" with slug: ${uniqueSlug}`);
      }
    }
    
    console.log('Subcategory slugs updated successfully!');
  } catch (error) {
    console.error('Error updating subcategory slugs:', error);
  }
};

// Main function
const main = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Update slugs
    await updateCategorySlugs();
    await updateSubCategorySlugs();
    
    console.log('All slugs updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

// Run the script
main(); 