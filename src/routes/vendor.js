const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, getDashboard } = require('../controllers/vendorController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/dashboard', getDashboard);
router.route('/profile').get(getProfile).put(updateProfile);

module.exports = router;
