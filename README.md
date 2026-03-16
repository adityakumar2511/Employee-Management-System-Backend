# EMS Pro — Backend API

Complete Node.js + Express + PostgreSQL backend for the Employee Management System with real-time Socket.io support.

---

## 🚀 Tech Stack

| Technology | Purpose |
|-----------|---------|
| Node.js 18+ | Runtime |
| Express.js | Web framework |
| PostgreSQL (Neon) | Database |
| Prisma ORM | Database client |
| Socket.io | Real-time updates |
| JWT | Authentication |
| Firebase Admin SDK | Push notifications (FCM) |
| Nodemailer | Email (SMTP) |
| Multer | File uploads |
| pdfkit | PDF generation |
| xlsx | Excel export |
| Helmet + CORS | Security |

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# .env fill karo (database, JWT, SMTP, Firebase)

# 3. Database setup
npm run generate    # Prisma client generate
npm run migrate     # Tables create (migrations run)
npm run seed        # Admin + demo employee seed

# 4. Server start
npm run dev         # Development (nodemon auto-reload)
npm start           # Production
```

---

## 🔐 Default Login Credentials (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@emspro.com | Admin@123 |
| Employee | rahul@emspro.com | Employee@123 |

---

## 📁 Project Structure

```
Backend/
├── server.js                     # Entry point
├── .env                          # Environment variables
├── prisma/
│   └── schema.prisma             # 18 model DB schema
└── src/
    ├── server.js                 # Express + Socket.io setup
    ├── config/
    │   ├── database.js           # Prisma client instance
    │   ├── email.js              # Nodemailer SMTP config
    │   └── firebase.js           # Firebase Admin SDK
    ├── controllers/              # Business logic + Socket emits
    │   ├── auth.controller.js
    │   ├── employee.controller.js
    │   ├── attendance.controller.js
    │   ├── leave.controller.js
    │   ├── payroll.controller.js
    │   ├── personalHoliday.controller.js
    │   ├── task.controller.js
    │   ├── report.controller.js
    │   └── settings.controller.js
    ├── routes/
    │   ├── auth.routes.js
    │   ├── employee.routes.js
    │   ├── attendance.routes.js
    │   ├── leave.routes.js
    │   ├── payroll.routes.js
    │   ├── personalHoliday.routes.js
    │   ├── task.routes.js
    │   ├── settings.routes.js
    │   └── report.routes.js
    ├── middleware/
    │   ├── auth.js               # JWT verify, requireAdmin, requireSelfOrAdmin
    │   ├── errorHandler.js       # Global error handler (Prisma errors included)
    │   └── upload.js             # Multer config (avatars, documents, logos)
    ├── utils/
    │   ├── dateHelper.js         # dayjs helpers, date ranges
    │   ├── excelHelper.js        # Excel import/export
    │   ├── jwt.js                # Token generation/verification
    │   ├── pdfGenerator.js       # Salary slip PDF
    │   └── response.js           # Standardized API responses
    ├── database/
    │   └── seed.js               # DB seeder
    └── uploads/                  # Static file storage
        ├── avatars/
        ├── documents/
        ├── logos/
        └── imports/
```

---

## ⚡ Real-time Updates (Socket.io)

### How it works

```
User action  →  Controller saves to DB  →  global.io.emit()
                                                 ↓
                              Frontend Socket receives event
                                                 ↓
                              React Query cache invalidate
                                                 ↓
                                    UI updates instantly ✅
