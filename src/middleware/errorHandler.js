// Error handler middleware
function errorHandler(err, req, res, next) {
  console.error("Error:", err.message)

  if (err.name === "ValidationError") {
    return res.status(400).json({ success: false, message: err.message })
  }

  if (err.code === "P2002") {
    const field = err.meta?.target?.[0] || "field"
    return res.status(409).json({ success: false, message: `${field} already exists` })
  }

  if (err.code === "P2025") {
    return res.status(404).json({ success: false, message: "Record not found" })
  }

  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, message: "File too large. Maximum size is 5MB" })
    }
    return res.status(400).json({ success: false, message: err.message })
  }

  const status = err.status || err.statusCode || 500
  const message = err.message || "Internal server error"
  res.status(status).json({ success: false, message })
}

// 404 handler
function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` })
}

module.exports = { errorHandler, notFound }
