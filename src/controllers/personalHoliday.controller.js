const prisma = require("../config/database")
const { sendPushNotification } = require("../config/firebase")
const { success, error, notFound } = require("../utils/response")
const { dayjs } = require("../utils/dateHelper")

// POST /api/personal-holidays
async function apply(req, res, next) {
  try {
    const { reason, fromDate, toDate, description } = req.body
    const employeeId = req.user.id
    const year = new Date(fromDate).getFullYear()

    const start = dayjs(fromDate)
    const end = toDate ? dayjs(toDate) : start
    const days = end.diff(start, "day") + 1

    // Check balance
    let balance = await prisma.personalHolidayBalance.findUnique({ where: { employeeId } })
    if (!balance) {
      balance = await prisma.personalHolidayBalance.create({
        data: { employeeId, year, total: 3, used: 0, remaining: 3 },
      })
    }

    if (balance.remaining < days) {
      return error(res, `Insufficient personal holiday balance. Available: ${balance.remaining} days`, 400)
    }

    const holiday = await prisma.personalHoliday.create({
      data: {
        employeeId,
        reason,
        description,
        fromDate: start.toDate(),
        toDate: end.toDate(),
        days,
      },
      include: { employee: { select: { name: true } } },
    })

    // Notify admin
    const admins = await prisma.employee.findMany({ where: { role: "ADMIN", fcmToken: { not: null } } })
    if (admins[0]?.fcmToken) {
      await sendPushNotification(admins[0].fcmToken, {
        title: "Personal Holiday Request",
        body: `${req.user.name} requested a personal holiday for ${reason}`,
      })
    }

    return success(res, { holiday, currentBalance: balance.remaining }, "Personal holiday request submitted", 201)
  } catch (err) {
    next(err)
  }
}

// GET /api/personal-holidays/my
async function getMyHolidays(req, res, next) {
  try {
    const { limit = 20, status } = req.query
    const where = { employeeId: req.user.id }
    if (status) where.status = status

    const holidays = await prisma.personalHoliday.findMany({
      where,
      take: parseInt(limit),
      orderBy: { createdAt: "desc" },
    })

    return success(res, { holidays })
  } catch (err) {
    next(err)
  }
}

// GET /api/personal-holidays
async function getAllHolidays(req, res, next) {
  try {
    const { page = 1, limit = 15, status } = req.query
    const where = {}
    if (status) where.status = status

    const [requests, total] = await Promise.all([
      prisma.personalHoliday.findMany({
        where,
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
        include: { employee: { select: { id: true, name: true, employeeId: true } } },
      }),
      prisma.personalHoliday.count({ where }),
    ])

    // Attach current balance
    const enriched = await Promise.all(
      requests.map(async (r) => {
        const bal = await prisma.personalHolidayBalance.findUnique({
          where: { employeeId: r.employeeId },
        })
        return { ...r, currentBalance: bal?.remaining || 0, balanceAfter: (bal?.remaining || 0) - r.days }
      })
    )

    return success(res, { requests: enriched, total, totalPages: Math.ceil(total / parseInt(limit)) })
  } catch (err) {
    next(err)
  }
}

// GET /api/personal-holidays/balance
async function getBalance(req, res, next) {
  try {
    let balance = await prisma.personalHolidayBalance.findUnique({
      where: { employeeId: req.user.id },
    })
    if (!balance) {
      balance = await prisma.personalHolidayBalance.create({
        data: { employeeId: req.user.id, year: new Date().getFullYear(), total: 3, used: 0, remaining: 3 },
      })
    }
    return success(res, balance)
  } catch (err) {
    next(err)
  }
}

