# EMS Pro — Backend API

Complete Node.js + Express + PostgreSQL backend for the Employee Management System.

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: JWT (access + refresh tokens)
- **Push Notifications**: Firebase Admin SDK (FCM)
- **Email**: Nodemailer (SMTP)
- **File Processing**: multer, pdfkit, xlsx
- **Security**: helmet, cors, rate-limiting

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL, SMTP, and Firebase credentials

# 3. Run database migrations
npm run generate    # generate Prisma client
npm run migrate     # run migrations (creates all tables)
npm run seed        # seed with admin + demo employee

# 4. Start the server
npm run dev         # development with auto-reload
npm start           # production
```

## Default Credentials (after seeding)

| Role     | Email               | Password      |
|----------|---------------------|---------------|
| Admin    | admin@emspro.com    | Admin@123     |
| Employee | rahul@emspro.com    | Employee@123  |

## API Endpoints

### Auth `/api/auth`
| Method | Path                   | Auth | Description              |
|--------|------------------------|------|--------------------------|
| POST   | /login                 | ❌    | Login with email/employeeId |
| POST   | /logout                | ❌    | Invalidate refresh token |
| POST   | /refresh               | ❌    | Refresh access token     |
| POST   | /forgot-password       | ❌    | Send OTP to email        |
| POST   | /verify-otp            | ❌    | Verify OTP               |
| POST   | /reset-password        | ❌    | Reset password           |
| PUT    | /change-password       | ✅    | Change own password      |
| GET    | /me                    | ✅    | Get logged-in user info  |
| PUT    | /fcm-token             | ✅    | Update FCM push token    |

### Employees `/api/employees`
| Method | Path                       | Role  | Description          |
|--------|----------------------------|-------|----------------------|
| GET    | /                          | Admin | List all employees   |
| POST   | /                          | Admin | Create employee      |
| GET    | /departments               | Any   | List departments     |
| GET    | /bulk-template             | Admin | Download Excel template |
| POST   | /bulk-import               | Admin | Import from Excel    |
| GET    | /:id                       | Any   | Get employee details |
| PUT    | /:id                       | Admin | Update employee      |
| DELETE | /:id                       | Admin | Deactivate employee  |
| PATCH  | /:id/status                | Admin | Toggle active status |
| POST   | /:id/reset-password        | Admin | Reset password       |
| POST   | /:id/send-credentials      | Admin | Email login details  |
| POST   | /:id/documents             | Any   | Upload document      |

### Attendance `/api/attendance`
| Method | Path                    | Role     | Description              |
|--------|-------------------------|----------|--------------------------|
| POST   | /check-in               | Employee | Geo-validated check-in   |
| POST   | /check-out              | Employee | Check-out                |
| GET    | /today                  | Employee | Today's attendance status |
| GET    | /my                     | Employee | Own attendance history   |
| GET    | /                       | Admin    | All employee attendance  |
| POST   | /override               | Admin    | Manual override          |
| POST   | /wfh-request            | Employee | Request WFH              |
| PATCH  | /wfh-request/:id        | Admin    | Approve/reject WFH       |

### Leaves `/api/leaves`
| Method | Path               | Role     | Description          |
|--------|--------------------|----------|----------------------|
| POST   | /                  | Employee | Apply for leave      |
| GET    | /my                | Employee | Own leave history    |
| GET    | /                  | Admin    | All leave requests   |
| GET    | /balance           | Employee | Own leave balance    |
| GET    | /balance/:empId    | Admin    | Employee balance     |
| PATCH  | /:id/approve       | Admin    | Approve leave        |
| PATCH  | /:id/reject        | Admin    | Reject leave         |
| DELETE | /:id               | Employee | Cancel pending leave |
| GET    | /types             | Any      | List leave types     |
| POST   | /types             | Admin    | Create leave type    |
| POST   | /year-end          | Admin    | Year-end carry-forward |

### Personal Holidays `/api/personal-holidays`
| Method | Path                    | Role     | Description           |
|--------|-------------------------|----------|-----------------------|
| POST   | /                       | Employee | Apply for PH          |
| GET    | /my                     | Employee | Own PH history        |
| GET    | /                       | Admin    | All PH requests       |
| GET    | /balance                | Employee | Own PH balance        |
| PATCH  | /:id/approve            | Admin    | Approve (no salary cut) |
| PATCH  | /:id/reject             | Admin    | Reject                |
| POST   | /quota/:employeeId      | Admin    | Set employee quota    |
| POST   | /quota/bulk             | Admin    | Set bulk quota        |
| POST   | /year-end               | Admin    | Year-end reset        |

### Payroll `/api/payroll`
| Method | Path                      | Role     | Description            |
|--------|---------------------------|----------|------------------------|
| GET    | /structure/:empId         | Admin    | Get salary structure   |
| POST   | /structure/:empId         | Admin    | Save salary structure  |
| GET    | /templates                | Admin    | List templates         |
| POST   | /templates                | Admin    | Save template          |
| POST   | /templates/:id/apply      | Admin    | Apply to employees     |
| POST   | /generate                 | Admin    | Generate monthly payroll |
| GET    | /                         | Admin    | List payroll records   |
| PATCH  | /:id/override             | Admin    | Override net salary    |
| PATCH  | /:id/mark-paid            | Admin    | Mark as paid + notify  |
| GET    | /my-slips                 | Employee | Own salary slips       |
| GET    | /:id/slip/download        | Any      | Download PDF slip      |
| GET    | /bank-export              | Admin    | Bank transfer CSV      |

### Tasks `/api/tasks`
| Method | Path                 | Role     | Description            |
|--------|----------------------|----------|------------------------|
| POST   | /                    | Any      | Create task            |
| GET    | /                    | Admin    | All tasks              |
| GET    | /my                  | Employee | Own tasks              |
| GET    | /:id                 | Any      | Task details           |
| PUT    | /:id                 | Admin    | Edit task              |
| PATCH  | /:id/progress        | Any      | Update completion %    |
| DELETE | /:id                 | Admin    | Delete task            |
| POST   | /:id/comments        | Any      | Add comment            |
| GET    | /completion-report   | Admin    | Report per employee    |

### Settings `/api/settings`
| Method | Path                    | Role  | Description         |
|--------|-------------------------|-------|---------------------|
| GET    | /company                | Any   | Company info        |
| PUT    | /company                | Admin | Update company info |
| POST   | /company/logo           | Admin | Upload logo         |
| GET    | /geo/locations          | Any   | Office locations    |
| POST   | /geo/locations          | Admin | Add office location |
| PUT    | /geo/locations/:id      | Admin | Update location     |
| DELETE | /geo/locations/:id      | Admin | Remove location     |
| GET    | /holidays               | Any   | Holiday list        |
| POST   | /holidays               | Admin | Add holiday         |
| DELETE | /holidays/:id           | Admin | Remove holiday      |

### Reports `/api/reports`
| Method | Path                      | Role  | Description          |
|--------|---------------------------|-------|----------------------|
| GET    | /dashboard-stats          | Any   | Dashboard KPIs       |
| GET    | /attendance               | Admin | Attendance report    |
| GET    | /leave                    | Admin | Leave report         |
| GET    | /payroll                  | Admin | Payroll report       |
| GET    | /lop                      | Admin | LOP report           |
| GET    | /personal-holidays        | Admin | PH report            |
| GET    | /tasks                    | Admin | Task completion      |
| GET    | /:type/export             | Admin | Export to Excel      |

## Database Schema

The schema covers 18 models:
- Employee, Department, RefreshToken, OTP
- Attendance, WFHRequest
- LeaveType, Leave, LeaveBalance
- PersonalHoliday, PersonalHolidayBalance
- SalaryStructure, SalaryComponent, SalaryTemplate
- Payroll
- Task, TaskComment
- GeoLocation, Holiday, CompanySettings, EmployeeDocument

## Security Features

- JWT access tokens (15min) + refresh tokens (7d)
- Refresh token rotation on use
- bcrypt password hashing (cost factor 12)
- Helmet security headers
- CORS whitelisting
- Rate limiting (500 req/15min API, 20 req/15min auth)
- Admin-only route protection
- File type validation on uploads

## Deployment

### Docker (recommended)
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

### Environment Variables for Production
```
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<strong-random-256-bit-key>
JWT_REFRESH_SECRET=<different-strong-key>
SMTP_HOST=smtp.sendgrid.net
FRONTEND_URL=https://yourdomain.com
```
