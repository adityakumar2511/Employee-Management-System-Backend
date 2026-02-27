function success(res, data = {}, message = "Success", statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data })
}

function created(res, data = {}, message = "Created successfully") {
  return success(res, data, message, 201)
}

function paginated(res, data, total, page, limit, message = "Success") {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    },
  })
}

function error(res, message = "Error", statusCode = 400) {
  return res.status(statusCode).json({ success: false, message })
}

function notFound(res, resource = "Resource") {
  return error(res, `${resource} not found`, 404)
}

function forbidden(res, message = "Access denied") {
  return error(res, message, 403)
}

module.exports = { success, created, paginated, error, notFound, forbidden }
