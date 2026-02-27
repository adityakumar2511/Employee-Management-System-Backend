const express = require("express")
const router = express.Router()
const ctrl = require("../controllers/payroll.controller")
const { authenticate, requireAdmin } = require("../middleware/auth")

router.use(authenticate)

// Salary structure
router.get("/structure/:employeeId", requireAdmin, ctrl.getStructure)
router.post("/structure/:employeeId", requireAdmin, ctrl.saveStructure)

// Templates
router.get("/templates", requireAdmin, ctrl.getTemplates)
router.post("/templates", requireAdmin, ctrl.saveTemplate)
router.post("/templates/:templateId/apply", requireAdmin, ctrl.applyTemplate)

// Payroll generation & management
router.post("/generate", requireAdmin, ctrl.generate)
router.get("/bank-export", requireAdmin, ctrl.getBankExport)
router.post("/bulk-mark-paid", requireAdmin, ctrl.bulkMarkPaid)

// Employee: view own slips
router.get("/my-slips", ctrl.getMySalarySlips)

router.get("/", requireAdmin, ctrl.getPayrollList)
router.get("/:id", ctrl.getPayrollDetail)
router.patch("/:id/override", requireAdmin, ctrl.overrideSalary)
router.patch("/:id/mark-paid", requireAdmin, ctrl.markPaid)
router.get("/:id/slip/download", ctrl.downloadSlip)

module.exports = router
