# Full-Stack Web Calling & SMS Application (Zero-Database Architecture)

A complete full-stack web application that allows authenticated users to make outbound phone calls and send SMS messages directly from a modern web dashboard. Powered by Node.js, Express, and Twilio Voice & Messaging APIs.

---

## ⚡ Zero-Database Architecture

This application uses a **Zero-Database local persistence engine** (`backend/config/store.js`).
* **Zero Database Setup**: No MongoDB, no Firebase, no MySQL, and no binary downloads required!
* **Instant Execution**: Registration, login, call placement, and contact operations complete in **< 5ms**.
* **Automatic Persistence**: All account data, call logs, SMS records, and contacts are automatically saved to `data/store.json` inside your project directory.

---

## 🌟 Features

* **Authentication System**: Registration, login, JWT token authentication, and password hashing using bcrypt.
* **Phone Calling Dashboard**: Outbound phone call initiation using Twilio Voice API, interactive touch dialpad, and real-time status monitoring.
* **TwiML & Status Webhooks**: Automatic XML instruction generator (`/api/calls/twiml`) and call status lifecycle callback processor (`/api/calls/status`).
* **SMS Messaging**: Instant SMS message dispatch using Twilio Messaging API with character counter and delivery status tracking.
* **Contact Management**: Full CRUD contact book with quick `[Call]` and `[SMS]` buttons that auto-fill inputs.
* **Activity History Logs**: Real-time tracked call history table (showing call statuses like `completed`, `no-answer`, `in-progress`, duration `MM:SS`) and sent SMS logs.
* **E.164 Validation**: Strict phone number format validation preventing invalid API calls.
* **Modern UI/UX**: Dark glassmorphic design system using CSS variables, micro-animations, toast notifications, and zero external frontend dependencies.

---

## 📂 Project Structure

```text
caller-app/
│
├── data/
│   └── store.json         # Auto-generated JSON database file
│
├── frontend/
│   ├── index.html         # Landing / Auto-redirect route
│   ├── login.html         # Auth portal (Login & Register tabs)
│   ├── dashboard.html     # Main Caller, SMS & Contacts Dashboard
│   ├── css/
│   │   └── style.css      # Glassmorphism dark styling & animations
│   └── js/
│       ├── api.js         # Centralized API fetch helper
│       ├── auth.js        # Auth session & form handling
│       └── dashboard.js   # Dialpad, calling, SMS & contact handlers
│
├── backend/
│   ├── server.js          # Express app entry point & static file server
│   ├── config/
│   │   └── store.js       # Zero-DB store & file persistence module
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── callRoutes.js
│   │   ├── messageRoutes.js
│   │   └── contactRoutes.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── callController.js
│   │   ├── messageController.js
│   │   └── contactController.js
│   ├── middleware/
│   │   ├── authMiddleware.js # JWT Bearer authorization check
│   │   └── errorMiddleware.js# Centralized error handler
│   ├── services/
│   │   ├── twilioService.js  # Twilio Voice & Messaging API client
│   │   └── tokenService.js   # JWT sign & verification service
│   └── utils/
│       └── phoneValidator.js # E.164 phone validation helper
│
├── .env                   # Environment secrets (Git-ignored)
├── .env.example           # Template for environment variables
├── .gitignore
├── package.json
└── README.md
```

---

## 🔑 Environment Variables Setup

Create a `.env` file in the root directory by copying `.env.example`:

```env
PORT=5000

TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX

JWT_SECRET=super_secret_jwt_key_change_in_production
PUBLIC_URL=https://your-ngrok-subdomain.ngrok-free.app
```

---

## 🚀 Running the Application

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Backend Server
```bash
npm run dev
```

The server will start at: `http://localhost:5000`

### 3. Open in Browser
Navigate to `http://localhost:5000` in Google Chrome to start using your app!
