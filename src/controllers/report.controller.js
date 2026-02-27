const prisma = require("../config/database")
const { success } = require("../utils/response")
const { getMonthDateRange, dayjs } = require("../utils/dateHelper")
const { generateAttendanceReport, generatePayrollReport, generateLeaveReport } = require("../utils/excelHelper")

// GET /api/reports/dashboard-stats
async function getDashboardStats(req, res, next) {
  try {
    const isAdmin = req.user.role === "ADMIN"
    const today = dayjs().startOf("day").toDate()
    const todayEnd = dayjs().endOf("day").toDate()
    const currentMonth = dayjs().format("YYYY-MM")
    const range = getMonthDateRange(currentMonth)
    const year = new Date().getFullYear()

    if (isAdmin) {
      const [
        totalEmployees, pendingLeaves, pendingTasks,
        todayAttendance, monthlyPayroll, recentLeaves,
      ] = await Promise.all([
        prisma.employee.count({ where: { status: "ACTIVE" } }),
        prisma.leave.count({ where: { status: "PENDING" } }),
        prisma.task.count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] } } }),
        prisma.attendance.groupBy({
          by: ["status"],
          where: { date: { gte: today, lte: todayEnd } },
          _count: { status: true },
        }),
        prisma.payroll.aggregate({
          where: { month: range.startDate, status: { in: ["GENERATED", "PAID"] } },
          _sum: { netSalary: true },
        }),
        prisma.leave.findMany({
          where: { status: "PENDING" },
          take: 5,
          orderBy: { createdAt: "desc" },
          include: { employee: { select: { name: true, employeeId: true } }, leaveType: true },
        }),
      ])

      const attendanceMap = {}
      todayAttendance.forEach((a) => { attendanceMap[a.status.toLowerCase()] = a._count.status })

      return success(res, {
        totalEmployees,
        pendingLeaves,
        pendingTasks,
        monthlyPayroll: monthlyPayroll._sum.netSalary || 0,
        today: {
          present: (attendanceMap.present || 0) + (attendanceMap.wfh || 0),
          absent: attendanceMap.absent || 0,
          halfDay: attendanceMap.half_day || 0,
          wfh: attendanceMap.wfh || 0,
          onLeave: attendanceMap.on_leave || 0,
        },
        recentLeaves,
      })
    } else {
      // Employee dashboard stats
      const [leaveBalances, phBalance, pendingTaskCount, overdueTaskCount, latestSalary] = await Promise.all([
        prisma.leaveBalance.findMany({
          where: { employeeId: req.user.id, year },
          include: { leaveType: true },
        }),
        prisma.personalHolidayBalance.findUnique({ where: { employeeId: req.user.id } }),
        prisma.task.count({ where: { assignedToId: req.user.id, status: { in: ["PENDING", "IN_PROGRESS"] } } }),
        prisma.task.count({ where: { assignedToId: req.user.id, status: "OVERDUE" } }),
        prisma.payroll.findFirst({
          where: { employeeId: req.user.id, status: "PAID" },
          orderBy: { month: "desc" },
        }),
      ])

      // LOP this month
      const lopRecords = await prisma.attendance.count({
        where: {
          employeeId: req.user.id,
          status: "ABSENT",
          date: { gte: range.startDate, lte: range.endDate },
        },
      })

      const balanceMap = {}
      leaveBalances.forEach((b) => {
        balanceMap[b.leaveType.code] = b.remaining
      })

      return success(res, {
        leaveBalance: {
          casual: balanceMap.CL || 0,
          sick: balanceMap.SL || 0,
          earned: balanceMap.EL || 0,
        },
        personalHolidayBalance: phBalance?.remaining || 0,
        lopThisMonth: lopRecords,
        pendingTasks: pendingTaskCount,
        overdueTasks: overdueTaskCount,
        latestSalary: latestSalary || null,
      })
    }
  } catch (err) {
    next(err)
  }
}

