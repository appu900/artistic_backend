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

const USER = {
  email: 'user@gmail.com',
  password: 'User@12345',
  firstName: 'Test',
  lastName: 'User',
  phoneNumber: '96550000002',
  role: 'USER',
};

async function seedUser() {
  loadEnv();

  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || 'artisticDev';

  if (!uri) {
    throw new Error('MONGO_URI is not set in .env');
  }

  await mongoose.connect(uri, { dbName });

  const users = mongoose.connection.collection('users');
  const existing = await users.findOne({ email: USER.email.toLowerCase() });

  const passwordHash = await bcrypt.hash(USER.password, 10);

  if (existing) {
    await users.updateOne(
      { _id: existing._id },
      {
        $set: {
          passwordHash,
          role: USER.role,
          firstName: USER.firstName,
          lastName: USER.lastName,
          isActive: true,
          isEmailVerified: true,
        },
      },
    );
    console.log('Updated existing user.');
  } else {
    await users.insertOne({
      email: USER.email.toLowerCase(),
      passwordHash,
      firstName: USER.firstName,
      lastName: USER.lastName,
      phoneNumber: USER.phoneNumber,
      role: USER.role,
      isActive: true,
      isEmailVerified: true,
      isPhoneVerified: false,
      permissions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Created user.');
  }

  console.log('\nUser login credentials:');
  console.log(`  Email:    ${USER.email}`);
  console.log(`  Password: ${USER.password}`);
  console.log(`  Role:     ${USER.role}`);

  await mongoose.disconnect();
}

seedUser().catch((err) => {
  console.error('Failed to seed user:', err);
  process.exit(1);
});
