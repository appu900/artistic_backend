const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const candidates = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '../artistic_lms/.env.local'),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

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

async function createUser() {
  const email = (process.argv[2] || 'devsomeware@gmail.com').toLowerCase();
  const password = process.argv[3] || 'User123!';

  try {
    loadEnv();

    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI not found in environment variables');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('User already exists!');
      console.log('Email:', existingUser.email);
      console.log('Role:', existingUser.role);
      return;
    }

    const [localPart] = email.split('@');
    const firstName = localPart.charAt(0).toUpperCase() + localPart.slice(1);
    const lastName = 'User';
    const phoneNumber = `+user-${Date.now()}`;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      firstName,
      lastName,
      email,
      phoneNumber,
      passwordHash: hashedPassword,
      role: 'USER',
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: false,
    });

    await user.save();
    console.log('User created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role: USER');
  } catch (error) {
    console.error('Error creating user:', error.message);
    if (error.code === 11000) {
      console.log('User with this email or phone number already exists');
    }
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createUser();