// GET /api/reports/attendance
async function getAttendanceReport(req, res, next) {
  try {
    const { month } = req.query
    const range = getMonthDateRange(month || dayjs().format("YYYY-MM"))

    const employees = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, employeeId: true, department: { select: { name: true } } },
    })

    const records = await Promise.all(
      employees.map(async (emp) => {
        const attendance = await prisma.attendance.findMany({
          where: { employeeId: emp.id, date: { gte: range.startDate, lte: range.endDate } },
        })

        const present = attendance.filter((a) => ["PRESENT", "WFH"].includes(a.status)).length
        const absent = attendance.filter((a) => a.status === "ABSENT").length
        const halfDays = attendance.filter((a) => a.status === "HALF_DAY").length
        const onLeave = attendance.filter((a) => a.status === "ON_LEAVE").length
        const wfh = attendance.filter((a) => a.status === "WFH").length
        const lop = absent + Math.round(halfDays * 0.5)
        const hoursWorked = attendance.reduce((s, a) => s + (a.hoursWorked || 0), 0)

        return {
          employeeId: emp.employeeId, name: emp.name,
          department: emp.department?.name,
          present, absent, halfDays, onLeave, wfh, lop,
          hoursWorked: Math.round(hoursWorked * 10) / 10,
        }
      })
    )

    const summary = {
      totalEmployees: employees.length,
      avgPresent: Math.round(records.reduce((s, r) => s + r.present, 0) / Math.max(employees.length, 1)),
      totalLOP: records.reduce((s, r) => s + r.lop, 0),
    }

    return success(res, { records, summary })
  } catch (err) {
    next(err)
  }
}

// GET /api/reports/leave
async function getLeaveReport(req, res, next) {
  try {
    const { month } = req.query
    const year = month ? parseInt(month.split("-")[0]) : new Date().getFullYear()

    const balances = await prisma.leaveBalance.findMany({
      where: { year },
      include: {
        employee: { select: { name: true, employeeId: true } },
        leaveType: true,
      },
    })

    // Count LOP leaves
    const lopLeaves = await prisma.leave.groupBy({
      by: ["employeeId"],
      where: { status: "APPROVED", leaveType: { isPaid: false } },
      _sum: { days: true },
    })
    const lopMap = {}
    lopLeaves.forEach((l) => { lopMap[l.employeeId] = l._sum.days || 0 })

    const records = balances.map((b) => ({
      employeeId: b.employee.employeeId,
      name: b.employee.name,
      leaveType: b.leaveType.name,
      total: b.total,
      used: b.used,
      balance: b.remaining,
      lopLeaves: lopMap[b.employeeId] || 0,
    }))

    const summary = {
      totalEmployees: new Set(records.map((r) => r.employeeId)).size,
      totalLeavesTaken: records.reduce((s, r) => s + r.used, 0),
    }

    return success(res, { records, summary })
  } catch (err) {
    next(err)
  }
}

// GET /api/reports/payroll
async function getPayrollReport(req, res, next) {
  try {
    const { month } = req.query
    const range = getMonthDateRange(month || dayjs().format("YYYY-MM"))

    const payrolls = await prisma.payroll.findMany({
      where: { month: range.startDate },
      include: { employee: { include: { department: true } } },
      orderBy: { employee: { name: "asc" } },
    })

    const records = payrolls.map((p) => ({
      employeeId: p.employee.employeeId,
      name: p.employee.name,
      department: p.employee.department?.name,
      basic: p.basicSalary,
      gross: p.grossSalary,
      deductions: p.totalDeductions,
      lopDays: p.lopDays,
      lopAmount: p.lopAmount,
      net: p.netSalary,
      status: p.status,
    }))

    const summary = {
      totalGross: records.reduce((s, r) => s + r.gross, 0),
      totalNet: records.reduce((s, r) => s + r.net, 0),
      totalDeductions: records.reduce((s, r) => s + r.deductions, 0),
      totalLOP: records.reduce((s, r) => s + r.lopAmount, 0),
      paid: payrolls.filter((p) => p.status === "PAID").length,
      total: payrolls.length,
    }

    return success(res, { records, summary })
  } catch (err) {
    next(err)
  }
}

// GET /api/reports/lop
async function getLOPReport(req, res, next) {
  try {
    const { month } = req.query
    const range = getMonthDateRange(month || dayjs().format("YYYY-MM"))

    const settings = await prisma.companySettings.findFirst()
    const workingDays = settings?.workingDaysPerMonth || 26

    const employees = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, employeeId: true },
    })

    const records = await Promise.all(
      employees.map(async (emp) => {
        const payroll = await prisma.payroll.findFirst({
          where: { employeeId: emp.id, month: range.startDate },
        })

        return {
          employeeId: emp.employeeId,
          name: emp.name,
          workingDays,
          presentDays: payroll?.presentDays || 0,
          lopDays: payroll?.lopDays || 0,
          lopAmount: payroll?.lopAmount || 0,
        }
      })
    )

    const filtered = records.filter((r) => r.lopDays > 0)
    const summary = { totalLOPDays: filtered.reduce((s, r) => s + r.lopDays, 0), totalLOPAmount: filtered.reduce((s, r) => s + r.lopAmount, 0) }

    return success(res, { records: filtered, summary })
  } catch (err) {
    next(err)
  }
}

