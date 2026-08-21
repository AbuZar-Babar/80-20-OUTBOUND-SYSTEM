const express = require('express');
const router = express.Router();
const { createContact, getContacts, updateContact, deleteContact } = require('../controllers/contactController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
  .post(protect, createContact)
  .get(protect, getContacts);

router.route('/:id')
  .put(protect, updateContact)
  .delete(protect, deleteContact);

module.exports = router;
