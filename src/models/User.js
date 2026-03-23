const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    mobile:       { type: String, required: true, unique: true, trim: true },
    email:        { type: String, trim: true, lowercase: true },
    password:     { type: String, required: true, minlength: 6 },
    businessName: { type: String, default: '', trim: true },
    logoUrl:      { type: String, default: '' },
    role:         { type: String, enum: ['vendor', 'admin'], default: 'vendor' },
    isActive:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Hash before save
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match password
UserSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', UserSchema);
