const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema(
  {
    vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name:        { type: String, required: true, trim: true },
    mobile:      { type: String, required: true, trim: true },
    address:     { type: String, default: '', trim: true },
    pricePerCan: { type: Number, required: true, min: 0 },
    isActive:    { type: Boolean, default: true },
    // Opening balance — customer ka purana hisab (before using the app)
    openingBalance:     { type: Number, default: 0, min: 0 },  // Total bakaya before app
    previousPaid:       { type: Number, default: 0, min: 0 },  // Kitna already paid tha
    openingBalanceNote: { type: String, default: '', trim: true }, // Optional note
  },
  { timestamps: true }
);

CustomerSchema.index({ vendorId: 1, isActive: 1 });

module.exports = mongoose.model('Customer', CustomerSchema);