```

### Socket Rooms

| Room | Kab join hota hai | Kiske liye |
|------|-------------------|-----------|
| `admin` | Admin login karta hai | Admin-wide updates |
| `employee:{id}` | Koi bhi user login karta hai | Personal updates |

### Events Table

| Event | `type` Value | Kab emit hota hai |
|-------|-------------|-------------------|
| `data:refresh` | `employees` | Employee create/update/delete/status |
| `data:refresh` | `attendance` | Check-in/out/override/WFH |
| `data:refresh` | `leaves` | Apply/approve/reject/cancel |
| `data:refresh` | `tasks` | Create/update/progress/delete/comment |
| `data:refresh` | `personal-holidays` | Apply/approve/reject |
| `data:refresh` | `payroll` | Generate/mark-paid |
| `data:refresh` | `dashboard` | Koi bhi stat-affecting action |
| `attendance:updated` | — | Employee ka apna check-in/out |

---

## 📚 API Endpoints

### Auth `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /login | ❌ | Email ya EmployeeID se login |
| POST | /logout | ❌ | Refresh token invalidate |
| POST | /refresh | ❌ | Access token refresh |
| POST | /forgot-password | ❌ | OTP email pe bhejo |
| POST | /verify-otp | ❌ | OTP verify karo |
| POST | /reset-password | ❌ | Password reset |
| PUT | /change-password | ✅ | Apna password change |
| GET | /me | ✅ | Logged-in user info |
| PUT | /fcm-token | ✅ | FCM push token update |

### Employees `/api/employees`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | / | Admin | Sab employees list |
| POST | / | Admin | Employee create |
| GET | /departments | Any | Departments list |
| GET | /bulk-template | Admin | Excel template download |
| POST | /bulk-import | Admin | Excel se import |
| GET | /:id | Any | Employee detail |
| PUT | /:id | Admin | Employee update |
| DELETE | /:id | Admin | Deactivate |
| PATCH | /:id/status | Admin | Status toggle |
| POST | /:id/reset-password | Admin | Password reset |
| POST | /:id/send-credentials | Admin | Credentials email |
| POST | /:id/documents | Any | Document upload |

### Attendance `/api/attendance`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | /check-in | Employee | GPS check-in |
| POST | /check-out | Employee | Check-out |
| GET | /today | Employee | Aaj ka status |
| GET | /my | Employee | Apni history |
| GET | / | Admin | Sab attendance |
| POST | /override | Admin | Manual override |
| POST | /wfh-request | Employee | WFH request |
| PATCH | /wfh-request/:id | Admin | WFH approve/reject |

### Leaves `/api/leaves`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | / | Employee | Leave apply |
| GET | /my | Employee | Apni leaves |
| GET | / | Admin | Sab leaves |
| GET | /balance | Employee | Apna balance |
| GET | /balance/:empId | Admin | Employee balance |
| PATCH | /:id/approve | Admin | Approve |
| PATCH | /:id/reject | Admin | Reject |
| DELETE | /:id | Employee | Cancel |
| GET | /types | Any | Leave types |
| POST | /types | Admin | Leave type create |
| POST | /year-end | Admin | Year-end carry-forward |

### Personal Holidays `/api/personal-holidays`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | / | Employee | PH apply |
| GET | /my | Employee | Apni PH history |
| GET | / | Admin | Sab PH requests |
| GET | /balance | Employee | Apna balance |
| PATCH | /:id/approve | Admin | Approve (no salary cut) |
| PATCH | /:id/reject | Admin | Reject |
| POST | /quota/:employeeId | Admin | Employee quota set |
| POST | /quota/bulk | Admin | Bulk quota set |
| POST | /year-end | Admin | Year-end reset |

### Payroll `/api/payroll`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /structure/:empId | Admin | Salary structure |
| POST | /structure/:empId | Admin | Structure save |
| GET | /templates | Admin | Templates list |
| POST | /templates | Admin | Template save |
| POST | /templates/:id/apply | Admin | Template apply |
| POST | /generate | Admin | Monthly payroll generate |
| GET | / | Admin | Payroll list |
| PATCH | /:id/override | Admin | Net salary override |
| PATCH | /:id/mark-paid | Admin | Mark paid + notify |
| GET | /my-slips | Employee | Apne salary slips |
| GET | /:id/slip/download | Any | PDF slip download |
| GET | /bank-export | Admin | Bank CSV export |

