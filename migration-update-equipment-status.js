// One-time migration script to add status field to existing equipment
// Run this with: node migration-update-equipment-status.js

const { MongoClient } = require('mongodb');

// Replace with your actual MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/artistic';
const DB_NAME = 'artistic'; // Replace with your actual database name

async function updateEquipmentStatus() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    const equipmentCollection = db.collection('equipments'); // Note: Mongoose pluralizes collection names
    
    // Update all equipment documents that don't have a status field
    const result = await equipmentCollection.updateMany(
      { status: { $exists: false } }, // Find documents without status field
      { $set: { status: 'active' } }  // Set status to 'active'
    );
    
    console.log(`Updated ${result.modifiedCount} equipment records with status field`);
    
    // Verify the update
    const totalEquipment = await equipmentCollection.countDocuments();
    const activeEquipment = await equipmentCollection.countDocuments({ status: 'active' });
    const inactiveEquipment = await equipmentCollection.countDocuments({ status: 'inactive' });
    const withoutStatus = await equipmentCollection.countDocuments({ status: { $exists: false } });
    
    console.log('\nStatus Summary:');
    console.log(`Total equipment: ${totalEquipment}`);
    console.log(`Active equipment: ${activeEquipment}`);
    console.log(`Inactive equipment: ${inactiveEquipment}`);
    console.log(`Without status field: ${withoutStatus}`);
    
    if (withoutStatus === 0) {
      console.log('✅ All equipment records now have a status field!');
    } else {
      console.log('⚠️  Some equipment records still missing status field');
    }
    
  } catch (error) {
    console.error('Error updating equipment status:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

updateEquipmentStatus().catch(console.error);