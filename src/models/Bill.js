const mongoose = require('mongoose');

const BillSchema = new mongoose.Schema(
  {
    vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    month:       { type: Number, required: true, min: 1, max: 12 },
    year:        { type: Number, required: true },
    totalCans:   { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },
    status:      { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One bill per customer per month/year
BillSchema.index({ vendorId: 1, customerId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Bill', BillSchema);
