const ExcelJS = require("exceljs") // using exceljs-style compatible approach via xlsx

// We'll use xlsx package which is already in deps
const XLSX = require("xlsx")
const dayjs = require("dayjs")

function createWorkbook() {
  return new XLSX.utils.book_new ? XLSX.utils.book_new() : XLSX.utils.book_new()
}

function generateAttendanceReport(records, month) {
  const wb = XLSX.utils.book_new()

  const headers = ["Employee ID", "Name", "Department", "Present", "Absent", "Half Days", "Leave", "WFH", "LOP", "Hours Worked"]
  const rows = records.map((r) => [
    r.employeeId, r.name, r.department || "—",
    r.present, r.absent, r.halfDays, r.onLeave, r.wfh, r.lop,
    r.hoursWorked || 0,
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws["!cols"] = headers.map(() => ({ wch: 15 }))
  XLSX.utils.book_append_sheet(wb, ws, "Attendance Report")

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

function generatePayrollReport(records, month) {
  const wb = XLSX.utils.book_new()

  const headers = ["Employee ID", "Name", "Department", "Basic", "Gross", "Deductions", "LOP Days", "LOP Amount", "Net Salary", "Status"]
  const rows = records.map((r) => [
    r.employeeId, r.name, r.department || "—",
    r.basic, r.gross, r.deductions, r.lopDays, r.lopAmount, r.net, r.status,
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws["!cols"] = headers.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, ws, "Payroll Report")

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

function generateBankExport(records, month) {
  const wb = XLSX.utils.book_new()

  const headers = ["Sr No", "Employee Name", "Employee ID", "Bank Name", "Account Number", "IFSC Code", "Net Salary", "Month"]
  const rows = records.map((r, i) => [
    i + 1, r.name, r.employeeId, r.bankName || "", r.bankAccount || "", r.bankIfsc || "",
    r.netSalary, dayjs(month).format("MMMM YYYY"),
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws["!cols"] = headers.map(() => ({ wch: 20 }))
  XLSX.utils.book_append_sheet(wb, ws, "Bank Export")

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

function generateLeaveReport(records) {
  const wb = XLSX.utils.book_new()

  const headers = ["Employee ID", "Name", "Leave Type", "Total Allotted", "Used", "Balance", "LOP Leaves"]
  const rows = records.map((r) => [
    r.employeeId, r.name, r.leaveType, r.total, r.used, r.balance, r.lopLeaves || 0,
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws["!cols"] = headers.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, ws, "Leave Report")

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

function generateEmployeeImportTemplate() {
  const wb = XLSX.utils.book_new()

  const headers = [
    "Name*", "Email*", "Phone", "Department", "Designation",
    "Joining Date (YYYY-MM-DD)", "Date of Birth (YYYY-MM-DD)",
    "Gender (M/F/Other)", "Address", "Basic Salary",
    "Bank Name", "Account Number", "IFSC Code", "PAN Number",
  ]
  const example = [
    "John Doe", "john@company.com", "9876543210", "Engineering", "Software Engineer",
    "2024-01-15", "1995-06-20", "M", "123 Main St, City", "50000",
    "HDFC Bank", "12345678901234", "HDFC0001234", "ABCDE1234F",
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers, example])
  ws["!cols"] = headers.map(() => ({ wch: 22 }))
  XLSX.utils.book_append_sheet(wb, ws, "Employee Import Template")

  // Instructions sheet
  const instructions = [
    ["INSTRUCTIONS FOR BULK EMPLOYEE IMPORT"],
    [""],
    ["1. Fields marked with * are mandatory"],
    ["2. Email must be unique for each employee"],
    ["3. Date format: YYYY-MM-DD (e.g., 2024-01-15)"],
    ["4. Department must already exist in the system"],
    ["5. Gender: M = Male, F = Female, Other = Other"],
    ["6. Basic Salary is in INR (numbers only, no commas)"],
    ["7. Do not modify the header row"],
    ["8. Maximum 500 employees per import"],
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(instructions)
  ws2["!cols"] = [{ wch: 60 }]
  XLSX.utils.book_append_sheet(wb, ws2, "Instructions")

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

function parseEmployeeImport(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

  const headers = rows[0]
  const data = rows.slice(1).filter((r) => r.some(Boolean))

  return data.map((row, i) => ({
    rowNumber: i + 2,
    name: row[0]?.toString().trim(),
    email: row[1]?.toString().trim().toLowerCase(),
    phone: row[2]?.toString().trim(),
    department: row[3]?.toString().trim(),
    designation: row[4]?.toString().trim(),
    joiningDate: row[5]?.toString().trim(),
    dateOfBirth: row[6]?.toString().trim(),
    gender: row[7]?.toString().trim(),
    address: row[8]?.toString().trim(),
    basicSalary: parseFloat(row[9]) || 0,
    bankName: row[10]?.toString().trim(),
    bankAccount: row[11]?.toString().trim(),
    bankIfsc: row[12]?.toString().trim(),
    panNumber: row[13]?.toString().trim(),
  }))
}

module.exports = {
  generateAttendanceReport,
  generatePayrollReport,
  generateBankExport,
  generateLeaveReport,
  generateEmployeeImportTemplate,
  parseEmployeeImport,
}
