const { ContactStore } = require('../config/store');
const { validatePhoneNumber } = require('../utils/phoneValidator');

// @desc    Create a new contact
// @route   POST /api/contacts
// @access  Private
const createContact = async (req, res, next) => {
  try {
    const { name, phone } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Contact name is required.'
      });
    }

    const phoneValidation = validatePhoneNumber(phone);
    if (!phoneValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    const contact = await ContactStore.create({
      userId: req.user._id,
      name: name.trim(),
      phone: phoneValidation.formattedPhone
    });

    res.status(201).json({
      success: true,
      message: 'Contact added successfully.',
      data: contact
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all contacts for the logged-in user
// @route   GET /api/contacts
// @access  Private
const getContacts = async (req, res, next) => {
  try {
    const contacts = await ContactStore.findByUserId(req.user._id);

    res.status(200).json({
      success: true,
      message: 'Contacts retrieved successfully.',
      count: contacts.length,
      data: contacts
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a contact
// @route   PUT /api/contacts/:id
// @access  Private
const updateContact = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone } = req.body;

    let phoneFormatted = null;
    if (phone) {
      const phoneValidation = validatePhoneNumber(phone);
      if (!phoneValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: phoneValidation.message
        });
      }
      phoneFormatted = phoneValidation.formattedPhone;
    }

    const updatedContact = await ContactStore.update(id, req.user._id, {
      name,
      phone: phoneFormatted
    });

    if (!updatedContact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found or unauthorized.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Contact updated successfully.',
      data: updatedContact
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a contact
// @route   DELETE /api/contacts/:id
// @access  Private
const deleteContact = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleted = await ContactStore.delete(id, req.user._id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found or unauthorized.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Contact deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createContact,
  getContacts,
  updateContact,
  deleteContact
};
