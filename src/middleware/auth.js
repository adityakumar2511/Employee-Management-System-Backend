const jwt = require("jsonwebtoken")
const prisma = require("../config/database")

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "No token provided" })
    }

    const token = authHeader.split(" ")[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const employee = await prisma.employee.findUnique({
      where: { id: decoded.id },
      select: {
        id: true, employeeId: true, name: true, email: true,
        role: true, status: true, departmentId: true,
        designation: true, avatar: true, fcmToken: true,
      },
    })

    if (!employee) {
      return res.status(401).json({ success: false, message: "User not found" })
    }

    if (employee.status === "INACTIVE") {
      return res.status(403).json({ success: false, message: "Account is deactivated" })
    }

    req.user = employee
    next()
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expired", code: "TOKEN_EXPIRED" })
    }
    return res.status(401).json({ success: false, message: "Invalid token" })
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Admin access required" })
  }
  next()
}

function requireSelfOrAdmin(paramKey = "id") {
  return (req, res, next) => {
    const targetId = req.params[paramKey]
    if (req.user.role === "ADMIN" || req.user.id === targetId) {
      return next()
    }
    return res.status(403).json({ success: false, message: "Access denied" })
  }
}

module.exports = { authenticate, requireAdmin, requireSelfOrAdmin }
