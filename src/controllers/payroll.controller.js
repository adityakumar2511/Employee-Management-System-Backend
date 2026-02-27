const prisma = require("../config/database")
const { sendEmail, templates } = require("../config/email")
const { sendPushNotification } = require("../config/firebase")
const { generateSalarySlipPDF } = require("../utils/pdfGenerator")
const { generatePayrollReport, generateBankExport } = require("../utils/excelHelper")
const { success, error, notFound } = require("../utils/response")
const {
  getMonthDateRange, getWorkingDaysInMonth,
  calculateLOPAmount, calculateHalfDayAmount, dayjs,
} = require("../utils/dateHelper")

// ─── SALARY STRUCTURE ────────────────────────────────────────────────────────

// GET /api/payroll/structure/:employeeId
async function getStructure(req, res, next) {
  try {
    let structure = await prisma.salaryStructure.findUnique({
      where: { employeeId: req.params.employeeId },
      include: { components: { orderBy: { order: "asc" } } },
    })

    if (!structure) {
      structure = { employeeId: req.params.employeeId, basicSalary: 0, components: [] }
    }

    return success(res, structure)
  } catch (err) {
    next(err)
  }
}

// POST /api/payroll/structure/:employeeId
async function saveStructure(req, res, next) {
  try {
    const { employeeId } = req.params
    const { basicSalary, components = [] } = req.body

    const structure = await prisma.salaryStructure.upsert({
      where: { employeeId },
      update: { basicSalary: parseFloat(basicSalary) },
      create: { employeeId, basicSalary: parseFloat(basicSalary) },
    })

    // Replace all components
    await prisma.salaryComponent.deleteMany({ where: { structureId: structure.id } })

    if (components.length) {
      await prisma.salaryComponent.createMany({
        data: components.map((c, i) => ({
          structureId: structure.id,
          name: c.name,
          type: c.type,
          calcType: c.calcType || "FIXED",
          value: parseFloat(c.value),
          isActive: c.isActive !== false,
          order: i,
        })),
      })
    }

    const updated = await prisma.salaryStructure.findUnique({
      where: { id: structure.id },
      include: { components: { orderBy: { order: "asc" } } },
    })

    return success(res, updated, "Salary structure saved")
  } catch (err) {
    next(err)
  }
}

// GET /api/payroll/templates
async function getTemplates(req, res, next) {
  try {
    const templates = await prisma.salaryTemplate.findMany({ orderBy: { name: "asc" } })
    return success(res, templates)
  } catch (err) {
    next(err)
  }
}

// POST /api/payroll/templates
async function saveTemplate(req, res, next) {
  try {
    const { name, description, basicSalary, components } = req.body
    const template = await prisma.salaryTemplate.upsert({
      where: { name },
      update: { description, basicSalary: parseFloat(basicSalary), components },
      create: { name, description, basicSalary: parseFloat(basicSalary), components },
    })
    return success(res, template, "Template saved", 201)
  } catch (err) {
    next(err)
  }
}

// POST /api/payroll/templates/:templateId/apply
async function applyTemplate(req, res, next) {
  try {
    const { templateId } = req.params
    const { employeeIds } = req.body

    const template = await prisma.salaryTemplate.findUnique({ where: { id: templateId } })
    if (!template) return notFound(res, "Template")

    const components = Array.isArray(template.components) ? template.components : JSON.parse(template.components || "[]")

    await Promise.all(
      employeeIds.map(async (empId) => {
        const structure = await prisma.salaryStructure.upsert({
          where: { employeeId: empId },
          update: { basicSalary: template.basicSalary },
          create: { employeeId: empId, basicSalary: template.basicSalary },
        })
        await prisma.salaryComponent.deleteMany({ where: { structureId: structure.id } })
        if (components.length) {
          await prisma.salaryComponent.createMany({
            data: components.map((c, i) => ({
              structureId: structure.id, name: c.name, type: c.type,
              calcType: c.calcType || "FIXED", value: parseFloat(c.value), order: i,
            })),
          })
        }
      })
    )

    return success(res, {}, `Template applied to ${employeeIds.length} employees`)
  } catch (err) {
    next(err)
  }
}

// ─── PAYROLL GENERATION ───────────────────────────────────────────────────────

function computeComponentAmount(component, basicSalary) {
  if (component.calcType === "PERCENTAGE") {
    return Math.round((basicSalary * component.value) / 100 * 100) / 100
  }
  return component.value
}

