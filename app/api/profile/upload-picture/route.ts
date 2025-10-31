import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Upload profile picture endpoint
 * POST /api/profile/upload-picture
 * FormData with 'image' field containing the file
 */
export async function POST(request: Request) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📤 [PROFILE PICTURE UPLOAD] Starting upload process...')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    try {
        const formData = await request.formData()
        const file = formData.get('image') as File

        if (!file) {
            console.error('❌ [VALIDATION] No image file provided in request')
            return NextResponse.json(
                { error: 'No image file provided' },
                { status: 400 }
            )
        }

        console.log('📄 [FILE INFO]')
        console.log(`   ├─ File Name: ${file.name}`)
        console.log(`   ├─ File Type: ${file.type}`)
        console.log(`   ├─ File Size: ${(file.size / 1024).toFixed(2)} KB (${file.size} bytes)`)

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
        if (!allowedTypes.includes(file.type)) {
            console.error(`❌ [VALIDATION] Invalid file type: ${file.type}`)
            console.error(`   └─ Allowed types: ${allowedTypes.join(', ')}`)
            return NextResponse.json(
                { error: 'Invalid file type. Only JPG, PNG, GIF, and WebP are allowed.' },
                { status: 400 }
            )
        }
        console.log('   └─ ✅ File type validated')

        // Validate file size (2MB max)
        const maxSize = 2 * 1024 * 1024 // 2MB
        if (file.size > maxSize) {
            console.error(`❌ [VALIDATION] File size too large: ${(file.size / 1024 / 1024).toFixed(2)} MB`)
            console.error(`   └─ Maximum allowed: 2 MB`)
            return NextResponse.json(
                { error: 'File size too large. Maximum size is 2MB.' },
                { status: 400 }
            )
        }
        console.log('   └─ ✅ File size validated\n')

        // Get user ID from query params or form data
        const userId = formData.get('userId') as string || new URL(request.url).searchParams.get('userId')

        if (!userId) {
            console.error('❌ [VALIDATION] User ID not provided')
            return NextResponse.json(
                { error: 'User ID is required' },
                { status: 400 }
            )
        }

        console.log('👤 [USER INFO]')
        console.log(`   └─ Kick User ID: ${userId}\n`)

        // Convert file to base64 data URI
        console.log('💾 [IMAGE PROCESSING]')
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const base64 = buffer.toString('base64')
        const mimeType = file.type || 'image/jpeg'
        const dataUri = `data:${mimeType};base64,${base64}`

        console.log(`   ├─ File Size: ${(buffer.length / 1024).toFixed(2)} KB`)
        console.log(`   ├─ MIME Type: ${mimeType}`)
        console.log(`   ├─ Base64 Length: ${base64.length} characters`)
        console.log(`   └─ ✅ Image converted to base64 data URI\n`)

        // Save to database
        console.log('🗄️  [DATABASE] Saving profile picture to database...')
        try {
            const kickUserId = BigInt(userId)

            // Check if user exists first
            console.log(`   ├─ Checking if user exists (kick_user_id: ${userId})...`)
            const existingUser = await db.user.findUnique({
                where: { kick_user_id: kickUserId },
                select: {
                    id: true,
                    username: true,
                    custom_profile_picture_url: true,
                },
            })

            if (existingUser) {
                console.log(`   ├─ User found: ${existingUser.username || 'Unknown'} (DB ID: ${existingUser.id})`)
                console.log(`   ├─ Previous custom profile picture: ${existingUser.custom_profile_picture_url ? 'Exists' : 'None'}`)

                await db.user.update({
                    where: { kick_user_id: kickUserId },
                    data: { custom_profile_picture_url: dataUri },
                })

                console.log(`   ├─ New custom profile picture stored in database`)
                console.log(`   ├─ Data URI length: ${dataUri.length} characters`)
                console.log(`   └─ ✅ Successfully saved to database\n`)
            } else {
                console.warn(`   └─ ⚠️  User ${userId} not found in database`)
                console.warn(`      └─ Database update skipped`)
                console.warn(`      └─ User may need to be created via auth callback first\n`)
                return NextResponse.json(
                    { error: 'User not found in database' },
                    { status: 404 }
                )
            }
        } catch (dbError) {
            console.error(`   └─ ❌ Database error:`, dbError)
            if (dbError instanceof Error) {
                console.error(`      └─ Error message: ${dbError.message}`)
            }
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
            return NextResponse.json(
                {
                    error: 'Failed to save profile picture to database',
                    details: dbError instanceof Error ? dbError.message : 'Unknown error',
                },
                { status: 500 }
            )
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`✅ [SUCCESS] Profile picture upload completed`)
        console.log(`   └─ Stored in database as data URI`)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

        return NextResponse.json({
            success: true,
            url: dataUri,
            message: 'Profile picture uploaded and saved to database successfully'
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.error('❌ [ERROR] Profile picture upload failed')
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.error(`   └─ Error: ${errorMessage}`)
        if (error instanceof Error && error.stack) {
            console.error(`   └─ Stack: ${error.stack}`)
        }
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

        return NextResponse.json(
            {
                error: 'Failed to upload profile picture',
                details: errorMessage,
            },
            { status: 500 }
        )
    }
}
