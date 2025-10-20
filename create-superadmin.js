const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phoneNumber: { type: String, required: true, unique: true },
  role: { type: String, enum: ['USER', 'ARTIST', 'ADMIN', 'SUPER_ADMIN', 'VENUE_OWNER', 'EQUIPMENT_PROVIDER'], default: 'USER' },
  roleProfile: { type: mongoose.Schema.Types.ObjectId },
  roleProfileRef: { type: String, enum: ['ArtistProfile', 'VenueOwnerProfile', 'EquipmentProviderProfile'] },
  isActive: { type: Boolean, default: true },
  permissions: { type: [String], default: [] },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  otp: { type: String, default: null },
  otpExpiry: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
  tempPassword: { type: String, default: null },
  profilePicture: { type: String, default: null },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

async function createSuperAdmin() {
  try {
    // Load environment variables
    require('dotenv').config();
    
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI not found in environment variables');
    }
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ role: 'SUPER_ADMIN' });
    if (existingSuperAdmin) {
      console.log('Super admin already exists!');
      console.log('Email:', existingSuperAdmin.email);
      return;
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    
    const superAdmin = new User({
      firstName: 'Super',
      lastName: 'Admin',
      email: 'superadmin@artistic.com',
      phoneNumber: '+1234567880',
      passwordHash: hashedPassword,
      role: 'SUPER_ADMIN',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: false
    });
    
    await superAdmin.save();
    console.log('✅ Super admin created successfully!');
    console.log('📧 Email: superadmin@artistic.com');
    console.log('🔑 Password: admin123');
    console.log('');
    console.log('🚀 You can now login to test the super admin features!');
    
  } catch (error) {
    console.error('❌ Error creating super admin:', error.message);
    if (error.code === 11000) {
      console.log('User with this email or phone number already exists');
    }
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createSuperAdmin();