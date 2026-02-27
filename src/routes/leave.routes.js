const express = require("express")
const router = express.Router()
const ctrl = require("../controllers/leave.controller")
const { authenticate, requireAdmin } = require("../middleware/auth")

router.use(authenticate)

router.get("/types", ctrl.getLeaveTypes)
router.post("/types", requireAdmin, ctrl.createLeaveType)
router.put("/types/:id", requireAdmin, ctrl.updateLeaveType)

router.get("/balance", ctrl.getBalance)
router.get("/balance/:employeeId", requireAdmin, ctrl.getEmployeeBalance)

router.post("/year-end", requireAdmin, ctrl.yearEndCarryForward)

router.post("/", ctrl.apply)
router.get("/my", ctrl.getMyLeaves)
router.get("/", requireAdmin, ctrl.getAllLeaves)

router.patch("/:id/approve", requireAdmin, ctrl.approveLeave)
router.patch("/:id/reject", requireAdmin, ctrl.rejectLeave)
router.delete("/:id", ctrl.cancelLeave)

module.exports = router
