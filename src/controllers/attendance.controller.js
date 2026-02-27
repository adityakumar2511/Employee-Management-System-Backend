const prisma = require("../config/database")
const { success, error, notFound } = require("../utils/response")
const { dayjs, getMonthDateRange } = require("../utils/dateHelper")

// Haversine distance in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function validateGeoLocation(lat, lng) {
  const locations = await prisma.geoLocation.findMany({ where: { isActive: true } })
  if (!locations.length) return { valid: true, distance: 0, location: null }

  let nearest = null
  let minDistance = Infinity

  for (const loc of locations) {
    const dist = haversineDistance(lat, lng, loc.latitude, loc.longitude)
    if (dist < minDistance) {
      minDistance = dist
      nearest = loc
    }
  }

  return {
    valid: minDistance <= (nearest?.radius || 500),
    distance: Math.round(minDistance),
    location: nearest,
  }
}

// POST /api/attendance/check-in
async function checkIn(req, res, next) {
  try {
    const { latitude, longitude, accuracy } = req.body
    const today = dayjs().startOf("day").toDate()

    // Check if already checked in
    const existing = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: req.user.id, date: today } },
    })

    if (existing?.checkIn) {
      return error(res, "Already checked in today", 400)
    }

    // Validate geo-location (unless WFH approved)
    const wfhApproved = await prisma.wFHRequest.findFirst({
      where: {
        employeeId: req.user.id,
        date: today,
        status: "APPROVED",
      },
    })

    if (!wfhApproved && latitude && longitude) {
      const geo = await validateGeoLocation(parseFloat(latitude), parseFloat(longitude))
      const settings = await prisma.companySettings.findFirst()

      if (settings?.geoFenceEnabled && !geo.valid) {
        return error(res, `You are ${geo.distance}m away from office. Must be within ${geo.location?.radius || 500}m to check in.`, 400)
      }
    }

    const now = new Date()
    const attendance = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: req.user.id, date: today } },
      update: {
        checkIn: now,
        checkInLat: latitude ? parseFloat(latitude) : null,
        checkInLng: longitude ? parseFloat(longitude) : null,
        status: wfhApproved ? "WFH" : "PRESENT",
        isWFH: !!wfhApproved,
      },
      create: {
        employeeId: req.user.id,
        date: today,
        checkIn: now,
        checkInLat: latitude ? parseFloat(latitude) : null,
        checkInLng: longitude ? parseFloat(longitude) : null,
        status: wfhApproved ? "WFH" : "PRESENT",
        isWFH: !!wfhApproved,
      },
    })

    return success(res, { attendance, checkInTime: now }, "Checked in successfully")
  } catch (err) {
    next(err)
  }
}

// POST /api/attendance/check-out
async function checkOut(req, res, next) {
  try {
    const { latitude, longitude } = req.body
    const today = dayjs().startOf("day").toDate()

    const attendance = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: req.user.id, date: today } },
    })

    if (!attendance?.checkIn) {
      return error(res, "You haven't checked in today", 400)
    }

    if (attendance.checkOut) {
      return error(res, "Already checked out today", 400)
    }

    const now = new Date()
    const hoursWorked = (now - attendance.checkIn) / (1000 * 60 * 60)

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut: now,
        checkOutLat: latitude ? parseFloat(latitude) : null,
        checkOutLng: longitude ? parseFloat(longitude) : null,
        hoursWorked: Math.round(hoursWorked * 100) / 100,
        status: hoursWorked < 4 ? "HALF_DAY" : attendance.status,
      },
    })

    return success(res, { attendance: updated, hoursWorked: updated.hoursWorked }, "Checked out successfully")
  } catch (err) {
    next(err)
  }
}

// GET /api/attendance/today
async function getTodayStatus(req, res, next) {
  try {
    const today = dayjs().startOf("day").toDate()
    const attendance = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: req.user.id, date: today } },
    })

    return success(res, attendance || { status: "not_checked_in", checkIn: null, checkOut: null })
  } catch (err) {
    next(err)
  }
}

// GET /api/attendance/my
async function getMyAttendance(req, res, next) {
  try {
    const { month } = req.query
    const range = month ? getMonthDateRange(month) : null

    const where = { employeeId: req.user.id }
    if (range) where.date = { gte: range.startDate, lte: range.endDate }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: "desc" },
    })

    // Summary
    const summary = { present: 0, absent: 0, halfDays: 0, onLeave: 0, wfh: 0, lop: 0, personalHoliday: 0 }
    records.forEach((r) => {
      switch (r.status) {
        case "PRESENT": summary.present++; break
        case "ABSENT": summary.absent++; summary.lop++; break
        case "HALF_DAY": summary.halfDays++; break
        case "ON_LEAVE": summary.onLeave++; break
        case "WFH": summary.wfh++; summary.present++; break
        case "PERSONAL_HOLIDAY": summary.personalHoliday++; break
      }
    })

    return success(res, { records, summary })
  } catch (err) {
    next(err)
  }
}

