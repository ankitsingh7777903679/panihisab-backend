const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { register, login, getMe } = require('../controllers/authController');
const { protect, validateRequest } = require('../middleware/auth');

// Register validation
router.post('/register', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('mobile').matches(/^[0-9]{10}$/).withMessage('Mobile must be 10 digits'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('businessName').optional().trim(),
], validateRequest, register);

// Login validation
router.post('/login', [
  body('password').isLength({ min: 6 }).withMessage('Invalid credentials'),
  body().custom((value, { req }) => {
    if (!req.body.mobile && !req.body.email) {
      throw new Error('Email or mobile required');
    }
    return true;
  }),
], validateRequest, login);

router.get('/me', protect, getMe);

module.exports = router;
