const bcrypt = require("bcryptjs")
const prisma = require("../config/database")
const { sendEmail, templates } = require("../config/email")
const { generateTempPassword, generateAccessToken } = require("../utils/jwt")
const { generateEmployeeId } = require("../utils/dateHelper")
const { parseEmployeeImport, generateEmployeeImportTemplate } = require("../utils/excelHelper")
const { success, created, paginated, error, notFound } = require("../utils/response")
const path = require("path")
const fs = require("fs")

// GET /api/employees
async function getAll(req, res, next) {
  try {
    const { page = 1, limit = 15, search, status, departmentId } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const where = {}
    if (status) where.status = status
    if (departmentId) where.departmentId = departmentId
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { employeeId: { contains: search, mode: "insensitive" } },
        { designation: { contains: search, mode: "insensitive" } },
      ]
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
        include: { department: true },
        omit: { passwordHash: true, fcmToken: true },
      }),
      prisma.employee.count({ where }),
    ])

    return res.json({
      success: true,
      data: {
        employees,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/employees/:id
async function getById(req, res, next) {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { department: true, documents: true },
      omit: { passwordHash: true, fcmToken: true },
    })
    if (!employee) return notFound(res, "Employee")
    return success(res, employee)
  } catch (err) {
    next(err)
  }
}

// POST /api/employees
async function create(req, res, next) {
  try {
    const {
      name, email, phone, departmentId, designation, joiningDate, dateOfBirth,
      gender, address, panNumber, bankName, bankAccount, bankIfsc,
      basicSalary, passwordMode, manualPassword,
    } = req.body

    // Check email uniqueness
    const existing = await prisma.employee.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) return error(res, "Email already exists", 409)

    const employeeId = await generateEmployeeId(prisma)
    const tempPassword = passwordMode === "manual" && manualPassword ? manualPassword : generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    // Create or find department
    let deptId = departmentId
    if (!deptId && req.body.department) {
      const dept = await prisma.department.upsert({
        where: { name: req.body.department },
        update: {},
        create: { name: req.body.department },
      })
      deptId = dept.id
    }

    const employee = await prisma.employee.create({
      data: {
        employeeId,
        name,
        email: email.toLowerCase(),
        phone,
        passwordHash,
        departmentId: deptId || null,
        designation,
        joiningDate: joiningDate ? new Date(joiningDate) : null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        address,
        panNumber,
        bankName,
        bankAccount,
        bankIfsc,
      },
      include: { department: true },
      omit: { passwordHash: true, fcmToken: true },
    })

    // Create salary structure if basicSalary provided
    if (basicSalary) {
      await prisma.salaryStructure.create({
        data: { employeeId: employee.id, basicSalary: parseFloat(basicSalary) },
      })
    }

    // Create leave balances for all leave types
    const leaveTypes = await prisma.leaveType.findMany({ where: { isActive: true } })
    const year = new Date().getFullYear()
    await prisma.leaveBalance.createMany({
      data: leaveTypes.map((lt) => ({
        employeeId: employee.id,
        leaveTypeId: lt.id,
        year,
        total: lt.defaultDays,
        used: 0,
        remaining: lt.defaultDays,
      })),
    })

    // Create personal holiday balance
    await prisma.personalHolidayBalance.create({
      data: { employeeId: employee.id, year, total: 3, used: 0, remaining: 3 },
    })

    // Send welcome email
    try {
      const loginUrl = `${process.env.FRONTEND_URL}/auth/login`
      const emailContent = templates.welcomeEmployee(name, employeeId, email, tempPassword, loginUrl)
      await sendEmail({ to: email, ...emailContent })
    } catch (emailErr) {
      console.warn("Welcome email failed:", emailErr.message)
    }

    return created(res, { employee, tempPassword }, "Employee created successfully")
  } catch (err) {
    next(err)
  }
}

// PUT /api/employees/:id
async function update(req, res, next) {
  try {
    const { id } = req.params
    const {
      name, phone, departmentId, designation, joiningDate, dateOfBirth,
      gender, address, panNumber, bankName, bankAccount, bankIfsc,
    } = req.body

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        name, phone, departmentId: departmentId || undefined, designation,
        joiningDate: joiningDate ? new Date(joiningDate) : undefined,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        gender, address, panNumber, bankName, bankAccount, bankIfsc,
      },
      include: { department: true },
      omit: { passwordHash: true, fcmToken: true },
    })

    return success(res, employee, "Employee updated")
  } catch (err) {
    next(err)
  }
}

// DELETE /api/employees/:id
async function deleteEmployee(req, res, next) {
  try {
    const { id } = req.params
    // Soft delete: deactivate
    await prisma.employee.update({ where: { id }, data: { status: "INACTIVE" } })
    return success(res, {}, "Employee deactivated")
  } catch (err) {
    next(err)
  }
}

// PATCH /api/employees/:id/status
async function toggleStatus(req, res, next) {
  try {
    const { id } = req.params
    const { status } = req.body
    await prisma.employee.update({ where: { id }, data: { status } })
    return success(res, {}, `Employee ${status === "ACTIVE" ? "activated" : "deactivated"}`)
  } catch (err) {
    next(err)
  }
}

