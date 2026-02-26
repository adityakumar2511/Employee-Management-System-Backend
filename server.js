require('dotenv').config()
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')

// Config load hone ke baad
require('./config/firebase-admin') // Firebase Admin initialize

const app = express()
app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL }))
app.use(express.json())

// Routes
app.use('/api/auth', require('./routes/auth.routes'))
app.use('/api/employees', require('./routes/employee.routes'))
app.use('/api/attendance', require('./routes/attendance.routes'))
// ... baaki routes

app.listen(process.env.PORT || 5000)