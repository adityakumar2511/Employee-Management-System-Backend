const multer = require("multer")
const path = require("path")
const fs = require("fs")

const uploadDir = process.env.UPLOAD_DIR || "./uploads"

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function createStorage(subfolder) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(uploadDir, subfolder)
      ensureDir(dir)
      cb(null, dir)
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname)
      const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
      cb(null, name)
    },
  })
}

const imageFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/
  if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error("Only image files are allowed"), false)
  }
}

const docFilter = (req, file, cb) => {
  const allowed = /pdf|doc|docx|xls|xlsx|jpg|jpeg|png/
  if (allowed.test(path.extname(file.originalname).toLowerCase())) {
    cb(null, true)
  } else {
    cb(new Error("Invalid file type"), false)
  }
}

const excelFilter = (req, file, cb) => {
  const allowed = /xlsx|xls|csv/
  if (allowed.test(path.extname(file.originalname).toLowerCase())) {
    cb(null, true)
  } else {
    cb(new Error("Only Excel/CSV files are allowed"), false)
  }
}

const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB

const uploadAvatar = multer({ storage: createStorage("avatars"), fileFilter: imageFilter, limits: { fileSize: maxSize } }).single("avatar")
const uploadLogo = multer({ storage: createStorage("logos"), fileFilter: imageFilter, limits: { fileSize: maxSize } }).single("logo")
const uploadDocument = multer({ storage: createStorage("documents"), fileFilter: docFilter, limits: { fileSize: maxSize } }).single("document")
const uploadExcel = multer({ storage: createStorage("imports"), fileFilter: excelFilter, limits: { fileSize: maxSize } }).single("file")

module.exports = { uploadAvatar, uploadLogo, uploadDocument, uploadExcel }
