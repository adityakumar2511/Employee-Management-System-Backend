// src/utils/socket.js

// Kisi bhi controller se call karo — real-time event emit karega
const emitEvent = (event, data, room = null) => {
  if (!global.io) return
  if (room) {
    global.io.to(room).emit(event, data)
  } else {
    global.io.emit(event, data)  // sabhi clients ko
  }
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────

// Employees
const emitEmployeeCreated = (employee) => emitEvent("employee:created", employee)
const emitEmployeeUpdated = (employee) => emitEvent("employee:updated", employee)
const emitEmployeeDeleted = (id) => emitEvent("employee:deleted", { id })

// Attendance
const emitAttendanceUpdated = (data) => emitEvent("attendance:updated", data)

// Leaves
const emitLeaveCreated = (leave) => {
  emitEvent("leave:created", leave, "admin")                    // Admin ko
  emitEvent("leave:created", leave, `employee:${leave.employeeId}`) // Employee ko
}
const emitLeaveUpdated = (leave) => {
  emitEvent("leave:updated", leave, "admin")
  emitEvent("leave:updated", leave, `employee:${leave.employeeId}`)
}

// Tasks
const emitTaskCreated = (task) => {
  emitEvent("task:created", task, "admin")
  emitEvent("task:created", task, `employee:${task.assignedToId}`)
}
const emitTaskUpdated = (task) => {
  emitEvent("task:updated", task, "admin")
  emitEvent("task:updated", task, `employee:${task.assignedToId}`)
}

// Payroll
const emitPayrollUpdated = (payroll) => {
  emitEvent("payroll:updated", payroll, "admin")
  emitEvent("payroll:updated", payroll, `employee:${payroll.employeeId}`)
}

// Dashboard stats refresh
const emitStatsRefresh = () => emitEvent("stats:refresh", {})

module.exports = {
  emitEmployeeCreated, emitEmployeeUpdated, emitEmployeeDeleted,
  emitAttendanceUpdated,
  emitLeaveCreated, emitLeaveUpdated,
  emitTaskCreated, emitTaskUpdated,
  emitPayrollUpdated,
  emitStatsRefresh,
}