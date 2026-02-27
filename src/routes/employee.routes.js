const express = require("express")
const router = express.Router()
const ctrl = require("../controllers/employee.controller")
const { authenticate, requireAdmin } = require("../middleware/auth")
const { uploadDocument, uploadExcel } = require("../middleware/upload")

router.use(authenticate)

router.get("/departments", ctrl.getDepartments)
router.get("/bulk-template", requireAdmin, ctrl.downloadTemplate)
router.post("/bulk-import", requireAdmin, uploadExcel, ctrl.bulkImport)

router.get("/", requireAdmin, ctrl.getAll)
router.post("/", requireAdmin, ctrl.create)

router.get("/:id", ctrl.getById)
router.put("/:id", requireAdmin, ctrl.update)
router.delete("/:id", requireAdmin, ctrl.deleteEmployee)
router.patch("/:id/status", requireAdmin, ctrl.toggleStatus)
router.post("/:id/reset-password", requireAdmin, ctrl.resetPassword)
router.post("/:id/send-credentials", requireAdmin, ctrl.sendCredentials)
router.post("/:id/documents", uploadDocument, ctrl.uploadDocument)

module.exports = router
