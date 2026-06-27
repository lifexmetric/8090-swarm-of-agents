const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    type: { type: String }, // 'passport', 'drivers_license', 'sin'
    documentId: String,
    expiresAt: Date,
    verifiedAt: Date,
  },
  { _id: false }
);

const kycSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'expired'],
      default: 'pending',
    },
    verifiedAt: Date,
    documents: [documentSchema],
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    street: String,
    city: String,
    province: String,
    postalCode: String,
    country: { type: String, default: 'CA' },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    _id: { type: String },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    dateOfBirth: { type: Date },
    address: addressSchema,
    kyc: { type: kycSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ['active', 'suspended', 'closed'],
      default: 'active',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
