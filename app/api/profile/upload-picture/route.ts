import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/r2'
import { buildMediaUrlFromKey } from '@/lib/media-url'
import sharp from 'sharp'
import { randomBytes } from 'crypto'

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

        // Process image with sharp: resize, crop to square, convert to WebP
        console.log('💾 [IMAGE PROCESSING]')
        const bytes = await file.arrayBuffer()
        const inputBuffer = Buffer.from(bytes)

        console.log(`   ├─ Original Size: ${(inputBuffer.length / 1024).toFixed(2)} KB`)
        console.log(`   ├─ Original MIME Type: ${file.type}`)

        // Process image: resize to 256x256 square, convert to WebP
        const processedBuffer = await sharp(inputBuffer)
          .resize(256, 256, {
            fit: 'cover',
            position: 'center',
          })
          .webp({ quality: 85 })
          .toBuffer()

        console.log(`   ├─ Processed Size: ${(processedBuffer.length / 1024).toFixed(2)} KB`)
        console.log(`   ├─ Format: WebP`)
        console.log(`   └─ ✅ Image processed\n`)

        // Generate versioned key: avatars/<kickUserId>/<timestamp>_<random>.webp
        const timestamp = Date.now()
        const random = randomBytes(8).toString('hex')
        const r2Key = `avatars/${userId}/${timestamp}_${random}.webp`

        console.log('☁️  [R2 UPLOAD] Uploading to R2...')
        console.log(`   ├─ R2 Key: ${r2Key}`)

        // Upload to R2
        await uploadToR2({
          key: r2Key,
          body: processedBuffer,
          contentType: 'image/webp',
          metadata: {
            original_filename: file.name || 'avatar',
            uploaded_at: new Date().toISOString(),
          },
        })

        console.log(`   └─ ✅ Successfully uploaded to R2\n`)

        // Generate the serve URL
        const serveUrl = buildMediaUrlFromKey(r2Key)

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
                    data: { custom_profile_picture_url: serveUrl },
                })

                console.log(`   ├─ New custom profile picture URL stored in database`)
                console.log(`   ├─ Serve URL: ${serveUrl}`)
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
        console.log(`   └─ Stored in R2 and URL saved to database`)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

        return NextResponse.json({
            success: true,
            url: serveUrl,
            message: 'Profile picture uploaded and saved successfully'
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
