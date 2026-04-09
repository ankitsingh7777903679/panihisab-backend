const Delivery = require('../models/Delivery');

// Helper: normalize any date to UTC midnight of that day (timezone-safe)
const toMidnight = (d) => {
  const dt = new Date(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0, 0, 0, 0));
};

// GET /api/deliveries?date=&month=&year=&customerId=&page=&limit=
const getDeliveries = async (req, res) => {
  try {
    const { date, month, year, customerId, page = 1, limit = 20 } = req.query;
    const filter = { vendorId: req.user.id };
    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);
    const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
    const skip = (safePage - 1) * safeLimit;

    if (date) {
      const midnight = toMidnight(date);
      filter.date = midnight;
    } else if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      filter.date = {
        $gte: new Date(Date.UTC(y, m - 1, 1)),
        $lte: new Date(Date.UTC(y, m, 0, 23, 59, 59)),
      };
    }

    if (customerId) filter.customerId = customerId;

    const total = await Delivery.countDocuments(filter);

    const deliveries = await Delivery.find(filter)
      .populate('customerId', 'name mobile address pricePerCan')
      .sort({ date: -1 })
      .skip(skip)
      .limit(safeLimit);

    res.json({
      success: true,
      count: deliveries.length,
      total,
      page: safePage,
      pages: Math.max(1, Math.ceil(total / safeLimit)),
      limit: safeLimit,
      deliveries,
    });
  } catch (error) {
    console.error('❌ GetDeliveries error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch deliveries.' });
  }
};

// GET /api/deliveries/today
const getTodayDeliveries = async (req, res) => {
  try {
    const midnight = toMidnight(new Date());
    const deliveries = await Delivery.find({ vendorId: req.user.id, date: midnight })
      .populate('customerId', 'name mobile address pricePerCan')
      .sort({ 'entries.time': -1 });

    const totalCans = deliveries.reduce((sum, d) => sum + d.totalQuantity, 0);
    res.json({ success: true, count: deliveries.length, totalCans, deliveries });
  } catch (error) {
    console.error('❌ GetTodayDeliveries error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch today deliveries.' });
  }
};

// POST /api/deliveries — add a new entry to the day's document (creates doc if first entry)
const addDelivery = async (req, res) => {
  try {
    const { customerId, quantity, date } = req.body;
    if (!customerId || !quantity) {
      return res.status(400).json({ success: false, message: 'Customer and quantity are required.' });
    }

    const midnight = toMidnight(date ? new Date(date) : new Date());
    const qty = parseInt(quantity);
    const newEntry = { quantity: qty, time: new Date() };

    // Upsert: find the one doc for this customer+date, push the new entry, add to total
    const delivery = await Delivery.findOneAndUpdate(
      { vendorId: req.user.id, customerId, date: midnight },
      {
        $push: { entries: newEntry },
        $inc:  { totalQuantity: qty },
      },
      { upsert: true, new: true, returnDocument: 'after' }
    ).populate('customerId', 'name mobile address pricePerCan');

    res.status(201).json({ success: true, delivery });
  } catch (error) {
    console.error('❌ AddDelivery error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to add delivery.' });
  }
};

// DELETE /api/deliveries/:docId/entries/:entryId — remove one entry from a day-doc
const deleteEntry = async (req, res) => {
  try {
    const { docId, entryId } = req.params;

    // Find the doc first to get the entry's quantity (so we can decrement totalQuantity)
    const doc = await Delivery.findOne({ _id: docId, vendorId: req.user.id });
    if (!doc) return res.status(404).json({ success: false, message: 'Delivery not found.' });

    const entry = doc.entries.id(entryId);
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found.' });

    const entryQty = entry.quantity;

    // If this was the only entry, delete the whole document
    if (doc.entries.length === 1) {
      await Delivery.deleteOne({ _id: docId });
      return res.json({ success: true, deleted: true, message: 'Delivery record removed.' });
    }

    // Otherwise just remove this entry and update the total
    await Delivery.findByIdAndUpdate(docId, {
      $pull: { entries: { _id: entryId } },
      $inc:  { totalQuantity: -entryQty },
    });

    res.json({ success: true, deleted: false, message: 'Entry deleted.' });
  } catch (error) {
    console.error('❌ DeleteEntry error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete entry.' });
  }
};

// PUT /api/deliveries/:docId/entries/:entryId — update quantity of one entry
const updateEntry = async (req, res) => {
  try {
    const { docId, entryId } = req.params;
    const { quantity } = req.body;
    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1.' });
    }

    const doc = await Delivery.findOne({ _id: docId, vendorId: req.user.id });
    if (!doc) return res.status(404).json({ success: false, message: 'Delivery not found.' });

    const entry = doc.entries.id(entryId);
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found.' });

    const diff = parseInt(quantity) - entry.quantity;
    entry.quantity = parseInt(quantity);
    doc.totalQuantity += diff;
    await doc.save();

    await doc.populate('customerId', 'name mobile address pricePerCan');
    res.json({ success: true, delivery: doc });
  } catch (error) {
    console.error('❌ UpdateEntry error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update entry.' });
  }
};

// POST /api/deliveries/batch — process multiple adds/deletes in one request
const batchDeliveries = async (req, res) => {
  try {
    const { date, changes } = req.body;
    const vendorId = req.user.id;
    const midnight = toMidnight(date ? new Date(date) : new Date());
    
    const results = { added: 0, deleted: 0, errors: [] };
    
    // Process all changes
    for (const change of changes) {
      try {
        if (change.type === 'add') {
          const { customerId, quantity } = change;
          const qty = parseInt(quantity);
          const newEntry = { quantity: qty, time: new Date() };
          
          // Upsert: find the one doc for this customer+date, push the new entry
          await Delivery.findOneAndUpdate(
            { vendorId, customerId, date: midnight },
            {
              $push: { entries: newEntry },
              $inc: { totalQuantity: qty },
            },
            { upsert: true, new: true }
          );
          results.added++;
          
        } else if (change.type === 'delete') {
          const { docId, entryId } = change;
          
          // Find the document
          const doc = await Delivery.findOne({ _id: docId, vendorId });
          if (!doc) continue;
          
          // Find the entry to get its quantity
          const entry = doc.entries.find(e => e._id.toString() === entryId);
          if (!entry) continue;
          
          // Pull the entry and decrement total
          await Delivery.findOneAndUpdate(
            { _id: docId, vendorId },
            {
              $pull: { entries: { _id: entryId } },
              $inc: { totalQuantity: -entry.quantity },
            }
          );
          results.deleted++;
        }
      } catch (err) {
        results.errors.push({ change, error: err.message });
      }
    }
    
    res.json({ 
      success: true, 
      message: `Batch processed: ${results.added} added, ${results.deleted} deleted`,
      results 
    });
  } catch (error) {
    console.error('❌ BatchDeliveries error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to process batch.' });
  }
};

module.exports = { getDeliveries, getTodayDeliveries, addDelivery, deleteEntry, updateEntry, batchDeliveries };
