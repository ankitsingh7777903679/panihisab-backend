const Customer = require('../models/Customer');

const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({ vendorId: req.user.id, isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, count: customers.length, customers });
  } catch (error) {
    console.error('❌ GetCustomers error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch customers.' });
  }
};

const addCustomer = async (req, res) => {
  try {
    const { name, mobile, address, pricePerCan } = req.body;
    if (!name || !mobile || !pricePerCan) {
      return res.status(400).json({ success: false, message: 'Name, mobile, and price are required.' });
    }
    const customer = await Customer.create({ vendorId: req.user.id, name, mobile, address: address || '', pricePerCan });
    res.status(201).json({ success: true, customer });
  } catch (error) {
    console.error('❌ AddCustomer error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to add customer.' });
  }
};

const getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, customer });
  } catch (error) {
    console.error('❌ GetCustomer error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch customer.' });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, vendorId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, customer });
  } catch (error) {
    console.error('❌ UpdateCustomer error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update customer.' });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, vendorId: req.user.id },
      { isActive: false },
      { new: true }
    );
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, message: 'Customer deleted successfully.' });
  } catch (error) {
    console.error('❌ DeleteCustomer error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete customer.' });
  }
};

module.exports = { getCustomers, addCustomer, getCustomer, updateCustomer, deleteCustomer };
