const nodemailer = require("nodemailer")

let transporter = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return transporter
}

async function sendEmail({ to, subject, html, text }) {
  if (!process.env.SMTP_USER || process.env.SMTP_USER === "your@gmail.com") {
    console.log(`📧 [DEV EMAIL] To: ${to} | Subject: ${subject}`)
    return { messageId: "dev-mode" }
  }
  try {
    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM || `"${process.env.APP_NAME || "EMS Pro"}" <noreply@emspro.com>`,
      to, subject, html, text,
    })
    return info
  } catch (err) {
    console.error("Email send failed:", err.message)
    throw err
  }
}

const templates = {
  welcomeEmployee: (name, employeeId, email, password, loginUrl = "") => ({
    subject: `Welcome to ${process.env.APP_NAME || "EMS Pro"} — Your Account Details`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#3b82f6">Welcome, ${name}! 🎉</h2>
      <p>Your employee account has been created. Here are your credentials:</p>
      <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #e2e8f0">
        <p><strong>Employee ID:</strong> ${employeeId}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Temporary Password:</strong> <code style="background:#e2e8f0;padding:2px 8px;border-radius:4px;font-size:16px">${password}</code></p>
      </div>
      <p style="color:#64748b">Please change your password after first login.</p>
      ${loginUrl ? `<a href="${loginUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:8px">Login Now →</a>` : ""}
    </div>`,
  }),

  resetOTP: (name, otp) => ({
    subject: "Password Reset OTP — EMS Pro",
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2>Password Reset Request</h2>
      <p>Hi ${name}, use this OTP to reset your password:</p>
      <div style="text-align:center;background:#f8fafc;padding:32px;border-radius:12px;margin:24px 0">
        <span style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#3b82f6">${otp}</span>
      </div>
      <p style="color:#64748b">This OTP expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
    </div>`,
  }),

  leaveStatusUpdate: (name, leaveType, fromDate, toDate, status, reason = "") => ({
    subject: `Leave ${status === "APPROVED" ? "Approved ✅" : "Update"} — EMS Pro`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:${status === "APPROVED" ? "#22c55e" : "#ef4444"}">${status === "APPROVED" ? "Leave Approved! ✅" : "Leave Request Update"}</h2>
      <p>Hi ${name}, your <strong>${leaveType}</strong> request for <strong>${fromDate}</strong> to <strong>${toDate}</strong> has been <strong>${status.toLowerCase()}</strong>.</p>
      ${reason ? `<p><strong>Comment:</strong> ${reason}</p>` : ""}
    </div>`,
  }),

  salaryCredited: (name, month, netSalary) => ({
    subject: `Salary Credited for ${month} 💰`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#22c55e">Salary Credited 💰</h2>
      <p>Hi ${name}, your salary for <strong>${month}</strong> has been processed.</p>
      <p style="font-size:28px;font-weight:bold;color:#3b82f6">Net Pay: ₹${Number(netSalary).toLocaleString("en-IN")}</p>
      <p style="color:#64748b">Login to view the detailed breakdown and download your salary slip.</p>
    </div>`,
  }),

  taskAssigned: (name, taskTitle, deadline) => ({
    subject: `New Task Assigned: ${taskTitle}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2>New Task Assigned 📋</h2>
      <p>Hi ${name}, a new task has been assigned to you:</p>
      <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0">
        <p><strong>Task:</strong> ${taskTitle}</p>
        <p><strong>Deadline:</strong> ${deadline}</p>
      </div>
      <p>Login to view details and update your progress.</p>
    </div>`,
  }),
}

module.exports = { sendEmail, templates }
