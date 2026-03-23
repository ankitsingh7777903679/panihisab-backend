const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { getCustomers, addCustomer, getCustomer, updateCustomer, deleteCustomer } = require('../controllers/customerController');
const { protect, validateRequest } = require('../middleware/auth');

router.use(protect);

// Add customer validation
router.post('/', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name required'),
  body('mobile').matches(/^[0-9]{10}$/).withMessage('Valid mobile required'),
  body('pricePerCan').isFloat({ min: 0 }).withMessage('Valid price required'),
  body('address').optional().trim(),
], validateRequest, addCustomer);

// Get all or single
router.get('/', getCustomers);
router.get('/:id', [
  param('id').isMongoId().withMessage('Invalid customer ID'),
], validateRequest, getCustomer);

// Update customer
router.put('/:id', [
  param('id').isMongoId(),
  body('name').optional().trim().isLength({ min: 2 }),
  body('mobile').optional().matches(/^[0-9]{10}$/),
  body('pricePerCan').optional().isFloat({ min: 0 }),
], validateRequest, updateCustomer);

// Delete customer
router.delete('/:id', [
  param('id').isMongoId(),
], validateRequest, deleteCustomer);

module.exports = router;
