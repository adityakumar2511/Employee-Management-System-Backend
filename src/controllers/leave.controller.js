const prisma = require("../config/database")
const { sendEmail, templates } = require("../config/email")
const { sendPushNotification } = require("../config/firebase")
const { success, error, notFound } = require("../utils/response")
const { calculateLeaveDays, dayjs } = require("../utils/dateHelper")

// POST /api/leaves
async function apply(req, res, next) {
  try {
    const { leaveTypeId, fromDate, toDate, reason, isHalfDay } = req.body
    const employeeId = req.user.id

    const days = await calculateLeaveDays(fromDate, toDate, isHalfDay, prisma)

    // Check balance
    const year = new Date(fromDate).getFullYear()
    const balance = await prisma.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    })

    if (!balance || balance.remaining < days) {
      return error(res, `Insufficient ${days > balance?.remaining ? "leave" : ""} balance. Available: ${balance?.remaining || 0} days`, 400)
    }

    // Check for overlapping leaves
    const overlap = await prisma.leave.findFirst({
      where: {
        employeeId,
        status: { in: ["PENDING", "APPROVED"] },
        OR: [
          { fromDate: { lte: new Date(toDate) }, toDate: { gte: new Date(fromDate) } },
        ],
      },
    })

    if (overlap) {
      return error(res, "You already have a leave application for these dates", 400)
    }

    const leave = await prisma.leave.create({
      data: {
        employeeId,
        leaveTypeId,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        days,
        isHalfDay: !!isHalfDay,
        reason,
      },
      include: { leaveType: true, employee: { select: { name: true, email: true } } },
    })

    // Notify admin via FCM
    const admins = await prisma.employee.findMany({ where: { role: "ADMIN", fcmToken: { not: null } } })
    const tokens = admins.map((a) => a.fcmToken).filter(Boolean)
    await sendPushNotification(tokens[0], {
      title: "New Leave Request",
      body: `${req.user.name} applied for ${days} day(s) leave`,
    })

    return success(res, leave, "Leave application submitted", 201)
  } catch (err) {
    next(err)
  }
}

// GET /api/leaves/my
async function getMyLeaves(req, res, next) {
  try {
    const { page = 1, limit = 20, status } = req.query
    const where = { employeeId: req.user.id }
    if (status) where.status = status

    const [leaves, total] = await Promise.all([
      prisma.leave.findMany({
        where,
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
        include: { leaveType: true },
      }),
      prisma.leave.count({ where }),
    ])

    return success(res, { leaves, total, totalPages: Math.ceil(total / parseInt(limit)) })
  } catch (err) {
    next(err)
  }
}

// GET /api/leaves
async function getAllLeaves(req, res, next) {
  try {
    const { page = 1, limit = 20, status, search } = req.query
    const where = {}
    if (status) where.status = status
    if (search) {
      where.employee = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { employeeId: { contains: search, mode: "insensitive" } },
        ],
      }
    }

    const [leaves, total] = await Promise.all([
      prisma.leave.findMany({
        where,
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
        include: {
          leaveType: true,
          employee: { select: { id: true, name: true, employeeId: true, department: true } },
        },
      }),
      prisma.leave.count({ where }),
    ])

    return success(res, { leaves, total, totalPages: Math.ceil(total / parseInt(limit)) })
  } catch (err) {
    next(err)
  }
}

// GET /api/leaves/balance
async function getBalance(req, res, next) {
  try {
    const year = new Date().getFullYear()
    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId: req.user.id, year },
      include: { leaveType: true },
    })

    const formatted = balances.map((b) => ({
      typeId: b.leaveTypeId,
      type: b.leaveType.name,
      code: b.leaveType.code,
      total: b.total,
      used: b.used,
      remaining: b.remaining,
      carriedOver: b.carriedOver,
    }))

    return success(res, formatted)
  } catch (err) {
    next(err)
  }
}

// GET /api/leaves/balance/:employeeId
async function getEmployeeBalance(req, res, next) {
  try {
    const { employeeId } = req.params
    const year = new Date().getFullYear()
    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId, year },
      include: { leaveType: true },
    })
    return success(res, balances)
  } catch (err) {
    next(err)
  }
}

// PATCH /api/leaves/:id/approve
async function approveLeave(req, res, next) {
  try {
    const { id } = req.params
    const { comment } = req.body

    const leave = await prisma.leave.findUnique({
      where: { id },
      include: { employee: true, leaveType: true },
    })
    if (!leave) return notFound(res, "Leave")
    if (leave.status !== "PENDING") return error(res, "Leave is not in pending state", 400)

    await prisma.$transaction(async (tx) => {
      await tx.leave.update({
        where: { id },
        data: { status: "APPROVED", adminComment: comment, approvedBy: req.user.id, approvedAt: new Date() },
      })

      // Update balance
      const year = leave.fromDate.getFullYear()
      await tx.leaveBalance.update({
        where: { employeeId_leaveTypeId_year: { employeeId: leave.employeeId, leaveTypeId: leave.leaveTypeId, year } },
        data: {
          used: { increment: leave.days },
          remaining: { decrement: leave.days },
        },
      })

      // Mark attendance as ON_LEAVE for each day
      const start = dayjs(leave.fromDate)
      const end = dayjs(leave.toDate)
      let cur = start
      while (cur.isSameOrBefore(end, "day")) {
        if (cur.day() !== 0) {
          await tx.attendance.upsert({
            where: { employeeId_date: { employeeId: leave.employeeId, date: cur.startOf("day").toDate() } },
            update: { status: leave.isHalfDay ? "HALF_DAY" : "ON_LEAVE" },
            create: { employeeId: leave.employeeId, date: cur.startOf("day").toDate(), status: leave.isHalfDay ? "HALF_DAY" : "ON_LEAVE" },
          })
        }
        cur = cur.add(1, "day")
      }
    })

    // Send notification to employee
    if (leave.employee.fcmToken) {
      await sendPushNotification(leave.employee.fcmToken, {
        title: "Leave Approved ✅",
        body: `Your ${leave.leaveType.name} has been approved`,
      })
    }

    const emailContent = templates.leaveStatusUpdate(
      leave.employee.name, leave.leaveType.name,
      dayjs(leave.fromDate).format("DD MMM YYYY"),
      dayjs(leave.toDate).format("DD MMM YYYY"),
      "APPROVED", comment
    )
    await sendEmail({ to: leave.employee.email, ...emailContent })

    return success(res, {}, "Leave approved")
  } catch (err) {
    next(err)
  }
}

