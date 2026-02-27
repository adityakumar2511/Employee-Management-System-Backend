const prisma = require("../config/database")
const { success, error, notFound } = require("../utils/response")
const path = require("path")

// GET /api/settings/company
async function getCompany(req, res, next) {
  try {
    let settings = await prisma.companySettings.findFirst()
    if (!settings) {
      settings = await prisma.companySettings.create({ data: {} })
    }
    return success(res, settings)
  } catch (err) {
    next(err)
  }
}

// PUT /api/settings/company
async function updateCompany(req, res, next) {
  try {
    const {
      name, website, email, phone, address, employeeIdPrefix,
      workingDaysPerMonth, financialYearStart, geoFenceEnabled,
    } = req.body

    let settings = await prisma.companySettings.findFirst()
    if (!settings) {
      settings = await prisma.companySettings.create({ data: {} })
    }

    const updated = await prisma.companySettings.update({
      where: { id: settings.id },
      data: {
        name: name || undefined,
        website: website || undefined,
        email: email || undefined,
        phone: phone || undefined,
        address: address || undefined,
        employeeIdPrefix: employeeIdPrefix || undefined,
        workingDaysPerMonth: workingDaysPerMonth ? parseInt(workingDaysPerMonth) : undefined,
        financialYearStart: financialYearStart ? parseInt(financialYearStart) : undefined,
        geoFenceEnabled: geoFenceEnabled !== undefined ? Boolean(geoFenceEnabled) : undefined,
      },
    })

    return success(res, updated, "Company settings updated")
  } catch (err) {
    next(err)
  }
}

// POST /api/settings/company/logo
async function uploadLogo(req, res, next) {
  try {
    if (!req.file) return error(res, "No file uploaded", 400)
    const logoUrl = `/uploads/logos/${req.file.filename}`

    let settings = await prisma.companySettings.findFirst()
    if (!settings) settings = await prisma.companySettings.create({ data: {} })

    await prisma.companySettings.update({ where: { id: settings.id }, data: { logo: logoUrl } })
    return success(res, { logoUrl }, "Logo uploaded")
  } catch (err) {
    next(err)
  }
}

// GET /api/settings/geo
async function getGeoSettings(req, res, next) {
  try {
    const settings = await prisma.companySettings.findFirst()
    return success(res, { geoFenceEnabled: settings?.geoFenceEnabled ?? true })
  } catch (err) {
    next(err)
  }
}

// PUT /api/settings/geo
async function updateGeoSettings(req, res, next) {
  try {
    const { geoFenceEnabled } = req.body
    let settings = await prisma.companySettings.findFirst()
    if (!settings) settings = await prisma.companySettings.create({ data: {} })
    await prisma.companySettings.update({ where: { id: settings.id }, data: { geoFenceEnabled: Boolean(geoFenceEnabled) } })
    return success(res, {}, "Geo settings updated")
  } catch (err) {
    next(err)
  }
}

// GET /api/settings/geo/locations
async function getGeoLocations(req, res, next) {
  try {
    const locations = await prisma.geoLocation.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    })
    return success(res, locations)
  } catch (err) {
    next(err)
  }
}

// POST /api/settings/geo/locations
async function addGeoLocation(req, res, next) {
  try {
    const { name, address, latitude, longitude, radius } = req.body
    const location = await prisma.geoLocation.create({
      data: {
        name,
        address,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radius: parseInt(radius) || 500,
      },
    })
    return success(res, location, "Office location added", 201)
  } catch (err) {
    next(err)
  }
}

// PUT /api/settings/geo/locations/:id
async function updateGeoLocation(req, res, next) {
  try {
    const { name, address, latitude, longitude, radius } = req.body
    const location = await prisma.geoLocation.update({
      where: { id: req.params.id },
      data: {
        name,
        address,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radius: parseInt(radius) || 500,
      },
    })
    return success(res, location, "Location updated")
  } catch (err) {
    next(err)
  }
}

// DELETE /api/settings/geo/locations/:id
async function deleteGeoLocation(req, res, next) {
  try {
    await prisma.geoLocation.update({ where: { id: req.params.id }, data: { isActive: false } })
    return success(res, {}, "Location removed")
  } catch (err) {
    next(err)
  }
}

// GET /api/settings/holidays
async function getHolidayList(req, res, next) {
  try {
    const { year = new Date().getFullYear() } = req.query
    const holidays = await prisma.holiday.findMany({
      where: { year: parseInt(year) },
      orderBy: { date: "asc" },
    })
    return success(res, holidays)
  } catch (err) {
    next(err)
  }
}

// POST /api/settings/holidays
async function addHoliday(req, res, next) {
  try {
    const { name, date, type } = req.body
    const dateObj = new Date(date)
    const holiday = await prisma.holiday.create({
      data: { name, date: dateObj, type: type || "NATIONAL", year: dateObj.getFullYear() },
    })
    return success(res, holiday, "Holiday added", 201)
  } catch (err) {
    next(err)
  }
}

// DELETE /api/settings/holidays/:id
async function deleteHoliday(req, res, next) {
  try {
    await prisma.holiday.delete({ where: { id: req.params.id } })
    return success(res, {}, "Holiday deleted")
  } catch (err) {
    next(err)
  }
}

module.exports = {
  getCompany, updateCompany, uploadLogo,
  getGeoSettings, updateGeoSettings,
  getGeoLocations, addGeoLocation, updateGeoLocation, deleteGeoLocation,
  getHolidayList, addHoliday, deleteHoliday,
}