// POST /api/payroll/generate
async function generate(req, res, next) {
  try {
    const { month } = req.body
    const range = getMonthDateRange(month)
    const settings = await prisma.companySettings.findFirst()
    const workingDays = settings?.workingDaysPerMonth || getWorkingDaysInMonth(range.year, range.month)

    const employees = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      include: {
        salaryStructure: { include: { components: true } },
      },
    })

    let generated = 0
    const errors = []

    for (const emp of employees) {
      try {
        const structure = emp.salaryStructure
        if (!structure || structure.basicSalary === 0) continue

        // Get attendance for the month
        const attendance = await prisma.attendance.findMany({
          where: {
            employeeId: emp.id,
            date: { gte: range.startDate, lte: range.endDate },
          },
        })

        const presentDays = attendance.filter((a) => ["PRESENT", "WFH", "ON_LEAVE", "PERSONAL_HOLIDAY", "HOLIDAY"].includes(a.status)).length
        const lopDays = attendance.filter((a) => a.status === "ABSENT").length
        const halfDayCount = attendance.filter((a) => a.status === "HALF_DAY").length

        // Adjust LOP: half days count as 0.5 lop
        const totalLOP = lopDays + halfDayCount * 0.5

        // Calculate component amounts
        const componentSnapshot = structure.components.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          calcType: c.calcType,
          value: c.value,
          amount: computeComponentAmount(c, structure.basicSalary),
        }))

        const totalEarnings = componentSnapshot
          .filter((c) => c.type === "EARNING")
          .reduce((sum, c) => sum + c.amount, 0)

        const totalDeductionsFromComponents = componentSnapshot
          .filter((c) => c.type === "DEDUCTION")
          .reduce((sum, c) => sum + c.amount, 0)

        const grossSalary = structure.basicSalary + totalEarnings
        const lopAmount = calculateLOPAmount(grossSalary, workingDays, totalLOP)
        const halfDayAmount = calculateHalfDayAmount(grossSalary, workingDays, halfDayCount * 0.5)
        const totalDeductions = totalDeductionsFromComponents + lopAmount + halfDayAmount
        const netSalary = Math.max(0, grossSalary - totalDeductions)

        await prisma.payroll.upsert({
          where: { employeeId_month: { employeeId: emp.id, month: range.startDate } },
          update: {
            workingDays,
            presentDays,
            lopDays: totalLOP,
            halfDayCount,
            basicSalary: structure.basicSalary,
            grossSalary,
            totalDeductions,
            lopAmount,
            halfDayAmount,
            netSalary,
            components: componentSnapshot,
            status: "GENERATED",
          },
          create: {
            employeeId: emp.id,
            month: range.startDate,
            workingDays,
            presentDays,
            lopDays: totalLOP,
            halfDayCount,
            basicSalary: structure.basicSalary,
            grossSalary,
            totalDeductions,
            lopAmount,
            halfDayAmount,
            netSalary,
            components: componentSnapshot,
            status: "GENERATED",
          },
        })

        generated++
      } catch (empErr) {
        errors.push({ employee: emp.name, error: empErr.message })
      }
    }

    return success(res, { generated, errors }, `Salary generated for ${generated} employees`)
  } catch (err) {
    next(err)
  }
}

