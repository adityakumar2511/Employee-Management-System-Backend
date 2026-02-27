const express = require("express")
const router = express.Router()
const ctrl = require("../controllers/settings.controller")
const { authenticate, requireAdmin } = require("../middleware/auth")
const { uploadLogo } = require("../middleware/upload")

router.use(authenticate)

router.get("/company", ctrl.getCompany)
router.put("/company", requireAdmin, ctrl.updateCompany)
router.post("/company/logo", requireAdmin, uploadLogo, ctrl.uploadLogo)

router.get("/geo", ctrl.getGeoSettings)
router.put("/geo", requireAdmin, ctrl.updateGeoSettings)
router.get("/geo/locations", ctrl.getGeoLocations)
router.post("/geo/locations", requireAdmin, ctrl.addGeoLocation)
router.put("/geo/locations/:id", requireAdmin, ctrl.updateGeoLocation)
router.delete("/geo/locations/:id", requireAdmin, ctrl.deleteGeoLocation)

router.get("/holidays", ctrl.getHolidayList)
router.post("/holidays", requireAdmin, ctrl.addHoliday)
router.delete("/holidays/:id", requireAdmin, ctrl.deleteHoliday)

module.exports = router
