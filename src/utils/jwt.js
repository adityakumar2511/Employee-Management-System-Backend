const jwt = require("jsonwebtoken")
const crypto = require("crypto")

function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  })
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  })
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET)
}

function generateOTP(length = 6) {
  return crypto.randomInt(100000, 999999).toString()
}

function generateTempPassword(length = 10) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$"
  let password = ""
  for (let i = 0; i < length; i++) {
    password += chars[Math.floor(Math.random() * chars.length)]
  }
  return password
}

function getRefreshExpiry() {
  const days = parseInt(process.env.JWT_REFRESH_EXPIRES_IN) || 7
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

module.exports = {
  generateAccessToken, generateRefreshToken, verifyRefreshToken,
  generateOTP, generateTempPassword, getRefreshExpiry,
}
