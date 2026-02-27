const express = require("express")
const router = express.Router()
const ctrl = require("../controllers/report.controller")
const { authenticate, requireAdmin } = require("../middleware/auth")

router.use(authenticate)

router.get("/dashboard-stats", ctrl.getDashboardStats)
router.get("/attendance", requireAdmin, ctrl.getAttendanceReport)
router.get("/leave", requireAdmin, ctrl.getLeaveReport)
router.get("/payroll", requireAdmin, ctrl.getPayrollReport)
router.get("/lop", requireAdmin, ctrl.getLOPReport)
router.get("/personal-holidays", requireAdmin, ctrl.getPersonalHolidayReport)
router.get("/tasks", requireAdmin, ctrl.getTaskReport)
router.get("/:type/export", requireAdmin, ctrl.exportReport)

module.exports = router
