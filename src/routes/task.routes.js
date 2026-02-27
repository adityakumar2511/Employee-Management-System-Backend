const express = require("express")
const router = express.Router()
const ctrl = require("../controllers/task.controller")
const { authenticate, requireAdmin } = require("../middleware/auth")

router.use(authenticate)

router.get("/my", ctrl.getMyTasks)
router.get("/completion-report", requireAdmin, ctrl.getCompletionReport)

router.post("/", authenticate, ctrl.create)
router.get("/", requireAdmin, ctrl.getAll)

router.get("/:id", ctrl.getById)
router.put("/:id", requireAdmin, ctrl.update)
router.patch("/:id/progress", ctrl.updateProgress)
router.delete("/:id", requireAdmin, ctrl.deleteTask)
router.post("/:id/comments", ctrl.addComment)

module.exports = router
