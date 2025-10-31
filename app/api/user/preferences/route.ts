import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const kickUserId = searchParams.get('kick_user_id')

        if (!kickUserId) {
            return NextResponse.json(
                { error: 'kick_user_id is required' },
                { status: 400 }
            )
        }

        // Validate kickUserId is a valid number
        let kickUserIdBigInt
        try {
            kickUserIdBigInt = BigInt(kickUserId)
        } catch (error) {
            return NextResponse.json(
                { error: 'Invalid kick_user_id format' },
                { status: 400 }
            )
        }

        let user
        try {
            user = await db.user.findUnique({
                where: { kick_user_id: kickUserIdBigInt },
                select: {
                    kick_user_id: true,
                    username: true,
                    email: true,
                    profile_picture_url: true,
                    custom_profile_picture_url: true,
                    notifications_enabled: true,
                    email_notifications_enabled: true,
                    chat_font_size: true,
                    chat_show_timestamps: true,
                },
            })
        } catch (dbError) {
            console.error('Database error fetching user preferences:', dbError)
            throw dbError
        }

        // If user doesn't exist, return default values instead of error
        if (!user) {
            return NextResponse.json({
                kick_user_id: kickUserId,
                username: null,
                email: null,
                profile_picture_url: null,
                custom_profile_picture_url: null,
                notifications_enabled: true,
                email_notifications_enabled: false,
                chat_font_size: '14px',
                chat_show_timestamps: true,
            })
        }

        return NextResponse.json({
            kick_user_id: user.kick_user_id.toString(),
            username: user.username,
            email: user.email,
            profile_picture_url: user.profile_picture_url,
            custom_profile_picture_url: user.custom_profile_picture_url,
            notifications_enabled: user.notifications_enabled,
            email_notifications_enabled: user.email_notifications_enabled,
            chat_font_size: user.chat_font_size,
            chat_show_timestamps: user.chat_show_timestamps,
        })
    } catch (error) {
        console.error('Error fetching user preferences:', error)
        return NextResponse.json(
            { error: 'Failed to fetch preferences', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json()
        const {
            kick_user_id,
            custom_profile_picture_url,
            notifications_enabled,
            email_notifications_enabled,
            chat_font_size,
            chat_show_timestamps,
        } = body

        if (!kick_user_id) {
            return NextResponse.json(
                { error: 'kick_user_id is required' },
                { status: 400 }
            )
        }

        const updateData: any = {}
        if (custom_profile_picture_url !== undefined) updateData.custom_profile_picture_url = custom_profile_picture_url
        if (notifications_enabled !== undefined) updateData.notifications_enabled = notifications_enabled
        if (email_notifications_enabled !== undefined) updateData.email_notifications_enabled = email_notifications_enabled
        if (chat_font_size !== undefined) updateData.chat_font_size = chat_font_size
        if (chat_show_timestamps !== undefined) updateData.chat_show_timestamps = chat_show_timestamps

        const user = await db.user.update({
            where: { kick_user_id: BigInt(kick_user_id) },
            data: updateData,
            select: {
                kick_user_id: true,
                custom_profile_picture_url: true,
                notifications_enabled: true,
                email_notifications_enabled: true,
                chat_font_size: true,
                chat_show_timestamps: true,
            },
        })

        return NextResponse.json({
            success: true,
            preferences: {
                kick_user_id: user.kick_user_id.toString(),
                custom_profile_picture_url: user.custom_profile_picture_url,
                notifications_enabled: user.notifications_enabled,
                email_notifications_enabled: user.email_notifications_enabled,
                chat_font_size: user.chat_font_size,
                chat_show_timestamps: user.chat_show_timestamps,
            },
        })
    } catch (error) {
        console.error('Error updating user preferences:', error)
        return NextResponse.json(
            { error: 'Failed to update preferences', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
