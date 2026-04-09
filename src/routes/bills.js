const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { getBills, generateBills, getBill, updateBillStatus, markBillAsSentViaWhatsApp } = require('../controllers/billController');
const { protect, validateRequest } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/checkSubscription');

router.use(protect);

// Generate bills validation
router.post('/generate', checkSubscription, [
  body('month').isInt({ min: 1, max: 12 }).withMessage('Valid month required'),
  body('year').isInt({ min: 2000 }).withMessage('Valid year required'),
], validateRequest, generateBills);

// Get bills with filters
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
  query('month').optional().isInt({ min: 1, max: 12 }),
  query('year').optional().isInt({ min: 2000 }),
  query('customerId').optional().isMongoId(),
], validateRequest, getBills);

// Get single bill
router.get('/:id', [
  param('id').isMongoId(),
], validateRequest, getBill);

// Update bill status
router.patch('/:id', checkSubscription, [
  param('id').isMongoId(),
  body('status').optional().isIn(['paid', 'unpaid', 'partial']).withMessage('Invalid status'),
  body('paidAmount').optional().isNumeric().withMessage('Valid paid amount required'),
  body('previousBalancePaid').optional().isNumeric().withMessage('Valid previous balance amount required'),
  body('previousBillsPaid').optional().isNumeric().withMessage('Valid previous bill dues amount required'),
  body('previousBillsAllocations').optional().isArray().withMessage('Valid previous bill allocation list required'),
  body('previousBillsAllocations.*.billId').optional().isMongoId().withMessage('Valid previous bill id required'),
  body('previousBillsAllocations.*.amount').optional().isNumeric().withMessage('Valid previous bill allocation amount required'),
], validateRequest, updateBillStatus);

// ✅ NEW: Mark bill as sent via WhatsApp
router.post('/:id/mark-sent', [
  param('id').isMongoId(),
], validateRequest, markBillAsSentViaWhatsApp);

module.exports = router;
