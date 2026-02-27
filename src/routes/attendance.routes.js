const express = require("express")
const router = express.Router()
const ctrl = require("../controllers/attendance.controller")
const { authenticate, requireAdmin } = require("../middleware/auth")

router.use(authenticate)

router.post("/check-in", ctrl.checkIn)
router.post("/check-out", ctrl.checkOut)
router.get("/today", ctrl.getTodayStatus)
router.get("/my", ctrl.getMyAttendance)
router.get("/", requireAdmin, ctrl.getAllAttendance)
router.get("/employee/:employeeId", requireAdmin, ctrl.getEmployeeAttendance)
router.post("/override", requireAdmin, ctrl.manualOverride)
router.get("/monthly-report", requireAdmin, ctrl.getMonthlyReport)
router.get("/out-of-range-logs", requireAdmin, ctrl.getOutOfRangeLogs)
router.post("/wfh-request", ctrl.requestWFH)
router.patch("/wfh-request/:id", requireAdmin, ctrl.approveWFH)

module.exports = router
