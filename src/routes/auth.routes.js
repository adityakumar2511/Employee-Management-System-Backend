const express = require("express")
const router = express.Router()
const ctrl = require("../controllers/auth.controller")
const { authenticate } = require("../middleware/auth")

router.post("/login", ctrl.login)
router.post("/logout", ctrl.logout)
router.post("/refresh", ctrl.refreshToken)
router.post("/forgot-password", ctrl.forgotPassword)
router.post("/verify-otp", ctrl.verifyOTP)
router.post("/reset-password", ctrl.resetPassword)
router.put("/change-password", authenticate, ctrl.changePassword)
router.get("/me", authenticate, ctrl.getMe)
router.put("/fcm-token", authenticate, ctrl.updateFCMToken)

module.exports = router
