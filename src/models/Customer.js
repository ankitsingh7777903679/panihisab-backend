const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema(
  {
    vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name:        { type: String, required: true, trim: true },
    mobile:      { type: String, required: true, trim: true },
    address:     { type: String, default: '', trim: true },
    pricePerCan: { type: Number, required: true, min: 0 },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

CustomerSchema.index({ vendorId: 1, isActive: 1 });

module.exports = mongoose.model('Customer', CustomerSchema);