// POST /api/employees/:id/reset-password
async function resetPassword(req, res, next) {
  try {
    const { id } = req.params
    const { newPassword } = req.body

    const password = newPassword || generateTempPassword()
    const hash = await bcrypt.hash(password, 12)
    const employee = await prisma.employee.update({
      where: { id },
      data: { passwordHash: hash },
    })

    return success(res, { tempPassword: password }, "Password reset successfully")
  } catch (err) {
    next(err)
  }
}

// POST /api/employees/:id/send-credentials
async function sendCredentials(req, res, next) {
  try {
    const { id } = req.params
    const employee = await prisma.employee.findUnique({ where: { id } })
    if (!employee) return notFound(res, "Employee")

    const tempPassword = generateTempPassword()
    const hash = await bcrypt.hash(tempPassword, 12)
    await prisma.employee.update({ where: { id }, data: { passwordHash: hash } })

    const loginUrl = `${process.env.FRONTEND_URL}/auth/login`
    const emailContent = templates.welcomeEmployee(
      employee.name, employee.employeeId, employee.email, tempPassword, loginUrl
    )
    await sendEmail({ to: employee.email, ...emailContent })

    return success(res, {}, "Credentials sent to employee's email")
  } catch (err) {
    next(err)
  }
}

// POST /api/employees/bulk-import
async function bulkImport(req, res, next) {
  try {
    if (!req.file) return error(res, "No file uploaded", 400)

    const rows = parseEmployeeImport(req.file.buffer || fs.readFileSync(req.file.path))
    const results = { success: [], errors: [] }

    for (const row of rows) {
      try {
        if (!row.name || !row.email) {
          results.errors.push({ row: row.rowNumber, message: "Name and email are required" })
          continue
        }

        const existing = await prisma.employee.findUnique({ where: { email: row.email } })
        if (existing) {
          results.errors.push({ row: row.rowNumber, message: `Email ${row.email} already exists` })
          continue
        }

        const employeeId = await generateEmployeeId(prisma)
        const tempPassword = generateTempPassword()
        const hash = await bcrypt.hash(tempPassword, 12)

        let deptId = null
        if (row.department) {
          const dept = await prisma.department.upsert({
            where: { name: row.department },
            update: {},
            create: { name: row.department },
          })
          deptId = dept.id
        }

        const emp = await prisma.employee.create({
          data: {
            employeeId,
            name: row.name,
            email: row.email,
            phone: row.phone || null,
            passwordHash: hash,
            departmentId: deptId,
            designation: row.designation || null,
            joiningDate: row.joiningDate ? new Date(row.joiningDate) : null,
            dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
            gender: row.gender || null,
            address: row.address || null,
            panNumber: row.panNumber || null,
            bankName: row.bankName || null,
            bankAccount: row.bankAccount || null,
            bankIfsc: row.bankIfsc || null,
          },
        })

        if (row.basicSalary) {
          await prisma.salaryStructure.create({
            data: { employeeId: emp.id, basicSalary: row.basicSalary },
          })
        }

        // Create leave balances
        const leaveTypes = await prisma.leaveType.findMany({ where: { isActive: true } })
        const year = new Date().getFullYear()
        await prisma.leaveBalance.createMany({
          data: leaveTypes.map((lt) => ({
            employeeId: emp.id, leaveTypeId: lt.id, year,
            total: lt.defaultDays, used: 0, remaining: lt.defaultDays,
          })),
        })
        await prisma.personalHolidayBalance.create({
          data: { employeeId: emp.id, year, total: 3, used: 0, remaining: 3 },
        })

        results.success.push({ employeeId, name: row.name, email: row.email, tempPassword })
      } catch (rowErr) {
        results.errors.push({ row: row.rowNumber, message: rowErr.message })
      }
    }

    return success(res, results, `Imported ${results.success.length} employees. ${results.errors.length} errors.`)
  } catch (err) {
    next(err)
  }
}

// GET /api/employees/bulk-template
async function downloadTemplate(req, res, next) {
  try {
    const buffer = generateEmployeeImportTemplate()
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=employee-import-template.xlsx",
    })
    res.send(buffer)
  } catch (err) {
    next(err)
  }
}

// POST /api/employees/:id/documents
async function uploadDocument(req, res, next) {
  try {
    if (!req.file) return error(res, "No file uploaded", 400)
    const { id } = req.params
    const { name } = req.body

    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId: id,
        name: name || req.file.originalname,
        fileUrl: `/uploads/documents/${req.file.filename}`,
        fileType: req.file.mimetype,
      },
    })

    return created(res, doc, "Document uploaded")
  } catch (err) {
    next(err)
  }
}

// GET /api/employees/departments
async function getDepartments(req, res, next) {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { employees: true } } },
    })
    return success(res, departments)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  getAll, getById, create, update, deleteEmployee, toggleStatus,
  resetPassword, sendCredentials, bulkImport, downloadTemplate,
  uploadDocument, getDepartments,
}
