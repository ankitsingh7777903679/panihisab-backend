const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { getCustomers, getDeletedCustomers, addCustomer, getCustomer, updateCustomer, deleteCustomer, restoreCustomer, setOpeningBalance, deleteOpeningBalance } = require('../controllers/customerController');
const { protect, validateRequest } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/checkSubscription');

router.use(protect);

// Add customer validation
router.post('/', checkSubscription, [
  body('name').trim().isLength({ min: 2 }).withMessage('Name required'),
  body('mobile').matches(/^[0-9]{10}$/).withMessage('Valid mobile required'),
  body('pricePerCan').isFloat({ min: 0 }).withMessage('Valid price required'),
  body('address').optional().trim(),
], validateRequest, addCustomer);

// Get all or single
router.get('/deleted', getDeletedCustomers);
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('search').optional().isString().trim(),
], validateRequest, getCustomers);
router.get('/:id', [
  param('id').isMongoId().withMessage('Invalid customer ID'),
], validateRequest, getCustomer);

// Update customer
router.put('/:id', checkSubscription, [
  param('id').isMongoId(),
  body('name').optional().trim().isLength({ min: 2 }),
  body('mobile').optional().matches(/^[0-9]{10}$/),
  body('pricePerCan').optional().isFloat({ min: 0 }),
], validateRequest, updateCustomer);

// Delete customer
router.delete('/:id', checkSubscription, [
  param('id').isMongoId(),
], validateRequest, deleteCustomer);

// Restore customer
router.put('/:id/restore', checkSubscription, [
  param('id').isMongoId(),
], validateRequest, restoreCustomer);

// Opening Balance routes
router.put('/:id/opening-balance', checkSubscription, [
  param('id').isMongoId(),
  body('openingBalance').isFloat({ min: 0 }).withMessage('Valid opening balance required'),
  body('previousPaid').optional().isFloat({ min: 0 }).withMessage('Valid paid amount required'),
  body('openingBalanceNote').optional().trim(),
], validateRequest, setOpeningBalance);

router.delete('/:id/opening-balance', checkSubscription, [
  param('id').isMongoId(),
], validateRequest, deleteOpeningBalance);

module.exports = router;
