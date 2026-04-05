import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/graba2z';

// HomeSection Schema
const homeSectionSchema = new mongoose.Schema({
  name: String,
  slug: String,
  key: String,
  description: String,
  isActive: Boolean,
  order: Number,
  position: String,
  sectionType: String,
  settings: mongoose.Schema.Types.Mixed,
});

const HomeSection = mongoose.model('HomeSection', homeSectionSchema);

async function addPositionToSections() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully!');

    // Get all sections
    const sections = await HomeSection.find({});
    console.log(`Found ${sections.length} sections`);

    if (sections.length === 0) {
      console.log('No sections found. Nothing to update.');
      await mongoose.connection.close();
      return;
    }

    // Update sections without position field
    let updatedCount = 0;
    for (const section of sections) {
      if (!section.position) {
        // Default: put existing sections in 'middle' position
        section.position = 'middle';
        await section.save();
        updatedCount++;
        console.log(`✓ Updated section: ${section.name} - Position set to 'middle'`);
      }
    }

    console.log(`\n✅ Migration completed!`);
    console.log(`   Total sections: ${sections.length}`);
    console.log(`   Updated sections: ${updatedCount}`);
    console.log(`   Already had position: ${sections.length - updatedCount}`);

    await mongoose.connection.close();
    console.log('\nDatabase connection closed.');
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  }
}

addPositionToSections();