// PATCH /api/leaves/:id/reject
async function rejectLeave(req, res, next) {
  try {
    const { id } = req.params
    const { comment } = req.body

    if (!comment) return error(res, "Rejection comment is required", 400)

    const leave = await prisma.leave.findUnique({
      where: { id },
      include: { employee: true, leaveType: true },
    })
    if (!leave) return notFound(res, "Leave")
    if (leave.status !== "PENDING") return error(res, "Leave is not pending", 400)

    await prisma.leave.update({
      where: { id },
      data: { status: "REJECTED", adminComment: comment, approvedBy: req.user.id },
    })

    if (leave.employee.fcmToken) {
      await sendPushNotification(leave.employee.fcmToken, {
        title: "Leave Request Update",
        body: `Your ${leave.leaveType.name} request was not approved`,
      })
    }

    const emailContent = templates.leaveStatusUpdate(
      leave.employee.name, leave.leaveType.name,
      dayjs(leave.fromDate).format("DD MMM YYYY"),
      dayjs(leave.toDate).format("DD MMM YYYY"),
      "REJECTED", comment
    )
    await sendEmail({ to: leave.employee.email, ...emailContent })

    return success(res, {}, "Leave rejected")
  } catch (err) {
    next(err)
  }
}

// DELETE /api/leaves/:id
async function cancelLeave(req, res, next) {
  try {
    const { id } = req.params
    const leave = await prisma.leave.findUnique({ where: { id } })
    if (!leave) return notFound(res, "Leave")

    if (leave.employeeId !== req.user.id) return error(res, "Not authorized", 403)
    if (leave.status === "APPROVED") return error(res, "Cannot cancel an approved leave", 400)

    await prisma.leave.update({ where: { id }, data: { status: "CANCELLED" } })
    return success(res, {}, "Leave cancelled")
  } catch (err) {
    next(err)
  }
}

// GET /api/leaves/types
async function getLeaveTypes(req, res, next) {
  try {
    const types = await prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
    return success(res, types)
  } catch (err) {
    next(err)
  }
}

// POST /api/leaves/types
async function createLeaveType(req, res, next) {
  try {
    const type = await prisma.leaveType.create({ data: req.body })
    return success(res, type, "Leave type created", 201)
  } catch (err) {
    next(err)
  }
}

// PUT /api/leaves/types/:id
async function updateLeaveType(req, res, next) {
  try {
    const type = await prisma.leaveType.update({ where: { id: req.params.id }, data: req.body })
    return success(res, type, "Leave type updated")
  } catch (err) {
    next(err)
  }
}

// POST /api/leaves/year-end
async function yearEndCarryForward(req, res, next) {
  try {
    const { action = "lapse" } = req.body
    const currentYear = new Date().getFullYear()
    const nextYear = currentYear + 1

    const carryForwardTypes = await prisma.leaveType.findMany({
      where: { isCarryForward: true, isActive: true },
    })

    const balances = await prisma.leaveBalance.findMany({
      where: { year: currentYear },
    })

    let processed = 0
    for (const balance of balances) {
      const leaveType = carryForwardTypes.find((t) => t.id === balance.leaveTypeId)

      // Create next year balance
      const carryOver = action === "carry" && leaveType
        ? Math.min(balance.remaining, leaveType.maxCarryForward || 0)
        : 0

      await prisma.leaveBalance.upsert({
        where: { employeeId_leaveTypeId_year: { employeeId: balance.employeeId, leaveTypeId: balance.leaveTypeId, year: nextYear } },
        update: { total: (await prisma.leaveType.findUnique({ where: { id: balance.leaveTypeId } }))?.defaultDays || balance.total, carriedOver: carryOver, remaining: { increment: carryOver } },
        create: {
          employeeId: balance.employeeId,
          leaveTypeId: balance.leaveTypeId,
          year: nextYear,
          total: (await prisma.leaveType.findUnique({ where: { id: balance.leaveTypeId } }))?.defaultDays || balance.total,
          used: 0,
          remaining: ((await prisma.leaveType.findUnique({ where: { id: balance.leaveTypeId } }))?.defaultDays || balance.total) + carryOver,
          carriedOver: carryOver,
        },
      })
      processed++
    }

    return success(res, { processed }, `Year-end processed for ${processed} balances`)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  apply, getMyLeaves, getAllLeaves, getBalance, getEmployeeBalance,
  approveLeave, rejectLeave, cancelLeave, getLeaveTypes,
  createLeaveType, updateLeaveType, yearEndCarryForward,
}
