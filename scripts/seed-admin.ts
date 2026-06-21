import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
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
    if (!process.env[key]) process.env[key] = value;
  }
}

const ADMIN = {
  email: 'admin@gmail.com',
  password: 'Admin@12345',
  firstName: 'Admin',
  lastName: 'User',
  phoneNumber: '96550000001',
  role: 'ADMIN',
};

async function seedAdmin() {
  loadEnv();

  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || 'artisticDev';

  if (!uri) {
    throw new Error('MONGO_URI is not set in .env');
  }

  await mongoose.connect(uri, { dbName });

  const users = mongoose.connection.collection('users');
  const existing = await users.findOne({ email: ADMIN.email.toLowerCase() });

  const passwordHash = await bcrypt.hash(ADMIN.password, 10);

  if (existing) {
    await users.updateOne(
      { _id: existing._id },
      {
        $set: {
          passwordHash,
          role: ADMIN.role,
          firstName: ADMIN.firstName,
          lastName: ADMIN.lastName,
          isActive: true,
          isEmailVerified: true,
        },
      },
    );
    console.log('Updated existing admin user.');
  } else {
    await users.insertOne({
      email: ADMIN.email.toLowerCase(),
      passwordHash,
      firstName: ADMIN.firstName,
      lastName: ADMIN.lastName,
      phoneNumber: ADMIN.phoneNumber,
      role: ADMIN.role,
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: false,
      permissions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Created admin user.');
  }

  console.log('\nAdmin login credentials:');
  console.log(`  Email:    ${ADMIN.email}`);
  console.log(`  Password: ${ADMIN.password}`);
  console.log(`  Role:     ${ADMIN.role}`);

  await mongoose.disconnect();
}

seedAdmin().catch((err) => {
  console.error('Failed to seed admin:', err);
  process.exit(1);
});