// GET /api/personal-holidays/balance/:employeeId
async function getEmployeeBalance(req, res, next) {
  try {
    const balance = await prisma.personalHolidayBalance.findUnique({
      where: { employeeId: req.params.employeeId },
    })
    return success(res, balance || { total: 3, used: 0, remaining: 3 })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/personal-holidays/:id/approve
async function approve(req, res, next) {
  try {
    const { id } = req.params
    const { comment } = req.body

    const holiday = await prisma.personalHoliday.findUnique({
      where: { id },
      include: { employee: true },
    })
    if (!holiday) return notFound(res, "Personal holiday request")
    if (holiday.status !== "PENDING") return error(res, "Request is not pending", 400)

    await prisma.$transaction(async (tx) => {
      await tx.personalHoliday.update({
        where: { id },
        data: { status: "APPROVED", adminComment: comment, approvedBy: req.user.id, approvedAt: new Date() },
      })

      // Deduct from balance
      await tx.personalHolidayBalance.update({
        where: { employeeId: holiday.employeeId },
        data: {
          used: { increment: holiday.days },
          remaining: { decrement: holiday.days },
        },
      })

      // Mark attendance as PERSONAL_HOLIDAY — no salary deduction
      const start = dayjs(holiday.fromDate)
      const end = dayjs(holiday.toDate)
      let cur = start
      while (cur.isSameOrBefore(end, "day")) {
        if (cur.day() !== 0) {
          await tx.attendance.upsert({
            where: { employeeId_date: { employeeId: holiday.employeeId, date: cur.startOf("day").toDate() } },
            update: { status: "PERSONAL_HOLIDAY" },
            create: { employeeId: holiday.employeeId, date: cur.startOf("day").toDate(), status: "PERSONAL_HOLIDAY" },
          })
        }
        cur = cur.add(1, "day")
      }
    })

    if (holiday.employee.fcmToken) {
      await sendPushNotification(holiday.employee.fcmToken, {
        title: "Personal Holiday Approved 🎉",
        body: `Your ${holiday.reason} holiday has been approved. No salary deduction.`,
      })
    }

    return success(res, {}, "Personal holiday approved — no salary deduction will occur")
  } catch (err) {
    next(err)
  }
}

// PATCH /api/personal-holidays/:id/reject
async function reject(req, res, next) {
  try {
    const { id } = req.params
    const { comment } = req.body

    const holiday = await prisma.personalHoliday.update({
      where: { id },
      data: { status: "REJECTED", adminComment: comment, approvedBy: req.user.id },
      include: { employee: { select: { fcmToken: true } } },
    })

    if (holiday.employee.fcmToken) {
      await sendPushNotification(holiday.employee.fcmToken, {
        title: "Personal Holiday Update",
        body: "Your personal holiday request was not approved",
      })
    }

    return success(res, {}, "Personal holiday rejected")
  } catch (err) {
    next(err)
  }
}

// POST /api/personal-holidays/quota/:employeeId
async function setQuota(req, res, next) {
  try {
    const { employeeId } = req.params
    const { quota } = req.body
    const year = new Date().getFullYear()

    const balance = await prisma.personalHolidayBalance.upsert({
      where: { employeeId },
      update: { total: quota, remaining: quota },
      create: { employeeId, year, total: quota, used: 0, remaining: quota },
    })

    return success(res, balance, "Quota updated")
  } catch (err) {
    next(err)
  }
}

// POST /api/personal-holidays/quota/bulk
async function setBulkQuota(req, res, next) {
  try {
    const { quota, applyTo, departmentId } = req.body
    const year = new Date().getFullYear()

    const where = { status: "ACTIVE" }
    if (applyTo === "department" && departmentId) where.departmentId = departmentId

    const employees = await prisma.employee.findMany({ where, select: { id: true } })

    await Promise.all(
      employees.map((emp) =>
        prisma.personalHolidayBalance.upsert({
          where: { employeeId: emp.id },
          update: { total: quota, remaining: quota },
          create: { employeeId: emp.id, year, total: quota, used: 0, remaining: quota },
        })
      )
    )

    return success(res, { updated: employees.length }, `Quota set to ${quota} days for ${employees.length} employees`)
  } catch (err) {
    next(err)
  }
}

// POST /api/personal-holidays/year-end
async function yearEnd(req, res, next) {
  try {
    const { action = "lapse" } = req.body
    const nextYear = new Date().getFullYear() + 1

    const balances = await prisma.personalHolidayBalance.findMany()

    await Promise.all(
      balances.map((b) =>
        prisma.personalHolidayBalance.update({
          where: { id: b.id },
          data: { year: nextYear, used: 0, remaining: b.total },
        })
      )
    )

    return success(res, { processed: balances.length }, "Year-end reset complete")
  } catch (err) {
    next(err)
  }
}

module.exports = {
  apply, getMyHolidays, getAllHolidays, getBalance, getEmployeeBalance,
  approve, reject, setQuota, setBulkQuota, yearEnd,
}
