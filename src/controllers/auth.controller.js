const bcrypt = require("bcryptjs")
const prisma = require("../config/database")
const { sendEmail, templates } = require("../config/email")
const {
  generateAccessToken, generateRefreshToken, verifyRefreshToken,
  generateOTP, generateTempPassword, getRefreshExpiry,
} = require("../utils/jwt")
const { success, error, notFound } = require("../utils/response")

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { emailOrEmployeeId, password, role } = req.body

    // Find by email or employeeId
    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { email: emailOrEmployeeId?.toLowerCase() },
          { employeeId: emailOrEmployeeId },
        ],
      },
      include: { department: true },
    })

    if (!employee) {
      return error(res, "Invalid credentials", 401)
    }

    if (employee.status === "INACTIVE") {
      return error(res, "Your account has been deactivated. Contact HR.", 403)
    }

    if (role && employee.role !== role) {
      return error(res, `This account is not registered as ${role.toLowerCase()}`, 401)
    }

    const isValid = await bcrypt.compare(password, employee.passwordHash)
    if (!isValid) {
      return error(res, "Invalid credentials", 401)
    }

    const payload = { id: employee.id, role: employee.role }
    const accessToken = generateAccessToken(payload)
    const refreshToken = generateRefreshToken(payload)

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        employeeId: employee.id,
        expiresAt: getRefreshExpiry(),
      },
    })

    const { passwordHash, fcmToken, ...userData } = employee

    return success(res, {
      accessToken,
      refreshToken,
      user: userData,
    }, "Login successful")
  } catch (err) {
    next(err)
  }
}

// POST /api/auth/logout
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
    }
    return success(res, {}, "Logged out successfully")
  } catch (err) {
    next(err)
  }
}

// POST /api/auth/refresh
async function refreshToken(req, res, next) {
  try {
    const { refreshToken: token } = req.body
    if (!token) return error(res, "Refresh token required", 401)

    const decoded = verifyRefreshToken(token)
    const stored = await prisma.refreshToken.findUnique({ where: { token } })

    if (!stored || stored.expiresAt < new Date()) {
      return error(res, "Refresh token expired or invalid", 401)
    }

    const employee = await prisma.employee.findUnique({ where: { id: decoded.id } })
    if (!employee || employee.status === "INACTIVE") {
      return error(res, "User not found or inactive", 401)
    }

    const accessToken = generateAccessToken({ id: employee.id, role: employee.role })
    const newRefreshToken = generateRefreshToken({ id: employee.id, role: employee.role })

    // Rotate refresh token
    await prisma.refreshToken.update({
      where: { token },
      data: { token: newRefreshToken, expiresAt: getRefreshExpiry() },
    })

    return success(res, { accessToken, refreshToken: newRefreshToken })
  } catch (err) {
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
      return error(res, "Invalid refresh token", 401)
    }
    next(err)
  }
}

// POST /api/auth/forgot-password
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body
    const employee = await prisma.employee.findUnique({ where: { email: email.toLowerCase() } })

    // Always return success (security: don't reveal if email exists)
    if (!employee) {
      return success(res, {}, "If your email is registered, you will receive an OTP")
    }

    const otp = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await prisma.oTP.create({
      data: { email: email.toLowerCase(), otp, expiresAt, employeeId: employee.id },
    })

    const emailContent = templates.resetOTP(employee.name, otp)
    await sendEmail({ to: email, ...emailContent })

    return success(res, {}, "OTP sent to your email")
  } catch (err) {
    next(err)
  }
}

// POST /api/auth/verify-otp
async function verifyOTP(req, res, next) {
  try {
    const { email, otp } = req.body

    const otpRecord = await prisma.oTP.findFirst({
      where: {
        email: email.toLowerCase(),
        otp,
        used: false,
        expiresAt: { gt: new Date() },
      },
    })

    if (!otpRecord) {
      return error(res, "Invalid or expired OTP", 400)
    }

    // Mark OTP as used
    await prisma.oTP.update({ where: { id: otpRecord.id }, data: { used: true } })

    // Generate a short-lived reset token
    const resetToken = generateAccessToken({ id: otpRecord.employeeId, purpose: "reset" })

    return success(res, { resetToken }, "OTP verified")
  } catch (err) {
    next(err)
  }
}

// POST /api/auth/reset-password
async function resetPassword(req, res, next) {
  try {
    const { resetToken, newPassword } = req.body

    let decoded
    try {
      decoded = require("jsonwebtoken").verify(resetToken, process.env.JWT_SECRET)
    } catch {
      return error(res, "Invalid or expired reset token", 400)
    }

    if (decoded.purpose !== "reset") {
      return error(res, "Invalid reset token", 400)
    }

    const hash = await bcrypt.hash(newPassword, 12)
    await prisma.employee.update({
      where: { id: decoded.id },
      data: { passwordHash: hash },
    })

    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({ where: { employeeId: decoded.id } })

    return success(res, {}, "Password reset successfully")
  } catch (err) {
    next(err)
  }
}

// PUT /api/auth/change-password
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body
    const employee = await prisma.employee.findUnique({ where: { id: req.user.id } })

    const isValid = await bcrypt.compare(currentPassword, employee.passwordHash)
    if (!isValid) {
      return error(res, "Current password is incorrect", 400)
    }

    const hash = await bcrypt.hash(newPassword, 12)
    await prisma.employee.update({ where: { id: req.user.id }, data: { passwordHash: hash } })

    return success(res, {}, "Password changed successfully")
  } catch (err) {
    next(err)
  }
}

// GET /api/auth/me
async function getMe(req, res, next) {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.user.id },
      include: { department: true },
      omit: { passwordHash: true },
    })
    return success(res, employee)
  } catch (err) {
    next(err)
  }
}

// PUT /api/auth/fcm-token
async function updateFCMToken(req, res, next) {
  try {
    const { fcmToken } = req.body
    await prisma.employee.update({ where: { id: req.user.id }, data: { fcmToken } })
    return success(res, {}, "FCM token updated")
  } catch (err) {
    next(err)
  }
}

module.exports = { login, logout, refreshToken, forgotPassword, verifyOTP, resetPassword, changePassword, getMe, updateFCMToken }
