const { PrismaClient } = require("@prisma/client")

const globalForPrisma = global

if (!globalForPrisma.__prisma) {
  globalForPrisma.__prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  })

  // Neon ke liye — idle connection pe reconnect
  globalForPrisma.__prisma.$connect().catch((err) => {
    console.error("❌ Prisma initial connect failed:", err.message)
  })
}

const prisma = globalForPrisma.__prisma

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect()
})

process.on("SIGINT", async () => {
  await prisma.$disconnect()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  await prisma.$disconnect()
  process.exit(0)
})

module.exports = prisma