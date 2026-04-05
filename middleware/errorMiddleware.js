const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`)
  res.status(404)
  next(error)
}

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode
  res.status(statusCode)

  // Enhanced logging for debugging
  console.error('--- ERROR HANDLER LOG ---')
  console.error('Message:', err.message)
  console.error('Stack:', err.stack)
  console.error('Request Path:', req.originalUrl)
  console.error('Request Method:', req.method)
  console.error('Request Body:', req.body)
  console.error('Request Headers:', req.headers)
  console.error('------------------------')

  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  })
}

export { notFound, errorHandler }
