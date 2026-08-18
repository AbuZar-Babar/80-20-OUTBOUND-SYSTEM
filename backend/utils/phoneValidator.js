/**
 * Validates phone numbers against strict E.164 format requirement.
 * E.164 format example: +923001234567 or +14155552671
 */
const validatePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return {
      isValid: false,
      message: 'Phone number is required.'
    };
  }

  const trimmed = phone.trim();
  // E.164 Regex pattern: '+' prefix followed by country code and subscriber number (7-15 digits total)
  const e164Regex = /^\+[1-9]\d{6,14}$/;

  if (!e164Regex.test(trimmed)) {
    return {
      isValid: false,
      message: 'Invalid phone number format. Must be in E.164 format starting with + and country code (e.g., +923001234567 or +14155552671).'
    };
  }

  return {
    isValid: true,
    formattedPhone: trimmed
  };
};

module.exports = { validatePhoneNumber };
