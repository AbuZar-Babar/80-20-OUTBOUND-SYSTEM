const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { connectDB, isMongoConnected } = require('./config/db');

const { errorHandler } = require('./middleware/errorMiddleware');

const authRoutes = require('./routes/authRoutes');
const callRoutes = require('./routes/callRoutes');
const messageRoutes = require('./routes/messageRoutes');
const contactRoutes = require('./routes/contactRoutes');
const adminRoutes = require('./routes/adminRoutes');
const leadRoutes = require('./routes/leadRoutes');
const emailRoutes = require('./routes/emailRoutes');
const managerRoutes = require('./routes/managerRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const dripSequenceRoutes = require('./routes/dripSequenceRoutes');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests, try again later.' }
});
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/drip', dripSequenceRoutes);

const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'API route not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  const mongoConnected = await connectDB();

  // Initialize store (Zero-DB)
  const { UserStore } = require('./config/store');

  // Auto-create admin account if it doesn't exist
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const existingAdmin = await UserStore.findOne({ email: adminEmail });
    if (!existingAdmin) {
      await UserStore.create({
        name: 'Admin',
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
        approved: true
      });
      console.log(`[Admin] Default admin account created: ${adminEmail}`);
    }
  }

  app.listen(PORT, () => {
    const dbMode = mongoConnected ? 'MongoDB Atlas' : 'Zero-DB (Local JSON File)';
    console.log(`====================================================`);
    console.log(` Caller App Server Running on http://localhost:${PORT}`);
    console.log(` Database Mode: ${dbMode}`);
    console.log(` API Base URL: http://localhost:${PORT}/api`);
    console.log(` Frontend Served At: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
};

startServer();
