const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { getDeliveries, getTodayDeliveries, addDelivery, deleteDelivery, updateDelivery } = require('../controllers/deliveryController');
const { protect, validateRequest } = require('../middleware/auth');

router.use(protect);

// Add delivery validation
router.post('/', [
  body('customerId').isMongoId().withMessage('Valid customer required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be positive'),
  body('date').optional().isISO8601().withMessage('Valid date required'),
], validateRequest, addDelivery);

// Get deliveries with filters
router.get('/', [
  query('date').optional().isISO8601(),
  query('month').optional().isInt({ min: 1, max: 12 }),
  query('year').optional().isInt({ min: 2000 }),
], validateRequest, getDeliveries);

router.get('/today', getTodayDeliveries);

// Update delivery quantity
router.put('/:id', [
  param('id').isMongoId(),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be positive'),
], validateRequest, updateDelivery);

router.delete('/:id', [
  param('id').isMongoId(),
], validateRequest, deleteDelivery);

module.exports = router;
