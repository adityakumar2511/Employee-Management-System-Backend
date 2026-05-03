require("dotenv").config()
const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const morgan = require("morgan")
const path = require("path")
const rateLimit = require("express-rate-limit")
const http = require("http")
const { Server } = require("socket.io")
const prisma = require("./config/database")

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
const httpServer = http.createServer(app)
const PORT = process.env.PORT || 5000

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
  // ✅ Render free tier ke liye — connection stable rakhna
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
})

global.io = io

io.on("connection", (socket) => {
  console.log(`⚡ Client connected: ${socket.id}`)

  socket.on("join", (employeeId) => {
    socket.join(`employee:${employeeId}`)
    console.log(`👤 Employee ${employeeId} joined their room`)
  })

  socket.on("joinAdmin", () => {
    socket.join("admin")
    console.log(`🔑 Admin joined admin room`)
  })

  socket.on("disconnect", (reason) => {
    console.log(`❌ Client disconnected: ${socket.id} — ${reason}`)
  })
})

// ─── SECURITY ─────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}))

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}))

// ✅ Rate limiting — health check exempt karo
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, message: "Too many requests, please try again later" },
  skip: (req) =>
    process.env.NODE_ENV === "development" ||
    req.path === "/health",
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many login attempts, please try again later" },
  skip: () => process.env.NODE_ENV === "development",
})

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"))
}

app.use("/uploads", express.static(path.join(__dirname, "../uploads")))

// ─── HEALTH CHECK — sabse pehle, kisi bhi middleware se pehle ─────────────────
app.get("/health", async (req, res) => {
  // ✅ DB bhi check karo — Neon connected hai ya nahi
  let dbStatus = "ok"
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    dbStatus = "error"
  }

  res.status(dbStatus === "ok" ? 200 : 503).json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    service: "EMS Pro API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    db: dbStatus,
  })
})

app.get("/", (req, res) => {
  res.json({ message: "EMS Pro Backend API", version: "1.0.0" })
})

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

// ─── ERROR HANDLING ───────────────────────────────────────────────────────────
app.use(notFound)
app.use(errorHandler)

// ─── START SERVER ─────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🚀 EMS Pro API running on http://localhost:${PORT}`)
  console.log(`⚡ Socket.io enabled`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`─────────────────────────────────────────────\n`)
})

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully`)
  await prisma.$disconnect()
  httpServer.close(() => {
    console.log("✅ Server closed")
    process.exit(0)
  })
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err)
  shutdown("uncaughtException")
})
process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled Rejection:", reason)
})

module.exports = { app, io }