// GET /api/payroll
async function getPayrollList(req, res, next) {
  try {
    const { page = 1, limit = 15, search, month } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const where = {}
    if (month) {
      const range = getMonthDateRange(month)
      where.month = range.startDate
    }
    if (search) {
      where.employee = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { employeeId: { contains: search, mode: "insensitive" } },
        ],
      }
    }

    const [payrolls, total] = await Promise.all([
      prisma.payroll.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { employee: { name: "asc" } },
        include: { employee: { select: { id: true, name: true, employeeId: true, department: true } } },
      }),
      prisma.payroll.count({ where }),
    ])

    // Summary
    const summary = payrolls.reduce(
      (acc, p) => ({
        totalGross: acc.totalGross + p.grossSalary,
        totalNet: acc.totalNet + p.netSalary,
        totalDeductions: acc.totalDeductions + p.totalDeductions,
        paid: acc.paid + (p.status === "PAID" ? 1 : 0),
        total: acc.total + 1,
      }),
      { totalGross: 0, totalNet: 0, totalDeductions: 0, paid: 0, total: payrolls.length }
    )

    return success(res, {
      payrolls,
      summary,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/payroll/:id
async function getPayrollDetail(req, res, next) {
  try {
    const payroll = await prisma.payroll.findUnique({
      where: { id: req.params.id },
      include: { employee: { include: { department: true } } },
    })
    if (!payroll) return notFound(res, "Payroll")
    return success(res, payroll)
  } catch (err) {
    next(err)
  }
}

// PATCH /api/payroll/:id/override
async function overrideSalary(req, res, next) {
  try {
    const { netSalary, reason } = req.body
    const payroll = await prisma.payroll.update({
      where: { id: req.params.id },
      data: { overrideAmount: parseFloat(netSalary), overrideReason: reason, netSalary: parseFloat(netSalary) },
    })
    return success(res, payroll, "Salary overridden")
  } catch (err) {
    next(err)
  }
}

// PATCH /api/payroll/:id/mark-paid
async function markPaid(req, res, next) {
  try {
    const payroll = await prisma.payroll.findUnique({
      where: { id: req.params.id },
      include: { employee: { select: { name: true, email: true, fcmToken: true } } },
    })
    if (!payroll) return notFound(res, "Payroll")

    const updated = await prisma.payroll.update({
      where: { id: req.params.id },
      data: { status: "PAID", paidDate: new Date(), paidBy: req.user.id },
    })

    // Notify employee
    const monthLabel = dayjs(payroll.month).format("MMMM YYYY")

    if (payroll.employee.fcmToken) {
      await sendPushNotification(payroll.employee.fcmToken, {
        title: "Salary Credited 💰",
        body: `Your salary for ${monthLabel} has been processed. Net: ₹${payroll.netSalary.toLocaleString("en-IN")}`,
      })
    }

    const emailContent = templates.salaryCredited(payroll.employee.name, monthLabel, payroll.netSalary)
    await sendEmail({ to: payroll.employee.email, ...emailContent })

    return success(res, updated, "Marked as paid — employee notified")
  } catch (err) {
    next(err)
  }
}

// POST /api/payroll/bulk-mark-paid
async function bulkMarkPaid(req, res, next) {
  try {
    const { payrollIds } = req.body
    await prisma.payroll.updateMany({
      where: { id: { in: payrollIds } },
      data: { status: "PAID", paidDate: new Date(), paidBy: req.user.id },
    })
    return success(res, {}, `${payrollIds.length} payrolls marked as paid`)
  } catch (err) {
    next(err)
  }
}

// GET /api/payroll/my-slips
async function getMySalarySlips(req, res, next) {
  try {
    const { limit = 24 } = req.query
    const slips = await prisma.payroll.findMany({
      where: { employeeId: req.user.id, status: "PAID" },
      take: parseInt(limit),
      orderBy: { month: "desc" },
    })
    return success(res, { slips })
  } catch (err) {
    next(err)
  }
}

// GET /api/payroll/:id/slip/download
async function downloadSlip(req, res, next) {
  try {
    const payroll = await prisma.payroll.findFirst({
      where: {
        id: req.params.id,
        ...(req.user.role !== "ADMIN" ? { employeeId: req.user.id, status: "PAID" } : {}),
      },
      include: { employee: { include: { department: true } } },
    })
    if (!payroll) return notFound(res, "Payroll slip")

    const company = await prisma.companySettings.findFirst()
    const pdf = await generateSalarySlipPDF(payroll, payroll.employee, company)

    const month = dayjs(payroll.month).format("MMM-YYYY")
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=salary-slip-${payroll.employee.employeeId}-${month}.pdf`,
      "Content-Length": pdf.length,
    })
    res.send(pdf)
  } catch (err) {
    next(err)
  }
}

// GET /api/payroll/bank-export
async function getBankExport(req, res, next) {
  try {
    const { month } = req.query
    const range = getMonthDateRange(month || dayjs().format("YYYY-MM"))

    const payrolls = await prisma.payroll.findMany({
      where: { month: range.startDate, status: "PAID" },
      include: { employee: true },
    })

    const records = payrolls.map((p) => ({
      name: p.employee.name,
      employeeId: p.employee.employeeId,
      bankName: p.employee.bankName,
      bankAccount: p.employee.bankAccount,
      bankIfsc: p.employee.bankIfsc,
      netSalary: p.netSalary,
    }))

    const buffer = generateBankExport(records, range.startDate)
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=bank-export-${month}.xlsx`,
    })
    res.send(buffer)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  getStructure, saveStructure, getTemplates, saveTemplate, applyTemplate,
  generate, getPayrollList, getPayrollDetail, overrideSalary,
  markPaid, bulkMarkPaid, getMySalarySlips, downloadSlip, getBankExport,
}
