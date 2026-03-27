const mongoose = require('mongoose');
const { Schema } = mongoose;

// Each individual can delivery has a quantity and the time it was recorded
const entrySchema = new Schema(
  {
    quantity: { type: Number, required: true, min: 1 },
    time:     { type: Date, default: Date.now },
  },
  { _id: true } // each entry gets its own _id so we can delete/update individually
);

// ONE document per customer per date — entries are embedded
const DeliverySchema = new Schema(
  {
    vendorId:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    customerId:    { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    date:          { type: Date, required: true }, // always normalized to midnight (start of day)
    entries:       { type: [entrySchema], default: [] },
    totalQuantity: { type: Number, default: 0 },   // pre-computed sum of entries
  },
  { timestamps: true }
);

// Unique: one doc per vendor+customer+date
DeliverySchema.index({ vendorId: 1, customerId: 1, date: 1 }, { unique: true });
DeliverySchema.index({ vendorId: 1, date: 1 });

module.exports = mongoose.model('Delivery', DeliverySchema);
