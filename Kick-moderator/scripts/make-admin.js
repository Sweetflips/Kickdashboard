require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function makeAdmin(username) {
  try {
    const user = await prisma.user.updateMany({
      where: {
        username: {
          equals: username,
          mode: 'insensitive'
        }
      },
      data: {
        is_admin: true
      }
    })
    
    if (user.count > 0) {
      console.log(`✅ Successfully made ${username} an admin (${user.count} user(s) updated)`)
    } else {
      console.log(`❌ User "${username}" not found in the database`)
    }
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

const username = process.argv[2] || 'amorsweetflips'
makeAdmin(username)

