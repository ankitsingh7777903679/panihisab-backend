const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { getDeliveries, getTodayDeliveries, addDelivery, deleteEntry, updateEntry } = require('../controllers/deliveryController');
const { protect, validateRequest } = require('../middleware/auth');
const { checkSubscription } = require('../middleware/checkSubscription');

router.use(protect);

// Add a new can entry (creates day-doc if it doesn't exist for that date)
router.post('/', checkSubscription, [
  body('customerId').isMongoId().withMessage('Valid customer required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be positive'),
  body('date').optional().isISO8601().withMessage('Valid date required'),
], validateRequest, addDelivery);

// Get deliveries with optional filters
router.get('/', [
  query('date').optional().isISO8601(),
  query('month').optional().isInt({ min: 1, max: 12 }),
  query('year').optional().isInt({ min: 2000 }),
], validateRequest, getDeliveries);

router.get('/today', getTodayDeliveries);

// Update a specific entry within a day-doc
router.put('/:docId/entries/:entryId', checkSubscription, [
  param('docId').isMongoId(),
  param('entryId').isMongoId(),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be positive'),
], validateRequest, updateEntry);

// Delete a specific entry within a day-doc
router.delete('/:docId/entries/:entryId', checkSubscription, [
  param('docId').isMongoId(),
  param('entryId').isMongoId(),
], validateRequest, deleteEntry);

module.exports = router;
