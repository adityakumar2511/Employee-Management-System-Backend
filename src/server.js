require("dotenv").config()
const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const morgan = require("morgan")
const path = require("path")
const rateLimit = require("express-rate-limit")

const { errorHandler, notFound } = require("./middleware/errorHandler")

// Routes
const authRoutes = require("./routes/auth.routes")
const employeeRoutes = require("./routes/employee.routes")
const attendanceRoutes = require("./routes/attendance.routes")
const leaveRoutes = require("./routes/leave.routes")
const personalHolidayRoutes = require("./routes/personalHoliday.routes")
const payrollRoutes = require("./routes/payroll.routes")
const taskRoutes = require("./routes/task.routes")
const settingsRoutes = require("./routes/settings.routes")
const reportRoutes = require("./routes/report.routes")

const app = express()
const PORT = process.env.PORT || 5000

// ─── SECURITY ─────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // allow serving uploaded files
}))

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}))

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 500,
  message: { success: false, message: "Too many requests, please try again later" },
  skip: (req) => process.env.NODE_ENV === "development",
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many login attempts, please try again later" },
  skip: (req) => process.env.NODE_ENV === "development",
})

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"))
}

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, authRoutes)
app.use("/api/employees", apiLimiter, employeeRoutes)
app.use("/api/attendance", apiLimiter, attendanceRoutes)
app.use("/api/leaves", apiLimiter, leaveRoutes)
app.use("/api/personal-holidays", apiLimiter, personalHolidayRoutes)
app.use("/api/payroll", apiLimiter, payrollRoutes)
app.use("/api/tasks", apiLimiter, taskRoutes)
app.use("/api/settings", apiLimiter, settingsRoutes)
app.use("/api/reports", apiLimiter, reportRoutes)

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "EMS Pro API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  })
})

// Root
app.get("/", (req, res) => {
  res.json({
    message: "EMS Pro Backend API",
    version: "1.0.0",
    docs: "/health",
    endpoints: {
      auth: "/api/auth",
      employees: "/api/employees",
      attendance: "/api/attendance",
      leaves: "/api/leaves",
      personalHolidays: "/api/personal-holidays",
      payroll: "/api/payroll",
      tasks: "/api/tasks",
      settings: "/api/settings",
      reports: "/api/reports",
    },
  })
})

// ─── ERROR HANDLING ───────────────────────────────────────────────────────────
app.use(notFound)
app.use(errorHandler)

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 EMS Pro API running on http://localhost:${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`─────────────────────────────────────────────\n`)
})

module.exports = app
