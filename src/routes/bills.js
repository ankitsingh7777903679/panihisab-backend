const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { getBills, generateBills, getBill, updateBillStatus } = require('../controllers/billController');
const { protect, validateRequest } = require('../middleware/auth');

router.use(protect);

// Generate bills validation
router.post('/generate', [
  body('month').isInt({ min: 1, max: 12 }).withMessage('Valid month required'),
  body('year').isInt({ min: 2000 }).withMessage('Valid year required'),
], validateRequest, generateBills);

// Get bills with filters
router.get('/', [
  query('month').optional().isInt({ min: 1, max: 12 }),
  query('year').optional().isInt({ min: 2000 }),
  query('customerId').optional().isMongoId(),
], validateRequest, getBills);

// Get single bill
router.get('/:id', [
  param('id').isMongoId(),
], validateRequest, getBill);

// Update bill status
router.patch('/:id', [
  param('id').isMongoId(),
  body('status').isIn(['paid', 'unpaid']).withMessage('Status must be paid or unpaid'),
], validateRequest, updateBillStatus);

module.exports = router;
