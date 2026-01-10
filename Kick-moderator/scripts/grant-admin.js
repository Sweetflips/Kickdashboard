const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function grantAdmin() {
  try {
    const username = 'amorsweetflips'

    console.log(`Granting admin access to user: ${username}`)

    const user = await prisma.user.updateMany({
      where: {
        username: {
          equals: username,
          mode: 'insensitive',
        },
      },
      data: {
        is_admin: true,
      },
    })

    if (user.count === 0) {
      console.log(`⚠️  User "${username}" not found in database.`)
      console.log('Make sure the user has logged in at least once.')
    } else {
      console.log(`✅ Successfully granted admin access to "${username}"`)
    }
  } catch (error) {
    console.error('Error granting admin access:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

grantAdmin()
