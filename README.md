# 80/20 Essential Dialer — Full Documentation

A complete outbound sales dialing system built with Node.js, Express, Twilio, and MongoDB Atlas. Designed for sales teams to manage leads, make calls, send emails/SMS, track outcomes, and manage bookings — all from a single dashboard.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Environment Variables](#environment-variables)
3. [Project Structure](#project-structure)
4. [Database](#database)
5. [Authentication & Roles](#authentication--roles)
6. [Feature Breakdown](#feature-breakdown)
7. [API Reference](#api-reference)
8. [Frontend Dashboard](#frontend-dashboard)
9. [Deployment (Vercel)](#deployment-vercel)
10. [Development](#development)

---

## Architecture Overview

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend   │────▶│   Express API    │────▶│  MongoDB Atlas  │
│  (Vanilla JS)│     │  (REST Routes)   │     │  (or Zero-DB)   │
└──────────────┘     └──────────────────┘     └─────────────────┘
                            │
                     ┌──────┴──────┐
                     │   Twilio    │
                     │  Voice/SMS  │
                     └─────────────┘
```

- **Frontend**: Vanilla HTML/CSS/JS (no framework, no build step)
- **Backend**: Node.js + Express REST API
- **Database**: MongoDB Atlas (primary) with Zero-DB local JSON fallback
- **Telephony**: Twilio Voice API (click-to-call, recording) + Twilio Messaging API (SMS)
- **Email**: Optional SendGrid integration (works without it in demo mode)

---

## Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=5000

# Database (leave empty for Zero-DB local fallback)
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/dialer-app?retryWrites=true&w=majority

# Twilio
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX

# Auth
JWT_SECRET=your_jwt_secret_key_here
ADMIN_EMAIL=admin@dialermvp.com
ADMIN_PASSWORD=DialerMVP@Admin2026

# Email (optional — works in demo mode without SendGrid)
SENDGRID_API_KEY=SG.xxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com

# Public URL (for Twilio webhooks)
PUBLIC_URL=https://your-domain.com
```

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5000) |
| `MONGODB_URI` | No | MongoDB Atlas connection string. If empty, uses local JSON file |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Yes | Twilio phone number in E.164 format |
| `JWT_SECRET` | Yes | Secret key for JWT token signing |
| `ADMIN_EMAIL` | Yes | Auto-created admin account email |
| `ADMIN_PASSWORD` | Yes | Auto-created admin account password |
| `SENDGRID_API_KEY` | No | SendGrid API key for real email sending |
| `EMAIL_FROM` | No | Sender email address |
| `PUBLIC_URL` | Yes | Public URL for Twilio webhook callbacks |

---

## Project Structure

```
├── backend/
│   ├── server.js                    # Express app entry point
│   ├── config/
│   │   ├── db.js                    # MongoDB Atlas connection
│   │   └── store.js                 # All database operations (MongoDB + Zero-DB fallback)
│   ├── models/
│   │   ├── User.js                  # User model (roles, targets, email limits)
│   │   ├── Lead.js                  # Lead model (contact, company, geography, status, booking)
│   │   ├── Campaign.js              # Campaign model
│   │   ├── ActivityLog.js           # Activity log model (every action tracked)
│   │   ├── EmailTemplate.js         # Email template model (merge fields)
│   │   ├── LoginSession.js          # Login session tracking model
│   │   ├── Call.js                  # Call model (recording, duration)
│   │   ├── Message.js               # SMS message model
│   │   └── Contact.js               # Contact book model
│   ├── controllers/
│   │   ├── authController.js        # Register, login, getMe
│   │   ├── leadController.js        # Lead CRUD, CSV upload, queue, work lead, assign, reassign, suppress
│   │   ├── emailController.js       # Send email, bulk email, webhook
│   │   ├── emailTemplateController.js # Template CRUD, send from template with merge fields
│   │   ├── managerController.js     # Dashboard metrics, team activity, alerts
│   │   ├── sessionController.js     # Login tracking, heartbeat, dialing time
│   │   ├── callController.js        # Make call, TwiML, status webhook, recording
│   │   ├── messageController.js     # Send SMS
│   │   ├── contactController.js     # Contact CRUD
│   │   └── adminController.js       # User approval, role management
│   ├── routes/
│   │   ├── authRoutes.js            # POST /register, POST /login, GET /me
│   │   ├── leadRoutes.js            # /leads/* endpoints
│   │   ├── emailRoutes.js           # /email/* endpoints
│   │   ├── managerRoutes.js         # /manager/* endpoints
│   │   ├── sessionRoutes.js         # /session/* endpoints
│   │   ├── campaignRoutes.js        # /campaigns/* endpoints
│   │   ├── callRoutes.js            # /calls/* endpoints
│   │   ├── messageRoutes.js         # /messages/* endpoints
│   │   ├── contactRoutes.js         # /contacts/* endpoints
│   │   └── adminRoutes.js           # /admin/* endpoints
│   ├── services/
│   │   ├── twilioService.js         # Twilio Voice & Messaging client
│   │   └── tokenService.js          # JWT sign & verify
│   ├── middleware/
│   │   ├── authMiddleware.js        # JWT Bearer authorization
│   │   └── errorMiddleware.js       # Centralized error handler
│   └── utils/
│       └── phoneValidator.js        # E.164 phone validation
│
├── frontend/
│   ├── index.html                   # Landing page
│   ├── login.html                   # Login/Register page
│   ├── dashboard.html               # Main dashboard (all sections)
│   ├── css/
│   │   └── style.css                # Dark glassmorphism design system
│   └── js/
│       ├── api.js                   # Centralized API client
│       ├── auth.js                  # Auth form handling
│       └── dashboard.js             # All dashboard logic
│
├── data/
│   └── store.json                   # Zero-DB local persistence (auto-generated)
│
├── .env                             # Environment secrets
├── .env.example                     # Template
├── vercel.json                      # Vercel deployment config
├── package.json
└── README.md
```

---

## Database

### Primary: MongoDB Atlas
- All models use Mongoose schemas
- Connection via `MONGODB_URI` environment variable
- Indices on frequently queried fields (userId, status, callbackDate, phone, email)

### Fallback: Zero-DB (Local JSON)
- When `MONGODB_URI` is not set or MongoDB is unreachable, all data persists to `data/store.json`
- Same API surface — controllers don't know which backend is active
- **Note**: On Vercel serverless, Zero-DB data is lost between cold starts. MongoDB Atlas is required for production.

### Models & Fields

#### User
| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Full name |
| `email` | String | Unique email (login credential) |
| `password` | String | Bcrypt hashed |
| `role` | Enum | `owner`, `manager`, `salesperson`, `admin` |
| `approved` | Boolean | Must be approved by admin before login |
| `timezone` | String | User's timezone (default: UTC) |
| `dailyLeadTarget` | Number | Daily call target (default: 50) |
| `dailyEmailLimit` | Number | Max emails per day (default: 50) |
| `active` | Boolean | Account active status |

#### Lead
| Field | Type | Description |
|-------|------|-------------|
| `contact.name` | String | Contact name |
| `contact.phone` | String | Phone number (E.164) |
| `contact.email` | String | Email address |
| `contact.position` | String | Job title/position |
| `contact.preferredChannel` | Enum | phone, email, sms, whatsapp |
| `company.name` | String | Company name |
| `company.website` | String | Company website |
| `company.niche` | String | Industry/niche |
| `company.notes` | String | Company notes |
| `geography.country` | String | Country |
| `geography.city` | String | City |
| `geography.region` | String | State/province |
| `geography.timezone` | String | IANA timezone (default: UTC) |
| `assignment.list` | String | Source list name |
| `assignment.priority` | Number | Priority score |
| `assignment.dateAssigned` | Date | When assigned |
| `status` | Enum | Current status (see below) |
| `lastAction` | String | Description of last action |
| `lastActionDate` | Date | When last action occurred |
| `nextAction` | String | What to do next |
| `callbackDate` | Date | Scheduled callback date/time |
| `callbackNote` | String | Callback note |
| `suppression.phone` | Boolean | Phone suppressed |
| `suppression.email` | Boolean | Email suppressed |
| `suppression.sms` | Boolean | SMS suppressed |
| `suppression.whatsapp` | Boolean | WhatsApp suppressed |
| `booking.booked` | Boolean | Meeting booked |
| `booking.meetingDate` | Date | Meeting date/time |
| `booking.meetingTimezone` | String | Meeting timezone |
| `booking.closer` | String | Closer/salesperson name |
| `booking.meetingLink` | String | Calendar/meeting link |
| `emailSequence.active` | Boolean | Email sequence active |
| `emailSequence.emailsSent` | Number | Emails sent count |
| `emailSequence.lastSentDate` | Date | Last email sent |
| `coldOutreachStopped` | Boolean | Stop all cold outreach |
| `currentlyBeingWorked` | Boolean | Lead lock (duplicate prevention) |
| `currentlyBeingWorkedBy` | ObjectId | Who has it locked |
| `currentlyBeingWorkedAt` | Date | Lock timestamp (auto-releases after 5 min) |

#### Lead Statuses
| Status | Meaning | Next Action |
|--------|---------|-------------|
| `new` | Never contacted | Call |
| `no-answer` | No answer | Auto-retry in 1 hour |
| `busy` | Line busy | Auto-retry in 30 minutes |
| `voicemail` | Left voicemail | Auto-retry in 2 hours |
| `callback` | Scheduled callback | Callback at scheduled time |
| `send-info` | Wants info sent | Send email |
| `interested` | Showed interest | Follow up |
| `meeting-booked` | Meeting scheduled | None (cold outreach stopped) |
| `not-interested` | Declined | None (cold outreach stopped) |
| `wrong-number` | Wrong number | None (phone suppressed) |
| `dnc` | Do Not Contact | None (all channels suppressed) |
| `opted-out` | Opted out | None (all channels suppressed) |

#### Campaign
| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Campaign name |
| `description` | String | Description |
| `status` | Enum | `active`, `paused` |
| `createdBy` | ObjectId | Creator |

#### ActivityLog
| Field | Type | Description |
|-------|------|-------------|
| `leadId` | ObjectId | Associated lead |
| `userId` | ObjectId | Who performed action |
| `action` | Enum | call, sms, email, note, status-change, callback, booking, assign, reassign |
| `channel` | Enum | phone, email, sms, whatsapp |
| `direction` | Enum | outbound, inbound |
| `outcome` | String | Call outcome |
| `previousStatus` | String | Status before |
| `newStatus` | String | Status after |
| `notes` | String | Free text notes |
| `duration` | Number | Call duration in seconds |
| `callSid` | String | Twilio Call SID |
| `messageSid` | String | Twilio Message SID |
| `timestamp` | Date | When action occurred |

#### EmailTemplate
| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Template name |
| `subject` | String | Email subject (supports merge fields) |
| `body` | String | Email body HTML (supports merge fields) |
| `category` | Enum | cold-outreach, follow-up, booking, general |
| `mergeFields` | [String] | Detected merge field names |
| `createdBy` | ObjectId | Creator |

**Available merge fields**: `{{name}}`, `{{first_name}}`, `{{company}}`, `{{position}}`, `{{city}}`, `{{country}}`, `{{phone}}`, `{{email}}`, `{{website}}`, `{{niche}}`

#### LoginSession
| Field | Type | Description |
|-------|------|-------------|
| `userId` | ObjectId | User |
| `loginAt` | Date | Login time |
| `logoutAt` | Date | Logout time |
| `lastActivityAt` | Date | Last heartbeat |
| `activeTimeSeconds` | Number | Total active time today |
| `dialingTimeSeconds` | Number | Total time on calls today |
| `date` | String | YYYY-MM-DD |

---

## Authentication & Roles

### Registration Flow
1. User registers with name, email, password
2. Account is created with `approved: false` and `role: 'salesperson'`
3. Admin must approve before the user can log in
4. First user registered becomes admin automatically

### Roles & Permissions
| Role | Can Do |
|------|--------|
| `admin` / `owner` | Approve users, manage roles, see all data, team dashboard |
| `manager` | See team metrics, alerts, all lead data |
| `salesperson` | See only own leads, own queue, own metrics |

### Auto-Admin
- On server startup, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, an admin account is auto-created if it doesn't exist

---

## Feature Breakdown

### 1. Lead Management

#### CSV Upload
- Upload CSV files with automatic column mapping
- Recognizes common column names (name, phone, email, company, etc.)
- Duplicate detection by phone and email
- Optional assignment to a user and campaign during upload
- Import summary: imported count, duplicates skipped, errors

#### Lead Assignment
- **Manual**: Select leads → assign to a specific salesperson
- **Bulk**: Assign all unassigned leads (optionally filtered by campaign)
- **Reassign**: Reassign individual leads from the detail modal
- All assignments logged in activity log

#### Lead Detail View
- Full contact, company, geography information
- Status badge and next action
- Activity timeline (all calls, emails, notes, status changes)
- Quick actions: Reassign, Check Contact Hours

### 2. Daily Queue (Priority System)

The queue is the core workflow. Leads appear in this priority order:

1. **Overdue Callbacks** (red) — Callback date has passed
2. **Due Today** (yellow) — Callback scheduled for today
3. **Interested - Follow Up** (green) — Previously showed interest
4. **New Leads** (purple) — Never contacted (limited to 50)

Each lead in the queue shows:
- Name, phone, email
- Company name
- Callback note (if applicable)
- Call button to load into dialer

### 3. Click-to-Call Dialer

#### Making Calls
1. Lead is loaded from queue or manual phone entry
2. Click "CALL NOW" → Twilio initiates outbound call
3. Call status shown with live timer (MM:SS)
4. End call → outcome panel appears

#### Outcome Panel
After every call, the salesperson **must** select an outcome before moving to the next lead:

| Outcome | Behavior |
|---------|----------|
| No Answer | Auto-retry scheduled in 1 hour |
| Busy | Auto-retry scheduled in 30 minutes |
| Voicemail | Auto-retry scheduled in 2 hours |
| Callback | Manual callback date/time required |
| Send Info | Sets next action to send email |
| Interested | Sets next action to follow up |
| Book Meeting | Opens booking form |
| Not Interested | Cold outreach stopped |
| DNC | All channels suppressed |
| Wrong Number | Phone channel suppressed |

#### Call Recording
- All calls are automatically recorded via Twilio
- Recording URL, SID, and duration saved to database
- Recordings accessible via Twilio API

### 4. SMS Messaging

- Send SMS to any E.164 formatted number
- Character counter (160 chars)
- Recipient auto-filled when working a lead
- All SMS logged in activity log

### 5. Email System

#### Compose Email
- Send individual emails to leads
- Lead ID auto-filled when working a lead
- HTML body supported
- Suppression check (blocked emails rejected)

#### Email Templates
- Create reusable templates with merge fields
- Categories: cold-outreach, follow-up, booking, general
- Merge fields auto-replaced with lead data
- Templates selectable from compose tab

#### Bulk Email
- Send same email to multiple leads at once
- Automatically skips suppressed leads and opted-out leads

#### Email Limits
- Per-user daily email limit (default: 50)
- Shown in email tab as "X/50 sent today"
- Returns 429 error when limit reached

#### Email Webhooks
- Bounce detection → email suppressed, lead marked as not-interested
- Unsubscribe detection → email suppressed, lead opted out

### 6. Campaigns

- Create campaigns with name and description
- Assign leads to campaigns during CSV upload
- **Pause/Resume** campaigns (toggle button)
- **Export** campaign leads as CSV (CRM handoff)
- Delete campaigns

### 7. Booking

When outcome is "Book Meeting":
- Select meeting date/time
- Enter closer name
- Add meeting/calendar link
- Lead status changes to `meeting-booked`
- Cold outreach automatically stopped
- Booking logged in activity log

### 8. Contact Hours Check

- Check if it's within allowed contact hours for a lead
- Uses lead's timezone from geography data
- Allowed hours: 8:00 AM - 6:00 PM in lead's local time
- Green indicator = OK to contact
- Red indicator = Outside hours

### 9. Duplicate Contact Prevention

- When a salesperson starts working a lead, it's locked
- Other salespeople see "This lead is currently being worked by another salesperson"
- Lock auto-releases after 5 minutes if abandoned
- Stale locks cleaned up when queue is fetched

### 10. DNC / Opt-Out Suppression

- DNC or Opted-Out outcomes suppress ALL channels (phone, email, SMS, WhatsApp)
- Wrong Number suppresses phone only
- Bounce webhook suppresses email
- Unsubscribe webhook suppresses email
- Suppressed channels blocked from outbound communication

### 11. Manager Dashboard

#### Overview Metrics (All Users)
- Total assigned leads, contacted, interested, booked
- Calls today, emails today, SMS today
- Overdue callbacks count

#### Per-Salesperson Metrics (Manager View)
- Assigned leads, contacted, interested, booked
- Overdue callbacks, untouched leads
- Calls today, talk time
- Active time, dialing time

#### Alerts
- Overdue callbacks count
- Untouched leads count

### 12. Activity Tracking

#### Activity Log
- Every action is logged: calls, emails, SMS, notes, status changes, assignments, bookings
- Filtered by user (salesperson sees own, manager sees all)
- Includes timestamp, outcome, duration, notes

#### Session Tracking
- Login recorded on dashboard load
- Heartbeat every 60 seconds
- Active time calculated from heartbeats
- Dialing time tracked from call timer
- All stats shown in overview cards

### 13. User Management (Admin)

- View pending users awaiting approval
- Approve or reject registrations
- View all users
- Change user roles (admin, manager, salesperson)

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/auth/me` | Get current user profile |

### Leads
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/leads/upload` | Upload CSV file |
| GET | `/api/leads` | Get all leads (filtered by role) |
| GET | `/api/leads/queue` | Get daily priority queue |
| GET | `/api/leads/contact-hours?leadId=X` | Check contact hours |
| GET | `/api/leads/:id` | Get lead detail + timeline |
| PUT | `/api/leads/:id` | Update lead |
| DELETE | `/api/leads/:id` | Delete lead |
| POST | `/api/leads/work` | Submit call outcome |
| POST | `/api/leads/assign` | Assign leads to user |
| POST | `/api/leads/bulk-assign` | Bulk assign unassigned leads |
| POST | `/api/leads/reassign` | Reassign a lead |
| POST | `/api/leads/note` | Add note to lead |
| POST | `/api/leads/book` | Book meeting for lead |
| POST | `/api/leads/suppress` | Suppress a channel |

### Email
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/email/send` | Send email to lead |
| POST | `/api/email/bulk` | Bulk send emails |
| GET | `/api/email/templates` | Get all templates |
| POST | `/api/email/templates` | Create template |
| PUT | `/api/email/templates/:id` | Update template |
| DELETE | `/api/email/templates/:id` | Delete template |
| POST | `/api/email/send-template` | Send email from template |
| POST | `/api/email/webhook` | Email bounce/unsubscribe webhook |

### Campaigns
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | Get all campaigns |
| POST | `/api/campaigns` | Create campaign |
| POST | `/api/campaigns/:id/toggle` | Pause/Resume campaign |
| GET | `/api/campaigns/:id/export` | Export campaign leads as CSV |
| DELETE | `/api/campaigns/:id` | Delete campaign |

### Manager
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/manager/metrics` | Dashboard metrics |
| GET | `/api/manager/activity?limit=N` | Team activity log |
| GET | `/api/manager/alerts` | Manager alerts |

### Session
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/session/login` | Record login |
| POST | `/api/session/heartbeat` | Activity heartbeat |
| POST | `/api/session/dialing-time` | Update dialing time |
| GET | `/api/session/stats/:userId?` | Get session stats |

### Calls
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/calls` | Initiate outbound call |
| GET | `/api/calls` | Get call history |
| GET | `/api/calls/twiml` | TwiML webhook (Twilio) |
| POST | `/api/calls/status` | Call status webhook |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/messages` | Send SMS |
| GET | `/api/messages` | Get SMS history |

### Contacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts` | Get contacts |
| POST | `/api/contacts` | Create contact |
| PUT | `/api/contacts/:id` | Update contact |
| DELETE | `/api/contacts/:id` | Delete contact |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users/pending` | Get pending users |
| GET | `/api/admin/users` | Get all users |
| POST | `/api/admin/users/:id/approve` | Approve user |
| DELETE | `/api/admin/users/:id/reject` | Reject user |
| POST | `/api/admin/users/:id/role` | Change user role |

---

## Frontend Dashboard

### Sections (Sidebar Navigation)

| Section | Icon | Description |
|---------|------|-------------|
| **Overview** | 📊 | Metric cards (assigned, contacted, interested, booked, calls, emails, SMS, overdue, daily target, active time, dialing time) |
| **Daily Queue** | 📋 | Priority-ordered leads: overdue callbacks → due today → interested → new |
| **Dialer** | 📞 | Phone input, dialpad, call button, timer, outcome panel |
| **SMS** | 💬 | Send SMS with character counter |
| **Email** | ✉️ | Compose tab + Templates tab. Template selector, merge fields |
| **All Leads** | 🎯 | Searchable table with status badges. CSV upload button |
| **Campaigns** | 📢 | Create, pause/resume, export CSV, delete |
| **Activity Log** | 📜 | All actions timeline |
| **Team** | 👥 | Manager view: per-salesperson metrics (admin/manager only) |
| **User Mgmt** | ⚙️ | Approve/reject pending users (admin only) |

### Modals
- **CSV Upload**: File picker, campaign selector, assign-to selector
- **Create Campaign**: Name, description
- **Lead Detail**: Full info, timeline, reassign button, contact hours check
- **Reassign Lead**: User selector dropdown
- **Create Template**: Name, category, subject, body with merge field support

---

## Deployment (Vercel)

### vercel.json
```json
{
  "version": 2,
  "builds": [{ "src": "backend/server.js", "use": "@vercel/node" }],
  "routes": [
    { "src": "/api/(.*)", "dest": "backend/server.js" },
    { "src": "/(.*)", "dest": "backend/server.js" }
  ]
}
```

### Required Vercel Environment Variables
All variables from `.env.example` must be set in Vercel dashboard:
- `MONGODB_URI` (required for persistence)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `JWT_SECRET`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `SENDGRID_API_KEY` (optional)
- `EMAIL_FROM` (optional)

### Vercel Limitations
- Serverless functions have no writable disk (Zero-DB won't persist)
- File uploads use memory storage (multer memoryStorage)
- MongoDB Atlas is required for production use

---

## Development

### Install
```bash
npm install
```

### Run locally
```bash
npm run dev
```

Server starts at `http://localhost:5000`

### Testing without Twilio
The app works in demo mode without Twilio credentials:
- Calls are simulated (logged but not actually placed)
- SMS is simulated
- Email works in demo mode without SendGrid (logged but not sent)

### Testing without MongoDB
When `MONGODB_URI` is not set, Zero-DB automatically activates:
- All data saved to `data/store.json`
- Same API surface
- Suitable for development only

---

## MongoDB Atlas Backup Policy

### Automated Backups
MongoDB Atlas provides continuous backups on the M10+ tier:
- **Continuous Cloud Backups**: Point-in-time recovery up to 30 days
- **Daily Snapshots**: retained for 7 days on M10, 30 days on M30+
- **Monthly Snapshots**: retained for 12 months on M10+

### Manual Backups
For the M0 free tier (no automated backups):
```bash
# Export data (requires mongodump installed)
mongodump --uri="mongodb+srv://<user>:<pass>@cluster.mongodb.net/dialer" --out=./backup

# Or export a single collection to JSON
mongoexport --uri="mongodb+srv://..." --collection=leads --out=leads-backup.json
```

### Restore
```bash
# Restore from dump
mongorestore --uri="mongodb+srv://..." ./backup

# Import from JSON
mongoimport --uri="mongodb+srv://..." --collection=leads --file=leads-backup.json
```

### Recommended Backup Schedule
- **Daily**: Export leads and activity logs at end of business day
- **Weekly**: Full database export
- **Before migrations**: Always backup before schema changes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Styling | Custom CSS with CSS variables, glassmorphism |
| Backend | Node.js + Express |
| Database | MongoDB Atlas (primary), Zero-DB (fallback) |
| ORM | Mongoose |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Telephony | Twilio Voice API + Twilio Messaging API |
| Email | SendGrid (optional) |
| File Upload | multer (memory storage) |
| CSV Parsing | csv-parser |
| Security | helmet, express-rate-limit |
| Deployment | Vercel (serverless) |