// GET /api/reports/personal-holidays
async function getPersonalHolidayReport(req, res, next) {
  try {
    const employees = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, employeeId: true },
    })

    const records = await Promise.all(
      employees.map(async (emp) => {
        const bal = await prisma.personalHolidayBalance.findUnique({ where: { employeeId: emp.id } })
        const approved = await prisma.personalHoliday.findMany({
          where: { employeeId: emp.id, status: "APPROVED" },
          select: { reason: true },
        })
        return {
          employeeId: emp.employeeId,
          name: emp.name,
          quota: bal?.total || 3,
          used: bal?.used || 0,
          balance: bal?.remaining || 3,
          festivals: approved.map((h) => h.reason),
        }
      })
    )

    return success(res, { records })
  } catch (err) {
    next(err)
  }
}

// GET /api/reports/tasks
async function getTaskReport(req, res, next) {
  try {
    const { fromDate, toDate } = req.query
    const where = {}
    if (fromDate) where.createdAt = { gte: new Date(fromDate) }
    if (toDate) where.createdAt = { ...where.createdAt, lte: new Date(toDate) }

    const employees = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, employeeId: true },
    })

    const records = await Promise.all(
      employees.map(async (emp) => {
        const tasks = await prisma.task.findMany({
          where: { assignedToId: emp.id, ...where },
          select: { status: true, completionPercent: true },
        })
        const total = tasks.length
        const completed = tasks.filter((t) => t.status === "COMPLETED").length
        const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length
        const overdue = tasks.filter((t) => t.status === "OVERDUE").length
        const avgCompletion = total ? Math.round(tasks.reduce((s, t) => s + t.completionPercent, 0) / total) : 0
        return { employeeId: emp.employeeId, name: emp.name, total, completed, inProgress, overdue, avgCompletion }
      })
    )

    return success(res, { records })
  } catch (err) {
    next(err)
  }
}

// GET /api/reports/:type/export
async function exportReport(req, res, next) {
  try {
    const { type } = req.params
    const { month, format = "excel" } = req.query

    let buffer, filename

    if (type === "attendance") {
      const range = getMonthDateRange(month || dayjs().format("YYYY-MM"))
      const employees = await prisma.employee.findMany({ where: { status: "ACTIVE" }, include: { department: true } })
      const records = await Promise.all(employees.map(async (emp) => {
        const att = await prisma.attendance.findMany({ where: { employeeId: emp.id, date: { gte: range.startDate, lte: range.endDate } } })
        return {
          employeeId: emp.employeeId, name: emp.name, department: emp.department?.name,
          present: att.filter((a) => ["PRESENT", "WFH"].includes(a.status)).length,
          absent: att.filter((a) => a.status === "ABSENT").length,
          halfDays: att.filter((a) => a.status === "HALF_DAY").length,
          onLeave: att.filter((a) => a.status === "ON_LEAVE").length,
          wfh: att.filter((a) => a.status === "WFH").length,
          lop: att.filter((a) => a.status === "ABSENT").length,
        }
      }))
      buffer = generateAttendanceReport(records, month)
      filename = `attendance-report-${month}.xlsx`
    } else if (type === "payroll") {
      const range = getMonthDateRange(month || dayjs().format("YYYY-MM"))
      const payrolls = await prisma.payroll.findMany({ where: { month: range.startDate }, include: { employee: { include: { department: true } } } })
      const records = payrolls.map((p) => ({
        employeeId: p.employee.employeeId, name: p.employee.name, department: p.employee.department?.name,
        basic: p.basicSalary, gross: p.grossSalary, deductions: p.totalDeductions,
        lopDays: p.lopDays, lopAmount: p.lopAmount, net: p.netSalary, status: p.status,
      }))
      buffer = generatePayrollReport(records, month)
      filename = `payroll-report-${month}.xlsx`
    } else {
      buffer = Buffer.from("Report type not supported for export")
      filename = `report.txt`
    }

    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=${filename}`,
    })
    res.send(buffer)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  getDashboardStats, getAttendanceReport, getLeaveReport,
  getPayrollReport, getLOPReport, getPersonalHolidayReport,
  getTaskReport, exportReport,
}
