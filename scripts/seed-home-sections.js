import HomeSection from '../models/homeSectionModel.js';
import connectDB from '../config/db.js';
import dotenv from 'dotenv';

dotenv.config();

const defaultSections = [
  {
    name: 'Category Cards',
    slug: 'home-category-cards',
    key: 'categoryCards',
    description: 'Display category banner cards section',
    isActive: true,
    order: 1,
    sectionType: 'banner-cards',
  },
  {
    name: 'Brands Cards',
    slug: 'home-brands-cards',
    key: 'brandsCards',
    description: 'Display brand banner cards section',
    isActive: true,
    order: 2,
    sectionType: 'banner-cards',
  },
  {
    name: 'Products Cards',
    slug: 'home-products-cards',
    key: 'productsCards',
    description: 'Display product banner cards section',
    isActive: true,
    order: 3,
    sectionType: 'banner-cards',
  },
  {
    name: 'Flash Sale Cards',
    slug: 'home-flash-sale-cards',
    key: 'flashSaleCards',
    description: 'Display flash sale banner cards section',
    isActive: true,
    order: 4,
    sectionType: 'banner-cards',
  },
  {
    name: 'Limited Sale Cards',
    slug: 'home-limited-sale-cards',
    key: 'limitedSaleCards',
    description: 'Display limited sale banner cards section',
    isActive: true,
    order: 5,
    sectionType: 'banner-cards',
  },
];

const seedHomeSections = async () => {
  try {
    await connectDB();

    console.log('🌱 Seeding home sections...');

    // Check if sections already exist
    const existingSections = await HomeSection.find({});
    
    if (existingSections.length > 0) {
      console.log(`⚠️  ${existingSections.length} sections already exist. Skipping seed.`);
      console.log('To reseed, delete existing sections first.');
      process.exit(0);
    }

    // Create default sections
    const createdSections = await HomeSection.insertMany(defaultSections);
    
    console.log('✅ Successfully created default home sections:');
    createdSections.forEach(section => {
      console.log(`   - ${section.name} (${section.slug})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding home sections:', error);
    process.exit(1);
  }
};

seedHomeSections();
