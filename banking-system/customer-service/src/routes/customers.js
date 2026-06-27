const { randomUUID } = require('crypto');
const express = require('express');
const Joi = require('joi');

const Customer = require('../models/Customer');
const { getAccountsByCustomer } = require('../clients/accountsClient');

const router = express.Router();

// ── Joi validation schema for customer creation ──────────────────────────────
const createCustomerSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().optional(),
  dateOfBirth: Joi.date().optional(),
  address: Joi.object({
    street: Joi.string().optional(),
    city: Joi.string().optional(),
    province: Joi.string().optional(),
    postalCode: Joi.string().optional(),
    country: Joi.string().optional(),
  }).optional(),
});

// ── GET /customers/:id ────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Enrich with linked accounts (best-effort — don't fail if unavailable)
    const accounts = await getAccountsByCustomer(
      customer._id,
      customer.firstName
    );

    return res.json({ ...customer, accounts });
  } catch (err) {
    next(err);
  }
});

// ── POST /customers ───────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createCustomerSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map((d) => d.message),
      });
    }

    const customer = new Customer({
      _id: randomUUID(),
      ...value,
    });

    await customer.save();
    return res.status(201).json(customer.toObject());
  } catch (err) {
    // Duplicate email
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ error: 'A customer with this email already exists' });
    }
    next(err);
  }
});

// ── PUT /customers/:id/kyc ────────────────────────────────────────────────────
router.put('/:id/kyc', async (req, res, next) => {
  try {
    const { status, documents } = req.body;

    const allowedStatuses = ['pending', 'verified', 'rejected', 'expired'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid KYC status. Must be one of: ${allowedStatuses.join(', ')}`,
      });
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    customer.kyc.status = status;

    if (status === 'verified') {
      customer.kyc.verifiedAt = new Date();
    }

    if (Array.isArray(documents)) {
      customer.kyc.documents = documents;
    }

    await customer.save();
    return res.json(customer.toObject());
  } catch (err) {
    next(err);
  }
});

// ── GET /customers/:id/accounts ───────────────────────────────────────────────
router.get('/:id/accounts', async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const accounts = await getAccountsByCustomer(
      customer._id,
      customer.firstName
    );

    return res.json(accounts);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
