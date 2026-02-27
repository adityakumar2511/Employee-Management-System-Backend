const express = require("express")
const router = express.Router()
const ctrl = require("../controllers/personalHoliday.controller")
const { authenticate, requireAdmin } = require("../middleware/auth")

router.use(authenticate)

router.get("/balance", ctrl.getBalance)
router.get("/balance/:employeeId", requireAdmin, ctrl.getEmployeeBalance)

router.post("/quota/bulk", requireAdmin, ctrl.setBulkQuota)
router.post("/quota/:employeeId", requireAdmin, ctrl.setQuota)

router.post("/year-end", requireAdmin, ctrl.yearEnd)

router.post("/", ctrl.apply)
router.get("/my", ctrl.getMyHolidays)
router.get("/", requireAdmin, ctrl.getAllHolidays)

router.patch("/:id/approve", requireAdmin, ctrl.approve)
router.patch("/:id/reject", requireAdmin, ctrl.reject)

module.exports = router