// GET /api/attendance
async function getAllAttendance(req, res, next) {
  try {
    const { date, month, search, status, page = 1, limit = 50 } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const where = {}
    if (date) where.date = new Date(date)
    if (month) {
      const range = getMonthDateRange(month)
      where.date = { gte: range.startDate, lte: range.endDate }
    }
    if (status) where.status = status

    if (search) {
      where.employee = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { employeeId: { contains: search, mode: "insensitive" } },
        ],
      }
    }

    const [records, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ date: "desc" }, { employee: { name: "asc" } }],
        include: { employee: { select: { id: true, name: true, employeeId: true, department: true } } },
      }),
      prisma.attendance.count({ where }),
    ])

    // Daily summary counts
    let summary = null
    if (date || (month && !search)) {
      const counts = await prisma.attendance.groupBy({
        by: ["status"],
        where: { date: where.date },
        _count: { status: true },
      })
      summary = {}
      counts.forEach((c) => { summary[c.status.toLowerCase()] = c._count.status })
    }

    return success(res, {
      records,
      summary,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/attendance/employee/:employeeId
async function getEmployeeAttendance(req, res, next) {
  try {
    const { employeeId } = req.params
    const { month } = req.query

    const where = { employeeId }
    if (month) {
      const range = getMonthDateRange(month)
      where.date = { gte: range.startDate, lte: range.endDate }
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: "desc" },
    })

    return success(res, records)
  } catch (err) {
    next(err)
  }
}

// POST /api/attendance/override
async function manualOverride(req, res, next) {
  try {
    const { employeeId, date, status, checkIn, checkOut, reason } = req.body

    const dateObj = new Date(date)
    const attendance = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date: dateObj } },
      update: {
        status,
        checkIn: checkIn ? new Date(checkIn) : null,
        checkOut: checkOut ? new Date(checkOut) : null,
        hoursWorked: checkIn && checkOut
          ? Math.round(((new Date(checkOut) - new Date(checkIn)) / 3600000) * 100) / 100
          : null,
        isManualOverride: true,
        overrideReason: reason,
        overrideBy: req.user.id,
      },
      create: {
        employeeId,
        date: dateObj,
        status,
        checkIn: checkIn ? new Date(checkIn) : null,
        checkOut: checkOut ? new Date(checkOut) : null,
        isManualOverride: true,
        overrideReason: reason,
        overrideBy: req.user.id,
      },
    })

    return success(res, attendance, "Attendance updated")
  } catch (err) {
    next(err)
  }
}

// GET /api/attendance/monthly-report
async function getMonthlyReport(req, res, next) {
  try {
    const { month, employeeId } = req.query
    const range = getMonthDateRange(month || dayjs().format("YYYY-MM"))

    const where = { date: { gte: range.startDate, lte: range.endDate } }
    if (employeeId) where.employeeId = employeeId

    const records = await prisma.attendance.findMany({
      where,
      include: { employee: { select: { id: true, name: true, employeeId: true } } },
      orderBy: [{ date: "asc" }],
    })

    return success(res, records)
  } catch (err) {
    next(err)
  }
}

// POST /api/attendance/wfh-request
async function requestWFH(req, res, next) {
  try {
    const { date, reason } = req.body
    const dateObj = new Date(date)

    const existing = await prisma.wFHRequest.findFirst({
      where: { employeeId: req.user.id, date: dateObj },
    })

    if (existing) return error(res, "WFH request already submitted for this date", 400)

    const request = await prisma.wFHRequest.create({
      data: { employeeId: req.user.id, date: dateObj, reason },
    })

    return success(res, request, "WFH request submitted")
  } catch (err) {
    next(err)
  }
}

// PATCH /api/attendance/wfh-request/:id
async function approveWFH(req, res, next) {
  try {
    const { id } = req.params
    const { action, comment } = req.body

    const status = action === "approve" ? "APPROVED" : "REJECTED"
    const request = await prisma.wFHRequest.update({
      where: { id },
      data: { status, adminComment: comment },
    })

    return success(res, request, `WFH request ${status.toLowerCase()}`)
  } catch (err) {
    next(err)
  }
}

// GET /api/attendance/out-of-range-logs
async function getOutOfRangeLogs(req, res, next) {
  try {
    // Records where checkIn geo coords were logged but not within radius
    const logs = await prisma.attendance.findMany({
      where: {
        checkInLat: { not: null },
        checkInLng: { not: null },
        isManualOverride: false,
      },
      take: 50,
      orderBy: { createdAt: "desc" },
      include: { employee: { select: { name: true, employeeId: true } } },
    })
    return success(res, logs)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  checkIn, checkOut, getTodayStatus, getMyAttendance, getAllAttendance,
  getEmployeeAttendance, manualOverride, getMonthlyReport,
  requestWFH, approveWFH, getOutOfRangeLogs,
}
