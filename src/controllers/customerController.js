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

const getDeletedCustomers = async (req, res) => {
  try {
    const customers = await Customer.find({ vendorId: req.user.id, isActive: false }).sort({ updatedAt: -1 });
    res.json({ success: true, count: customers.length, customers });
  } catch (error) {
    console.error('❌ GetDeletedCustomers error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch deleted customers.' });
  }
};

const addCustomer = async (req, res) => {
  try {
    const { name, mobile, address, pricePerCan } = req.body;
    if (!name || !mobile || !pricePerCan) {
      return res.status(400).json({ success: false, message: 'Name, mobile, and price are required.' });
    }
    
    // Normalize mobile: strip spaces, dashes, etc.
    const normalizedMobile = mobile.replace(/\D/g, '').slice(-10);
    
    // Check if vendor already has an active customer with this normalized mobile
    const existingCustomer = await Customer.findOne({ vendorId: req.user.id, mobile: normalizedMobile, isActive: true });
    if (existingCustomer) {
      return res.status(400).json({ success: false, message: 'A customer with this mobile number already exists in your list.' });
    }

    const customer = await Customer.create({ vendorId: req.user.id, name, mobile: normalizedMobile, address: address || '', pricePerCan });
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
    const { mobile } = req.body;
    
    // If mobile is being updated, verify it doesn't clash with another active customer
    if (req.body.mobile) {
      req.body.mobile = req.body.mobile.replace(/\D/g, '').slice(-10);
      const existingCustomer = await Customer.findOne({ 
        vendorId: req.user.id, 
        mobile: req.body.mobile, 
        isActive: true,
        _id: { $ne: req.params.id } // exclude self
      });
      if (existingCustomer) {
        return res.status(400).json({ success: false, message: 'A customer with this mobile number already exists in your list.' });
      }
    }

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

const restoreCustomer = async (req, res) => {
  try {
    // Check if the mobile number conflicts with an existing active customer
    const customerToRestore = await Customer.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!customerToRestore) return res.status(404).json({ success: false, message: 'Customer not found.' });

    const existingActive = await Customer.findOne({ 
      vendorId: req.user.id, 
      mobile: customerToRestore.mobile, 
      isActive: true,
      _id: { $ne: customerToRestore._id }
    });

    if (existingActive) {
      return res.status(400).json({ success: false, message: 'Cannot restore. An active customer with this mobile number already exists.' });
    }

    customerToRestore.isActive = true;
    await customerToRestore.save();
    res.json({ success: true, message: 'Customer restored successfully.', customer: customerToRestore });
  } catch (error) {
    console.error('❌ RestoreCustomer error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to restore customer.' });
  }
};

// Set or update opening balance for a customer
const setOpeningBalance = async (req, res) => {
  try {
    const { openingBalance, previousPaid, openingBalanceNote } = req.body;
    
    if (openingBalance === undefined || openingBalance === null) {
      return res.status(400).json({ success: false, message: 'Opening balance amount is required.' });
    }
    if (Number(openingBalance) < 0) {
      return res.status(400).json({ success: false, message: 'Opening balance cannot be negative.' });
    }
    if (previousPaid !== undefined && Number(previousPaid) < 0) {
      return res.status(400).json({ success: false, message: 'Previously paid amount cannot be negative.' });
    }
    if (previousPaid !== undefined && Number(previousPaid) > Number(openingBalance)) {
      return res.status(400).json({ success: false, message: 'Paid amount cannot exceed total balance.' });
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, vendorId: req.user.id },
      {
        openingBalance: Number(openingBalance),
        previousPaid: Number(previousPaid || 0),
        openingBalanceNote: openingBalanceNote || '',
      },
      { new: true, runValidators: true }
    );

    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, customer });
  } catch (error) {
    console.error('❌ SetOpeningBalance error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to set opening balance.' });
  }
};

// Delete (reset) opening balance for a customer
const deleteOpeningBalance = async (req, res) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, vendorId: req.user.id },
      { openingBalance: 0, previousPaid: 0, openingBalanceNote: '' },
      { new: true }
    );
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, message: 'Opening balance reset successfully.', customer });
  } catch (error) {
    console.error('❌ DeleteOpeningBalance error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to reset opening balance.' });
  }
};

module.exports = { getCustomers, getDeletedCustomers, addCustomer, getCustomer, updateCustomer, deleteCustomer, restoreCustomer, setOpeningBalance, deleteOpeningBalance };
