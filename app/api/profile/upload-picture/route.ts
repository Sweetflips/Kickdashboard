import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'

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

        // Check if user exists first
        const kickUserId = BigInt(userId)
        const existingUser = await db.user.findUnique({
            where: { kick_user_id: kickUserId },
            select: {
                id: true,
                username: true,
                custom_profile_picture_url: true,
            },
        })

        if (!existingUser) {
            console.warn(`   └─ ⚠️  User ${userId} not found in database`)
            return NextResponse.json(
                { error: 'User not found in database' },
                { status: 404 }
            )
        }

        console.log(`   ├─ User found: ${existingUser.username || 'Unknown'} (DB ID: ${existingUser.id})`)
        if (existingUser.custom_profile_picture_url && existingUser.custom_profile_picture_url.startsWith('https://')) {
            // Delete old Supabase file if exists
            const oldPath = existingUser.custom_profile_picture_url.split('/avatars/')[1]
            if (oldPath) {
                await supabase.storage.from('emotes').remove([`avatars/${oldPath}`]).catch(() => {})
            }
        }

        // Upload to Supabase Storage
        console.log('☁️  [SUPABASE] Uploading to Supabase Storage...')
        const fileExt = file.name.split('.').pop() || 'jpg'
        const fileName = `${userId}-${Date.now()}.${fileExt}`
        const filePath = `avatars/${fileName}`

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('emotes')
            .upload(filePath, buffer, {
                contentType: file.type,
                upsert: false
            })

        if (uploadError) {
            console.error(`   └─ ❌ Upload failed: ${uploadError.message}`)
            return NextResponse.json(
                { error: 'Failed to upload to Supabase Storage', details: uploadError.message },
                { status: 500 }
            )
        }

        console.log(`   ├─ File uploaded: ${filePath}`)

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('emotes')
            .getPublicUrl(filePath)

        console.log(`   ├─ Public URL: ${publicUrl}`)
        console.log(`   └─ ✅ Successfully uploaded to Supabase\n`)

        // Save URL to database
        console.log('🗄️  [DATABASE] Saving profile picture URL to database...')
        await db.user.update({
            where: { kick_user_id: kickUserId },
            data: { custom_profile_picture_url: publicUrl },
        })

        console.log(`   └─ ✅ Successfully saved to database\n`)

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`✅ [SUCCESS] Profile picture upload completed`)
        console.log(`   └─ Stored in Supabase Storage`)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

        return NextResponse.json({
            success: true,
            url: publicUrl,
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
