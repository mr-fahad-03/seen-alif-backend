import mongoose from "mongoose";
import dotenv from "dotenv";
import slugify from "slugify";
import bcrypt from "bcryptjs";

import User from "../models/userModel.js";
import Product from "../models/productModel.js";
import Category from "../models/categoryModel.js";
import Brand from "../models/brandModel.js";

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const seedData = async () => {
  try {
    await connectDB();

    // Clear existing data
    await User.deleteMany({});
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Brand.deleteMany({});

    // Create sample user (admin)
    const hashedPassword = await bcrypt.hash("123456", 10);
    const users = [
      {
        name: "John Doe",
        email: "john@example.com",
        password: hashedPassword,
        phone: "+1234567890",
        address: "123 Main St, New York, NY 10001",
      },
    ];
    const [adminUser] = await User.insertMany(users);
    console.log(`1 user created`);

    // Create sample categories with slug and createdBy
    const categories = [
      { name: "Electronics", description: "Electronic devices and gadgets" },
      { name: "Computers", description: "Laptops, desktops, and accessories" },
      { name: "Mobile Phones", description: "Smartphones and accessories" },
      { name: "Accessories", description: "Various tech accessories" },
      { name: "Gaming", description: "Gaming devices and accessories" },
    ];

    const categoriesWithSlugs = categories.map((category) => ({
      ...category,
      slug: slugify(category.name, { lower: true, strict: true }),
      createdBy: adminUser._id,
    }));

    const createdCategories = await Category.insertMany(categoriesWithSlugs);
    console.log(`${createdCategories.length} categories created`);

    // Create sample brands with slug and createdBy
    const brands = [
      { name: "Apple", description: "Premium technology products" },
      { name: "Samsung", description: "Innovative electronics" },
      { name: "Dell", description: "Computer technology solutions" },
      { name: "HP", description: "Computing and printing solutions" },
      { name: "Asus", description: "Computer hardware and electronics" },
      { name: "Sony", description: "Entertainment and technology" },
    ];

    const brandsWithSlugsAndCreatedBy = brands.map((brand) => ({
      ...brand,
      slug: slugify(brand.name, { lower: true, strict: true }),
      createdBy: adminUser._id,
    }));

    const createdBrands = await Brand.insertMany(brandsWithSlugsAndCreatedBy);
    console.log(`${createdBrands.length} brands created`);

    // Create sample products with slug, brand as string, and createdBy
    const products = [
      {
        name: "iPhone 15 Pro",
        description: "Latest iPhone with advanced features",
        price: 999,
        offerPrice: 899,
        buyingPrice: 850,
        category: createdCategories.find(c => c.name === "Mobile Phones")._id,
        brand: "Apple",
        image: "/placeholder.svg?height=300&width=300",
        countInStock: 50,
        stockStatus: "In Stock",
        sku: "IPH15PRO001",
        barcode: "123456789001",
        createdBy: adminUser._id,
      },
      {
        name: "Samsung Galaxy S24",
        description: "Premium Android smartphone",
        price: 899,
        offerPrice: 799,
        buyingPrice: 750,
        category: createdCategories.find(c => c.name === "Mobile Phones")._id,
        brand: "Samsung",
        image: "/placeholder.svg?height=300&width=300",
        countInStock: 30,
        stockStatus: "In Stock",
        sku: "SAM24001",
        barcode: "123456789002",
        createdBy: adminUser._id,
      },
      {
        name: "Dell XPS 13",
        description: "Ultra-portable laptop",
        price: 1299,
        offerPrice: 1199,
        buyingPrice: 1100,
        category: createdCategories.find(c => c.name === "Computers")._id,
        brand: "Dell",
        image: "/placeholder.svg?height=300&width=300",
        countInStock: 0,
        stockStatus: "Out of Stock",
        sku: "DELLXPS13001",
        barcode: "123456789003",
        createdBy: adminUser._id,
      },
    ];

    // Add slug to products
    const productsWithSlugs = products.map((product) => ({
      ...product,
      slug: slugify(product.name, { lower: true, strict: true }),
    }));

    const createdProducts = await Product.insertMany(productsWithSlugs);
    console.log(`${createdProducts.length} products created`);

    console.log("Seeding completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
};

seedData();
