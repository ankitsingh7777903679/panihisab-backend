const Delivery = require('../models/Delivery');

const getDeliveries = async (req, res) => {
  try {
    const { date, month, year, customerId } = req.query;
    const filter = { vendorId: req.user.id };
    
    if (date) {
      const d = new Date(date);
      filter.date = {
        $gte: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0),
        $lte: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59),
      };
    } else if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      filter.date = {
        $gte: new Date(y, m - 1, 1, 0, 0, 0),
        $lte: new Date(y, m, 0, 23, 59, 59)
      };
    }
    
    if (customerId) filter.customerId = customerId;
    const deliveries = await Delivery.find(filter)
      .populate('customerId', 'name mobile address pricePerCan')
      .sort({ date: -1 });
    res.json({ success: true, count: deliveries.length, deliveries });
  } catch (error) {
    console.error('❌ GetDeliveries error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch deliveries.' });
  }
};

const getTodayDeliveries = async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const deliveries = await Delivery.find({ vendorId: req.user.id, date: { $gte: start, $lte: end } })
      .populate('customerId', 'name mobile address pricePerCan')
      .sort({ createdAt: -1 });
    const totalCans = deliveries.reduce((sum, d) => sum + d.quantity, 0);
    res.json({ success: true, count: deliveries.length, totalCans, deliveries });
  } catch (error) {
    console.error('❌ GetTodayDeliveries error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch today deliveries.' });
  }
};

const addDelivery = async (req, res) => {
  try {
    const { customerId, quantity, date } = req.body;
    if (!customerId || !quantity) {
      return res.status(400).json({ success: false, message: 'Customer and quantity are required.' });
    }
    
    // Normalize date to remove time component
    const deliveryDate = date ? new Date(date) : new Date();
    const normalizedDate = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth(), deliveryDate.getDate(), 0, 0, 0);
    
    // Check if entry exists for same customer on same date
    const existingDelivery = await Delivery.findOne({
      vendorId: req.user.id,
      customerId,
      date: {
        $gte: normalizedDate,
        $lte: new Date(normalizedDate.getTime() + 86400000 - 1) // Same day
      }
    });
    
    let delivery;
    if (existingDelivery) {
      // Update existing entry - increment quantity
      existingDelivery.quantity += parseInt(quantity);
      delivery = await existingDelivery.save();
    } else {
      // Create new entry
      delivery = await Delivery.create({
        vendorId: req.user.id,
        customerId,
        quantity,
        date: normalizedDate,
      });
    }
    
    const populated = await delivery.populate('customerId', 'name mobile address pricePerCan');
    res.status(existingDelivery ? 200 : 201).json({ success: true, delivery: populated, merged: !!existingDelivery });
  } catch (error) {
    console.error('❌ AddDelivery error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to add delivery.' });
  }
};

const deleteDelivery = async (req, res) => {
  try {
    const delivery = await Delivery.findOneAndDelete({ _id: req.params.id, vendorId: req.user.id });
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    res.json({ success: true, message: 'Delivery deleted.' });
  } catch (error) {
    console.error('❌ DeleteDelivery error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete delivery.' });
  }
};

const updateDelivery = async (req, res) => {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1.' });
    }
    
    const delivery = await Delivery.findOneAndUpdate(
      { _id: req.params.id, vendorId: req.user.id },
      { quantity: parseInt(quantity) },
      { new: true }
    ).populate('customerId', 'name mobile address pricePerCan');
    
    if (!delivery) return res.status(404).json({ success: false, message: 'Delivery not found.' });
    res.json({ success: true, delivery });
  } catch (error) {
    console.error('❌ UpdateDelivery error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update delivery.' });
  }
};

module.exports = { getDeliveries, getTodayDeliveries, addDelivery, deleteDelivery, updateDelivery };
