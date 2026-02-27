const dayjs = require("dayjs")
const isBetween = require("dayjs/plugin/isBetween")
const isSameOrBefore = require("dayjs/plugin/isSameOrBefore")
const isSameOrAfter = require("dayjs/plugin/isSameOrAfter")

dayjs.extend(isBetween)
dayjs.extend(isSameOrBefore)
dayjs.extend(isSameOrAfter)

// Get all working days in a month (Mon–Sat by default)
function getWorkingDaysInMonth(year, month, workingDaysPerMonth = null) {
  if (workingDaysPerMonth) return workingDaysPerMonth

  const start = dayjs(`${year}-${String(month).padStart(2, "0")}-01`)
  const daysInMonth = start.daysInMonth()
  let count = 0

  for (let d = 1; d <= daysInMonth; d++) {
    const day = start.date(d).day()
    if (day !== 0) count++ // exclude Sundays
  }
  return count
}

// Check if a date is a public holiday
async function isPublicHoliday(date, prisma) {
  const holiday = await prisma.holiday.findFirst({
    where: { date: new Date(date) },
  })
  return !!holiday
}

// Calculate leave days between two dates excluding weekends & public holidays
async function calculateLeaveDays(fromDate, toDate, isHalfDay = false, prisma = null) {
  if (isHalfDay) return 0.5

  const start = dayjs(fromDate)
  const end = dayjs(toDate)
  let days = 0
  let current = start

  while (current.isSameOrBefore(end, "day")) {
    const dow = current.day()
    if (dow !== 0) { // not Sunday
      if (prisma) {
        const isHol = await isPublicHoliday(current.format("YYYY-MM-DD"), prisma)
        if (!isHol) days++
      } else {
        days++
      }
    }
    current = current.add(1, "day")
  }

  return days
}

// Calculate LOP deduction
function calculateLOPAmount(basicSalary, workingDays, lopDays) {
  if (!lopDays || !workingDays) return 0
  const perDaySalary = basicSalary / workingDays
  return Math.round(perDaySalary * lopDays * 100) / 100
}

// Calculate half-day deduction
function calculateHalfDayAmount(basicSalary, workingDays, halfDays) {
  if (!halfDays || !workingDays) return 0
  const perDaySalary = basicSalary / workingDays
  return Math.round(perDaySalary * halfDays * 0.5 * 100) / 100
}

// Get present/absent/leave counts for a month
async function getMonthlyAttendanceSummary(employeeId, year, month, prisma) {
  const startDate = new Date(`${year}-${String(month).padStart(2, "0")}-01`)
  const endDate = dayjs(startDate).endOf("month").toDate()

  const records = await prisma.attendance.findMany({
    where: {
      employeeId,
      date: { gte: startDate, lte: endDate },
    },
  })

  const summary = {
    present: 0, absent: 0, halfDays: 0, onLeave: 0,
    personalHoliday: 0, wfh: 0, holiday: 0, lop: 0,
  }

  records.forEach((r) => {
    switch (r.status) {
      case "PRESENT": summary.present++; break
      case "ABSENT": summary.absent++; summary.lop++; break
      case "HALF_DAY": summary.halfDays++; break
      case "ON_LEAVE": summary.onLeave++; break
      case "PERSONAL_HOLIDAY": summary.personalHoliday++; break
      case "WFH": summary.wfh++; summary.present++; break
      case "HOLIDAY": summary.holiday++; break
    }
  })

  return summary
}

// Generate employee ID
async function generateEmployeeId(prisma) {
  const settings = await prisma.companySettings.findFirst()
  const prefix = settings?.employeeIdPrefix || "EMP"
  const counter = settings?.employeeIdCounter || 1

  const paddedCounter = String(counter).padStart(3, "0")
  const employeeId = `${prefix}${paddedCounter}`

  await prisma.companySettings.updateMany({
    data: { employeeIdCounter: counter + 1 },
  })

  return employeeId
}

function getMonthDateRange(monthStr) {
  // monthStr: "YYYY-MM"
  const start = dayjs(`${monthStr}-01`).startOf("month")
  const end = start.endOf("month")
  return {
    gte: start.toDate(),
    lte: end.toDate(),
    startDate: start.toDate(),
    endDate: end.toDate(),
    year: start.year(),
    month: start.month() + 1,
  }
}

module.exports = {
  getWorkingDaysInMonth,
  isPublicHoliday,
  calculateLeaveDays,
  calculateLOPAmount,
  calculateHalfDayAmount,
  getMonthlyAttendanceSummary,
  generateEmployeeId,
  getMonthDateRange,
  dayjs,
}
