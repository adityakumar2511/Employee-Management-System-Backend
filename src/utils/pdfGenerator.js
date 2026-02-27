const PDFDocument = require("pdfkit")

function generateSalarySlipPDF(payroll, employee, company = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" })
    const buffers = []

    doc.on("data", (chunk) => buffers.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(buffers)))
    doc.on("error", reject)

    const primaryColor = "#3b82f6"
    const darkColor = "#1e293b"
    const grayColor = "#64748b"
    const lightGray = "#f8fafc"

    const dayjs = require("dayjs")
    const month = dayjs(payroll.month).format("MMMM YYYY")

    // Header
    doc.rect(50, 50, 495, 80).fill(primaryColor)
    doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold")
      .text(company.name || "EMS Pro", 70, 65)
    doc.fontSize(11).font("Helvetica")
      .text("SALARY SLIP", 70, 90)
    doc.text(month, 70, 108)

    // Employee Info Box
    doc.rect(50, 148, 495, 85).fill(lightGray).stroke("#e2e8f0")
    doc.fillColor(darkColor).fontSize(11).font("Helvetica-Bold")
      .text("EMPLOYEE INFORMATION", 65, 158)

    doc.fontSize(10).font("Helvetica")
    const empInfo = [
      ["Name", employee.name],
      ["Employee ID", employee.employeeId],
      ["Designation", employee.designation || "—"],
      ["Department", employee.department?.name || "—"],
      ["Bank Account", employee.bankAccount ? `****${employee.bankAccount.slice(-4)}` : "—"],
    ]

    let y = 172
    empInfo.forEach(([label, value], i) => {
      const col = i < 3 ? 0 : 1
      const row = i < 3 ? i : i - 3
      const x = col === 0 ? 65 : 300
      const rowY = y + row * 15
      doc.fillColor(grayColor).text(`${label}:`, x, rowY, { width: 100 })
      doc.fillColor(darkColor).text(value, x + 105, rowY)
    })

    // Attendance Summary
    doc.fillColor(darkColor).fontSize(11).font("Helvetica-Bold")
      .text("ATTENDANCE SUMMARY", 65, 248)

    const attItems = [
      ["Working Days", payroll.workingDays],
      ["Present Days", payroll.presentDays],
      ["LOP Days", payroll.lopDays || 0],
      ["Half Days", payroll.halfDayCount || 0],
    ]

    doc.fontSize(10).font("Helvetica")
    attItems.forEach(([label, value], i) => {
      const x = 65 + (i % 4) * 120
      doc.rect(x - 5, 263, 110, 28).fill("#fff").stroke("#e2e8f0")
      doc.fillColor(grayColor).text(label, x, 268, { width: 100, align: "center" })
      doc.fillColor(darkColor).font("Helvetica-Bold").text(String(value), x, 278, { width: 100, align: "center" })
      doc.font("Helvetica")
    })

    // Earnings & Deductions
    const components = payroll.components || []
    const earnings = components.filter((c) => c.type === "EARNING")
    const deductions = components.filter((c) => c.type === "DEDUCTION")

    const tableTop = 308
    const col1 = 65, col2 = 280, col3 = 430

    // Table headers
    doc.rect(50, tableTop, 495, 22).fill(primaryColor)
    doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold")
      .text("EARNINGS", col1, tableTop + 6)
      .text("DEDUCTIONS", col2, tableTop + 6)

    let earningY = tableTop + 26
    let deductionY = tableTop + 26
    const rowH = 20

    // Basic
    doc.fillColor(darkColor).fontSize(10).font("Helvetica")
    doc.rect(50, earningY, 225, rowH).fill(lightGray)
    doc.text("Basic Salary", col1, earningY + 5)
      .text(formatCurrency(payroll.basicSalary), col3, earningY + 5, { align: "right", width: 100 })
    earningY += rowH

    earnings.forEach((e, i) => {
      if (i % 2 === 0) doc.rect(50, earningY, 225, rowH).fill(lightGray)
      doc.fillColor(darkColor)
        .text(e.name, col1, earningY + 5)
        .text(formatCurrency(e.amount), col3, earningY + 5, { align: "right", width: 100 })
      earningY += rowH
    })

    deductions.forEach((d, i) => {
      if (i % 2 === 0) doc.rect(280, deductionY, 265, rowH).fill(lightGray)
      doc.fillColor(darkColor)
        .text(d.name, col2, deductionY + 5)
        .text(`-${formatCurrency(d.amount)}`, 480, deductionY + 5, { align: "right", width: 60 })
      deductionY += rowH
    })

    if (payroll.lopDays > 0) {
      doc.fillColor(darkColor)
        .text(`LOP (${payroll.lopDays} days)`, col2, deductionY + 5)
        .text(`-${formatCurrency(payroll.lopAmount || 0)}`, 480, deductionY + 5, { align: "right", width: 60 })
      deductionY += rowH
    }

    // Net Pay
    const netY = Math.max(earningY, deductionY) + 10
    doc.rect(50, netY, 495, 40).fill(primaryColor)
    doc.fillColor("#ffffff").fontSize(13).font("Helvetica-Bold")
      .text("NET PAY", col1, netY + 12)
      .text(formatCurrency(payroll.netSalary), 400, netY + 12, { align: "right", width: 130 })

    // Footer
    const footerY = netY + 60
    doc.fillColor(grayColor).fontSize(8).font("Helvetica")
      .text("This is a computer-generated payslip and does not require a signature.", 50, footerY, { align: "center", width: 495 })
      .text(`Generated on ${dayjs().format("DD MMM YYYY HH:mm")}`, 50, footerY + 12, { align: "center", width: 495 })

    doc.end()
  })
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

module.exports = { generateSalarySlipPDF }
