// Script to check specific equipment records in the database
// Run this with: node check-equipment.js

const { MongoClient } = require('mongodb');

// Replace with your actual MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/artistic';
const DB_NAME = 'artistic'; // Replace with your actual database name

// The equipment IDs that are causing issues
const EQUIPMENT_IDS = [
  '68eece8ea614a9b9b3331970',
  '68f16bed5a43125f454437f9'
];

async function checkEquipment() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    const equipmentCollection = db.collection('equipments'); // Note: Mongoose pluralizes collection names
    
    console.log('Checking equipment IDs:', EQUIPMENT_IDS);
    console.log('==========================================');
    
    for (const id of EQUIPMENT_IDS) {
      console.log(`\nChecking equipment ID: ${id}`);
      
      const ObjectId = require('mongodb').ObjectId;
      let equipment;
      
      try {
        equipment = await equipmentCollection.findOne({ _id: new ObjectId(id) });
      } catch (error) {
        console.log(`❌ Invalid ObjectId format: ${error.message}`);
        continue;
      }
      
      if (equipment) {
        console.log('✅ Equipment found:');
        console.log(`   Name: ${equipment.name}`);
        console.log(`   Status: ${equipment.status || 'NO_STATUS_FIELD'}`);
        console.log(`   Category: ${equipment.category}`);
        console.log(`   Price per day: $${equipment.pricePerDay}`);
      } else {
        console.log('❌ Equipment not found in database');
      }
    }
    
    // Check total equipment count and status distribution
    console.log('\n==========================================');
    console.log('Database Summary:');
    const totalEquipment = await equipmentCollection.countDocuments();
    const activeEquipment = await equipmentCollection.countDocuments({ status: 'active' });
    const inactiveEquipment = await equipmentCollection.countDocuments({ status: 'inactive' });
    const withoutStatus = await equipmentCollection.countDocuments({ status: { $exists: false } });
    
    console.log(`Total equipment: ${totalEquipment}`);
    console.log(`Active equipment: ${activeEquipment}`);
    console.log(`Inactive equipment: ${inactiveEquipment}`);
    console.log(`Without status field: ${withoutStatus}`);
    
  } catch (error) {
    console.error('Error checking equipment:', error);
  } finally {
    await client.close();
    console.log('\nDisconnected from MongoDB');
  }
}

checkEquipment().catch(console.error);