### Tasks `/api/tasks`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | / | Any | Task create |
| GET | / | Admin | Sab tasks |
| GET | /my | Employee | Apne tasks |
| GET | /:id | Any | Task detail |
| PUT | /:id | Admin | Task edit |
| PATCH | /:id/progress | Any | Completion % update |
| DELETE | /:id | Admin | Task delete |
| POST | /:id/comments | Any | Comment add |
| GET | /completion-report | Admin | Per-employee report |

### Settings `/api/settings`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /company | Any | Company info |
| PUT | /company | Admin | Company update |
| POST | /company/logo | Admin | Logo upload |
| GET | /geo/locations | Any | Office locations |
| POST | /geo/locations | Admin | Location add |
| PUT | /geo/locations/:id | Admin | Location update |
| DELETE | /geo/locations/:id | Admin | Location remove |
| GET | /holidays | Any | Holiday list |
| POST | /holidays | Admin | Holiday add |
| DELETE | /holidays/:id | Admin | Holiday delete |

### Reports `/api/reports`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /dashboard-stats | Any | Dashboard KPIs |
| GET | /attendance | Admin | Attendance report |
| GET | /leave | Admin | Leave report |
| GET | /payroll | Admin | Payroll report |
| GET | /lop | Admin | LOP report |
| GET | /personal-holidays | Admin | PH report |
| GET | /tasks | Admin | Task completion |
| GET | /:type/export | Admin | Excel export |

---

## 🔐 Environment Variables

```env
# ─── Server ───────────────────────────────────────────────────────────────────
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# ─── Database (Neon PostgreSQL) ───────────────────────────────────────────────
# Pooler URL (runtime queries ke liye) — port 6543
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

# Direct URL (migrations ke liye) — port 5432
DIRECT_URL=postgresql://neondb_owner:PASSWORD@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# ─── JWT ──────────────────────────────────────────────────────────────────────
JWT_SECRET=your_strong_256bit_secret_key_here
JWT_REFRESH_SECRET=your_different_strong_refresh_secret

# ─── Email (SMTP) ─────────────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM=EMS Pro <your_email@gmail.com>

# ─── Firebase (Push Notifications) ───────────────────────────────────────────
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

---

## 🗄️ Database Setup (Neon — Recommended)

Supabase free tier pe 1 week baad **pause** ho jaata hai. **Neon** use karo — free tier pe **kabhi pause nahi hota**.

```bash
# 1. neon.tech pe account banao (GitHub se login)
# 2. Project banao — Region: AWS Asia Pacific (Singapore)
# 3. Dashboard → Connection Details:
#    - Connection pooling ON  → DATABASE_URL mein paste karo
#    - Connection pooling OFF → DIRECT_URL mein paste karo
# 4. .env update karo
# 5. Run karo:

npx prisma generate
npx prisma migrate deploy
npm run seed
```

---

## 🗄️ Database Schema (18 Models)

```
Auth/Users     → Employee, Department, RefreshToken, OTP
Attendance     → Attendance, WFHRequest
Leaves         → LeaveType, Leave, LeaveBalance
Holidays       → PersonalHoliday, PersonalHolidayBalance
Payroll        → SalaryStructure, SalaryComponent, SalaryTemplate, Payroll
Tasks          → Task, TaskComment
Settings       → GeoLocation, Holiday, CompanySettings, EmployeeDocument
```

---

## 🔒 Security Features

- JWT access tokens (15 min expiry) + refresh tokens (7 days)
- Refresh token rotation on every use
- bcrypt password hashing (cost factor 12)
- Helmet security headers
- CORS whitelisting (FRONTEND_URL only)
- Rate limiting — 500 req/15min (API), 20 req/15min (auth)
- Admin-only route protection middleware
- File type validation on all uploads

---

## 🐳 Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npx prisma generate
EXPOSE 5000
CMD ["npm", "start"]
```

---

## 🌐 Recommended Deploy Platforms

| Platform | Free Tier | Best For |
|----------|-----------|---------|
| **Railway** | ✅ | Node.js (easiest) |
| **Render** | ✅ | Auto GitHub deploy |
| **DigitalOcean App Platform** | ❌ | Production |

---

## 📄 License

This project is proprietary and confidential.