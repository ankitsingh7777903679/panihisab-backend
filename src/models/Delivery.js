const mongoose = require('mongoose');

const DeliverySchema = new mongoose.Schema(
  {
    vendorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    date:       { type: Date, required: true, default: Date.now },
    quantity:   { type: Number, required: true },
  },
  { timestamps: true }
);

DeliverySchema.index({ vendorId: 1, date: -1 });
DeliverySchema.index({ customerId: 1, date: -1 });

module.exports = mongoose.model('Delivery', DeliverySchema);
