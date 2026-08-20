const { UserStore } = require('../config/store');
const { generateToken } = require('../services/tokenService');

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password.'
      });
    }

    const userExists = await UserStore.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists. Please sign in.'
      });
    }

    const user = await UserStore.create({
      name,
      email: email.toLowerCase(),
      password
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Please log in with your credentials.',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please enter both email and password.'
      });
    }

    const user = await UserStore.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No account found with this email. Please register first.'
      });
    }

    const isMatch = await UserStore.matchPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password. Access denied.'
      });
    }

    if (!user.approved) {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending admin approval. Please wait for approval before logging in.'
      });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      message: 'User profile retrieved.',
      data: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        approved: req.user.approved,
        timezone: req.user.timezone,
        dailyLeadTarget: req.user.dailyLeadTarget,
        dailyEmailLimit: req.user.dailyEmailLimit,
        calendarLink: req.user.calendarLink || '',
        crmWebhookUrl: req.user.crmWebhookUrl || '',
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { calendarLink, crmWebhookUrl, timezone } = req.body;
    const updateData = {};
    if (calendarLink !== undefined) updateData.calendarLink = calendarLink;
    if (crmWebhookUrl !== undefined) updateData.crmWebhookUrl = crmWebhookUrl;
    if (timezone !== undefined) updateData.timezone = timezone;

    const user = await UserStore.updateProfile(req.user._id, updateData);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.status(200).json({ success: true, message: 'Profile updated.', data: user });
  } catch (error) { next(error); }
};

const getClosers = async (req, res, next) => {
  try {
    const users = await UserStore.findAllUsers();
    const closers = users
      .filter(u => u.active !== false && u.approved !== false)
      .map(u => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        calendarLink: u.calendarLink || ''
      }));
    res.status(200).json({ success: true, count: closers.length, data: closers });
  } catch (error) { next(error); }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  getClosers
};
