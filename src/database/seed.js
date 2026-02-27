const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  // Company Settings
  const existing = await prisma.companySettings.findFirst()
  if (!existing) {
    await prisma.companySettings.create({
      data: {
        name: "EMS Pro Demo Company",
        email: "hr@emspro.com",
        phone: "+91 9876543210",
        address: "123 Business Park, Mumbai, Maharashtra, India",
        employeeIdPrefix: "EMP",
        employeeIdCounter: 3,
        workingDaysPerMonth: 26,
        financialYearStart: 4,
        geoFenceEnabled: false, // disabled for dev
      },
    })
    console.log("✅ Company settings created")
  }

  // Departments
  const departments = ["Engineering", "HR", "Finance", "Operations", "Sales", "Marketing"]
  const deptMap = {}
  for (const name of departments) {
    const dept = await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    })
    deptMap[name] = dept.id
  }
  console.log("✅ Departments created")

  // Leave Types
  const leaveTypes = [
    { name: "Casual Leave", code: "CL", defaultDays: 12, isCarryForward: false, isPaid: true },
    { name: "Sick Leave", code: "SL", defaultDays: 12, isCarryForward: false, isPaid: true },
    { name: "Earned Leave", code: "EL", defaultDays: 15, isCarryForward: true, maxCarryForward: 30, isPaid: true },
    { name: "Maternity Leave", code: "ML", defaultDays: 90, isCarryForward: false, isPaid: true },
    { name: "Unpaid Leave", code: "UL", defaultDays: 0, isCarryForward: false, isPaid: false },
  ]

  const leaveTypeMap = {}
  for (const lt of leaveTypes) {
    const type = await prisma.leaveType.upsert({
      where: { code: lt.code },
      update: {},
      create: lt,
    })
    leaveTypeMap[lt.code] = type.id
  }
  console.log("✅ Leave types created")

  // Admin User
  const adminExists = await prisma.employee.findFirst({ where: { role: "ADMIN" } })
  if (!adminExists) {
    const adminHash = await bcrypt.hash("Admin@123", 12)
    const admin = await prisma.employee.create({
      data: {
        employeeId: "ADMIN001",
        name: "System Admin",
        email: "admin@emspro.com",
        passwordHash: adminHash,
        role: "ADMIN",
        designation: "HR Manager",
        departmentId: deptMap["HR"],
        joiningDate: new Date("2020-01-01"),
      },
    })
    console.log("✅ Admin created — email: admin@emspro.com | password: Admin@123")

    // Create leave balances for admin
    const year = new Date().getFullYear()
    for (const [code, typeId] of Object.entries(leaveTypeMap)) {
      const lt = leaveTypes.find((l) => l.code === code)
      await prisma.leaveBalance.create({
        data: {
          employeeId: admin.id,
          leaveTypeId: typeId,
          year,
          total: lt.defaultDays,
          used: 0,
          remaining: lt.defaultDays,
        },
      })
    }
    await prisma.personalHolidayBalance.create({
      data: { employeeId: admin.id, year, total: 3, used: 0, remaining: 3 },
    })
  }

  // Demo Employee
  const empExists = await prisma.employee.findFirst({ where: { role: "EMPLOYEE" } })
  if (!empExists) {
    const empHash = await bcrypt.hash("Employee@123", 12)
    const employee = await prisma.employee.create({
      data: {
        employeeId: "EMP001",
        name: "Rahul Sharma",
        email: "rahul@emspro.com",
        phone: "9876543210",
        passwordHash: empHash,
        role: "EMPLOYEE",
        designation: "Software Engineer",
        departmentId: deptMap["Engineering"],
        joiningDate: new Date("2022-06-01"),
        gender: "M",
        bankName: "HDFC Bank",
        bankAccount: "12345678901234",
        bankIfsc: "HDFC0001234",
      },
    })
    console.log("✅ Demo employee created — email: rahul@emspro.com | password: Employee@123")

    // Salary structure
    const structure = await prisma.salaryStructure.create({
      data: { employeeId: employee.id, basicSalary: 50000 },
    })

    await prisma.salaryComponent.createMany({
      data: [
        { structureId: structure.id, name: "HRA", type: "EARNING", calcType: "PERCENTAGE", value: 40, order: 0 },
        { structureId: structure.id, name: "Transport Allowance", type: "EARNING", calcType: "FIXED", value: 1600, order: 1 },
        { structureId: structure.id, name: "Medical Allowance", type: "EARNING", calcType: "FIXED", value: 1250, order: 2 },
        { structureId: structure.id, name: "Provident Fund (PF)", type: "DEDUCTION", calcType: "PERCENTAGE", value: 12, order: 3 },
        { structureId: structure.id, name: "Professional Tax", type: "DEDUCTION", calcType: "FIXED", value: 200, order: 4 },
        { structureId: structure.id, name: "TDS", type: "DEDUCTION", calcType: "FIXED", value: 1000, order: 5 },
      ],
    })

    // Leave balances
    const year = new Date().getFullYear()
    for (const [code, typeId] of Object.entries(leaveTypeMap)) {
      const lt = leaveTypes.find((l) => l.code === code)
      await prisma.leaveBalance.create({
        data: {
          employeeId: employee.id,
          leaveTypeId: typeId,
          year,
          total: lt.defaultDays,
          used: 0,
          remaining: lt.defaultDays,
        },
      })
    }
    await prisma.personalHolidayBalance.create({
      data: { employeeId: employee.id, year, total: 3, used: 0, remaining: 3 },
    })
  }

  // National Holidays (India 2025)
  const year = 2025
  const existingHolidays = await prisma.holiday.count({ where: { year } })
  if (!existingHolidays) {
    const holidays = [
      { name: "New Year's Day", date: "2025-01-01", type: "NATIONAL" },
      { name: "Republic Day", date: "2025-01-26", type: "NATIONAL" },
      { name: "Holi", date: "2025-03-14", type: "NATIONAL" },
      { name: "Good Friday", date: "2025-04-18", type: "NATIONAL" },
      { name: "Eid ul-Fitr", date: "2025-03-31", type: "NATIONAL" },
      { name: "Eid ul-Adha", date: "2025-06-07", type: "NATIONAL" },
      { name: "Independence Day", date: "2025-08-15", type: "NATIONAL" },
      { name: "Janmashtami", date: "2025-08-16", type: "NATIONAL" },
      { name: "Gandhi Jayanti", date: "2025-10-02", type: "NATIONAL" },
      { name: "Dussehra", date: "2025-10-02", type: "NATIONAL" },
      { name: "Diwali", date: "2025-10-20", type: "NATIONAL" },
      { name: "Christmas", date: "2025-12-25", type: "NATIONAL" },
    ]

    await prisma.holiday.createMany({
      data: holidays.map((h) => ({
        ...h,
        date: new Date(h.date),
        year,
      })),
      skipDuplicates: true,
    })
    console.log("✅ National holidays seeded")
  }

  // Demo Office Location (Geo-fence)
  const geoExists = await prisma.geoLocation.count()
  if (!geoExists) {
    await prisma.geoLocation.create({
      data: {
        name: "Head Office",
        address: "Bandra Kurla Complex, Mumbai, Maharashtra",
        latitude: 19.0596,
        longitude: 72.8656,
        radius: 500,
      },
    })
    console.log("✅ Office location seeded")
  }

  console.log("\n🎉 Seed complete!")
  console.log("─────────────────────────────────────────")
  console.log("Admin Login:    admin@emspro.com / Admin@123")
  console.log("Employee Login: rahul@emspro.com / Employee@123")
  console.log("─────────────────────────────────────────")
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
