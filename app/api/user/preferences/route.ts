import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(request: Request) {
    try {
        // SECURITY: Require authentication
        const auth = await getAuthenticatedUser(request)
        if (!auth) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Only fetch preferences for the authenticated user
        const user = await db.user.findUnique({
            where: { kick_user_id: auth.kickUserId },
            select: {
                kick_user_id: true,
                username: true,
                // NOTE: email intentionally excluded - not needed for preferences
                profile_picture_url: true,
                custom_profile_picture_url: true,
                notifications_enabled: true,
                email_notifications_enabled: true,
                chat_font_size: true,
                chat_show_timestamps: true,
            },
        })

        // If user doesn't exist, return default values
        if (!user) {
            return NextResponse.json({
                kick_user_id: auth.kickUserId.toString(),
                username: null,
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
        // SECURITY: Require authentication
        const auth = await getAuthenticatedUser(request)
        if (!auth) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const body = await request.json()
        const {
            // NOTE: kick_user_id from body is intentionally IGNORED
            // Users can only modify their own preferences
            custom_profile_picture_url,
            notifications_enabled,
            email_notifications_enabled,
            chat_font_size,
            chat_show_timestamps,
        } = body

        const updateData: any = {}
        if (custom_profile_picture_url !== undefined) updateData.custom_profile_picture_url = custom_profile_picture_url
        if (notifications_enabled !== undefined) updateData.notifications_enabled = notifications_enabled
        if (email_notifications_enabled !== undefined) updateData.email_notifications_enabled = email_notifications_enabled
        if (chat_font_size !== undefined) updateData.chat_font_size = chat_font_size
        if (chat_show_timestamps !== undefined) updateData.chat_show_timestamps = chat_show_timestamps

        // Only update the authenticated user's preferences
        const user = await db.user.update({
            where: { kick_user_id: auth.kickUserId },
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
