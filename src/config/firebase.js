const admin = require("firebase-admin")

let initialized = false

function getFirebase() {
  if (!initialized) {
    try {
      if (!process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID === "your-project-id") {
        console.warn("⚠️  Firebase not configured — push notifications disabled")
        return null
      }
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      })
      initialized = true
    } catch (err) {
      console.warn("⚠️  Firebase init failed:", err.message)
      return null
    }
  }
  return admin
}

async function sendPushNotification(fcmToken, { title, body, data = {} }) {
  const fb = getFirebase()
  if (!fb || !fcmToken) return null
  try {
    const stringData = {}
    Object.keys(data).forEach((k) => { stringData[k] = String(data[k]) })
    await fb.messaging().send({ token: fcmToken, notification: { title, body }, data: stringData })
  } catch (err) {
    console.warn("FCM send failed:", err.message)
  }
}

async function sendMulticastNotification(tokens, { title, body, data = {} }) {
  const fb = getFirebase()
  if (!fb || !tokens?.length) return null
  const validTokens = tokens.filter(Boolean)
  if (!validTokens.length) return
  try {
    const stringData = {}
    Object.keys(data).forEach((k) => { stringData[k] = String(data[k]) })
    await fb.messaging().sendEachForMulticast({ tokens: validTokens, notification: { title, body }, data: stringData })
  } catch (err) {
    console.warn("FCM multicast failed:", err.message)
  }
}

module.exports = { getFirebase, sendPushNotification, sendMulticastNotification }
