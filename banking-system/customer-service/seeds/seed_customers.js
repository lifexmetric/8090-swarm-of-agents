/**
 * Seed script — run directly with Node.js:
 *   node seeds/seed_customers.js
 *
 * Requires MONGODB_URI env var (or defaults to localhost).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/customers_db';

const customerSchema = new mongoose.Schema(
  {
    _id: { type: String },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    dateOfBirth: { type: Date },
    address: {
      street: String,
      city: String,
      province: String,
      postalCode: String,
      country: { type: String, default: 'CA' },
    },
    kyc: {
      status: {
        type: String,
        enum: ['pending', 'verified', 'rejected', 'expired'],
        default: 'pending',
      },
      verifiedAt: Date,
      documents: [
        {
          type: { type: String },
          documentId: String,
          expiresAt: Date,
          verifiedAt: Date,
        },
      ],
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'closed'],
      default: 'active',
    },
  },
  { timestamps: true }
);

const Customer = mongoose.model('Customer', customerSchema);

const now = new Date();

const customers = [
  {
    _id: '550e8400-e29b-41d4-a716-446655440001',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@bank.example.com',
    phone: '+15550001001',
    dateOfBirth: new Date('1985-03-12'),
    address: {
      street: '123 Maple Street',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M5H 2N2',
      country: 'CA',
    },
    kyc: {
      status: 'verified',
      verifiedAt: now,
      documents: [
        {
          type: 'passport',
          documentId: 'CA123456789',
          expiresAt: new Date('2030-03-12'),
          verifiedAt: now,
        },
      ],
    },
    status: 'active',
  },
  {
    _id: '550e8400-e29b-41d4-a716-446655440002',
    firstName: 'Bob',
    lastName: 'Jones',
    email: 'bob@bank.example.com',
    phone: '+15550001002',
    dateOfBirth: new Date('1979-07-22'),
    address: {
      street: '456 Oak Avenue',
      city: 'Vancouver',
      province: 'BC',
      postalCode: 'V6B 2W9',
      country: 'CA',
    },
    kyc: {
      status: 'verified',
      verifiedAt: now,
      documents: [
        {
          type: 'drivers_license',
          documentId: 'BC-DL-987654',
          expiresAt: new Date('2027-07-22'),
          verifiedAt: now,
        },
      ],
    },
    status: 'active',
  },
  {
    _id: '550e8400-e29b-41d4-a716-446655440003',
    firstName: 'Charlie',
    lastName: 'Brown',
    email: 'charlie@bank.example.com',
    phone: '+15550001003',
    dateOfBirth: new Date('1992-11-05'),
    address: {
      street: '789 Pine Road',
      city: 'Calgary',
      province: 'AB',
      postalCode: 'T2P 3C5',
      country: 'CA',
    },
    kyc: {
      status: 'pending',
      documents: [],
    },
    status: 'active',
  },
];

async function seed() {
  console.log(`[seed] Connecting to ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI);
  console.log('[seed] Connected');

  for (const data of customers) {
    const result = await Customer.findByIdAndUpdate(
      data._id,
      { $set: data },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(
      `[seed] Upserted customer: ${result.firstName} ${result.lastName} (${result._id})`
    );
  }

  console.log('[seed] Done');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});
