/**
 * Indian Phone Number Validation Utility
 * Validates Indian mobile numbers according to standard format
 */

/**
 * Normalize phone number - remove non-digits and take last 10 digits
 * @param {string} phone - Phone number to normalize
 * @returns {string} Normalized 10-digit phone number
 */
const normalizePhone = (phone) => {
  if (!phone) return '';
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');
  // Take last 10 digits (handles numbers with country code)
  return digitsOnly.slice(-10);
};

/**
 * Validate Indian mobile number
 * @param {string} phone - Phone number to validate
 * @returns {object} Validation result with isValid and message
 */
const validateIndianPhone = (phone) => {
  const normalized = normalizePhone(phone);
  
  // Check if exactly 10 digits
  if (normalized.length !== 10) {
    return {
      isValid: false,
      message: 'Mobile number must be exactly 10 digits',
      normalized
    };
  }
  
  // Check if starts with valid Indian mobile prefix (2,3,4,5,6,7,8,9)
  // Note: All Indian mobile numbers can start with 2-9, not just 6-9
  if (!/^[2-9]/.test(normalized)) {
    return {
      isValid: false,
      message: 'Please enter a valid Indian mobile number',
      normalized
    };
  }
  
  // Check for sequential numbers (1234567890, 9876543210)
  if (normalized === '1234567890' || normalized === '9876543210') {
    return {
      isValid: false,
      message: 'Sequential numbers are not allowed',
      normalized
    };
  }
  
  // Check for repeated numbers (1111111111, 9999999999)
  if (/^(\d)\1{9}$/.test(normalized)) {
    return {
      isValid: false,
      message: 'Repeated numbers are not allowed',
      normalized
    };
  }
  
  // Check for common test patterns
  const testPatterns = [
    '0000000000', '1111111111', '2222222222', '3333333333',
    '4444444444', '5555555555', '6666666666', '7777777777',
    '8888888888', '9999999999', '1234567890', '9876543210',
    '1231231231', '9879879879', '1212121212', '1313131313'
  ];
  
  if (testPatterns.includes(normalized)) {
    return {
      isValid: false,
      message: 'Invalid mobile number pattern',
      normalized
    };
  }
  
  // Check for patterns like 12345678XX (first 8 digits sequential)
  if (/^12345678\d{2}$/.test(normalized) || /^98765432\d{2}$/.test(normalized)) {
    return {
      isValid: false,
      message: 'Invalid mobile number pattern',
      normalized
    };
  }
  
  // All validations passed
  return {
    isValid: true,
    message: 'Valid mobile number',
    normalized
  };
};

/**
 * Mongoose validation function for phone numbers
 * @param {string} value - Phone number to validate
 * @returns {boolean} True if valid
 */
const mongoosePhoneValidator = function(value) {
  const result = validateIndianPhone(value);
  return result.isValid;
};

/**
 * Mongoose error message generator for phone validation
 * @param {string} value - Phone number that failed validation
 * @returns {string} Error message
 */
const mongoosePhoneMessage = function(value) {
  const result = validateIndianPhone(value);
  return result.message;
};

module.exports = {
  normalizePhone,
  validateIndianPhone,
  mongoosePhoneValidator,
  mongoosePhoneMessage
};
