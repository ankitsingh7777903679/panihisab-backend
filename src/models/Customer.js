const mongoose = require('mongoose');
const { validateIndianPhone, normalizePhone } = require('../utils/validators');

const CustomerSchema = new mongoose.Schema(
  {
    vendorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name:        { type: String, required: true, trim: true },
    mobile:      { 
      type: String, 
      required: true, 
      trim: true,
      validate: {
        validator: function(value) {
          const result = validateIndianPhone(value);
          return result.isValid;
        },
        message: function(props) {
          const result = validateIndianPhone(props.value);
          return result.message;
        }
      }
    },
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

// Normalize mobile number before validation and save
CustomerSchema.pre('validate', function() {
  if (this.isModified('mobile') && this.mobile) {
    this.mobile = normalizePhone(this.mobile);
  }
});

CustomerSchema.index({ vendorId: 1, isActive: 1 });

module.exports = mongoose.model('Customer', CustomerSchema);
