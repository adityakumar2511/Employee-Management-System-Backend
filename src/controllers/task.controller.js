const prisma = require("../config/database")
const { sendEmail, templates } = require("../config/email")
const { sendPushNotification } = require("../config/firebase")
const { success, error, notFound } = require("../utils/response")
const { dayjs } = require("../utils/dateHelper")

// POST /api/tasks
async function create(req, res, next) {
  try {
    const { title, description, assignedToId, priority, deadline, isSelfAssigned } = req.body

    const assignedTo = await prisma.employee.findUnique({
      where: { id: assignedToId || req.user.id },
      select: { id: true, name: true, email: true, fcmToken: true },
    })
    if (!assignedTo) return error(res, "Assigned employee not found", 404)

    const task = await prisma.task.create({
      data: {
        title,
        description,
        assignedToId: assignedTo.id,
        createdById: req.user.id,
        priority: priority || "MEDIUM",
        deadline: new Date(deadline),
        isSelfAssigned: !!isSelfAssigned || assignedTo.id === req.user.id,
      },
      include: {
        assignedTo: { select: { id: true, name: true, employeeId: true } },
        createdBy: { select: { id: true, name: true } },
      },
    })

    // Notify assignee (if different from creator)
    if (assignedTo.id !== req.user.id) {
      if (assignedTo.fcmToken) {
        await sendPushNotification(assignedTo.fcmToken, {
          title: "New Task Assigned 📋",
          body: `${req.user.name} assigned you: ${title}`,
        })
      }
      const emailContent = templates.taskAssigned(
        assignedTo.name, title, dayjs(deadline).format("DD MMM YYYY")
      )
      await sendEmail({ to: assignedTo.email, ...emailContent })
    }

    return success(res, task, "Task created", 201)
  } catch (err) {
    next(err)
  }
}

// GET /api/tasks
async function getAll(req, res, next) {
  try {
    const { page = 1, limit = 15, search, status, priority } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)

    // Auto-update overdue tasks
    await prisma.task.updateMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        deadline: { lt: new Date() },
      },
      data: { status: "OVERDUE" },
    })

    const where = {}
    if (status) where.status = status
    if (priority) where.priority = priority
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { assignedTo: { name: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: [{ deadline: "asc" }, { priority: "asc" }],
        include: {
          assignedTo: { select: { id: true, name: true, employeeId: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { comments: true } },
        },
      }),
      prisma.task.count({ where }),
    ])

    // Stats
    const stats = await prisma.task.groupBy({
      by: ["status"],
      _count: { status: true },
    })
    const statsMap = {}
    stats.forEach((s) => { statsMap[s.status.toLowerCase().replace("_", "")] = s._count.status })

    return success(res, {
      tasks,
      stats: {
        pending: statsMap.pending || 0,
        inProgress: statsMap.inprogress || 0,
        completed: statsMap.completed || 0,
        overdue: statsMap.overdue || 0,
      },
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/tasks/my
async function getMyTasks(req, res, next) {
  try {
    const { status, limit = 50 } = req.query

    // Auto-mark overdue
    await prisma.task.updateMany({
      where: {
        assignedToId: req.user.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        deadline: { lt: new Date() },
      },
      data: { status: "OVERDUE" },
    })

    const where = { assignedToId: req.user.id }
    if (status) where.status = status

    const tasks = await prisma.task.findMany({
      where,
      take: parseInt(limit),
      orderBy: [{ deadline: "asc" }, { priority: "asc" }],
      include: { createdBy: { select: { id: true, name: true } } },
    })

    return success(res, { tasks })
  } catch (err) {
    next(err)
  }
}

// GET /api/tasks/:id
async function getById(req, res, next) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        assignedTo: { select: { id: true, name: true, employeeId: true } },
        createdBy: { select: { id: true, name: true } },
        comments: { orderBy: { createdAt: "asc" } },
      },
    })
    if (!task) return notFound(res, "Task")
    return success(res, task)
  } catch (err) {
    next(err)
  }
}

// PUT /api/tasks/:id
async function update(req, res, next) {
  try {
    const { title, description, assignedToId, priority, deadline } = req.body
    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        title, description, priority,
        deadline: deadline ? new Date(deadline) : undefined,
        assignedToId: assignedToId || undefined,
      },
      include: { assignedTo: { select: { id: true, name: true, employeeId: true } } },
    })
    return success(res, task, "Task updated")
  } catch (err) {
    next(err)
  }
}

// PATCH /api/tasks/:id/progress
async function updateProgress(req, res, next) {
  try {
    const { completionPercent, incompletionReason } = req.body
    const pct = Math.min(100, Math.max(0, parseInt(completionPercent)))

    const task = await prisma.task.findUnique({ where: { id: req.params.id } })
    if (!task) return notFound(res, "Task")

    // Check authorization: only assignee or admin
    if (req.user.role !== "ADMIN" && task.assignedToId !== req.user.id) {
      return error(res, "Not authorized to update this task", 403)
    }

    let newStatus = task.status
    if (pct === 100) newStatus = "COMPLETED"
    else if (pct > 0 && pct < 100) newStatus = "IN_PROGRESS"
    else if (pct === 0) newStatus = "PENDING"

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        completionPercent: pct,
        status: newStatus,
        incompletionReason: pct < 100 ? incompletionReason : null,
        completedAt: pct === 100 ? new Date() : null,
      },
    })

    return success(res, updated, "Progress updated")
  } catch (err) {
    next(err)
  }
}

// DELETE /api/tasks/:id
async function deleteTask(req, res, next) {
  try {
    await prisma.task.delete({ where: { id: req.params.id } })
    return success(res, {}, "Task deleted")
  } catch (err) {
    next(err)
  }
}

// POST /api/tasks/:id/comments
async function addComment(req, res, next) {
  try {
    const { comment } = req.body
    const taskComment = await prisma.taskComment.create({
      data: {
        taskId: req.params.id,
        authorId: req.user.id,
        author: req.user.name,
        text: comment,
      },
    })
    return success(res, taskComment, "Comment added", 201)
  } catch (err) {
    next(err)
  }
}

// GET /api/tasks/completion-report
async function getCompletionReport(req, res, next) {
  try {
    const { fromDate, toDate } = req.query
    const where = {}
    if (fromDate) where.createdAt = { gte: new Date(fromDate) }
    if (toDate) where.createdAt = { ...where.createdAt, lte: new Date(toDate) }

    const employees = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, employeeId: true },
    })

    const report = await Promise.all(
      employees.map(async (emp) => {
        const tasks = await prisma.task.findMany({
          where: { assignedToId: emp.id, ...where },
          select: { status: true, completionPercent: true },
        })

        const total = tasks.length
        const completed = tasks.filter((t) => t.status === "COMPLETED").length
        const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length
        const overdue = tasks.filter((t) => t.status === "OVERDUE").length
        const avgCompletion = total
          ? Math.round(tasks.reduce((s, t) => s + t.completionPercent, 0) / total)
          : 0

        return { ...emp, total, completed, inProgress, overdue, avgCompletion }
      })
    )

    return success(res, report)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  create, getAll, getMyTasks, getById, update, updateProgress,
  deleteTask, addComment, getCompletionReport,
}
