import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const notes = await db.meetingNote.findMany({
      include: { creator: { select: { username: true, profile_picture_url: true } } },
      orderBy: { created_at: 'desc' },
    })

    return NextResponse.json({
      success: true,
      notes: notes.map((n) => ({
        id: n.id.toString(),
        title: n.title,
        content: n.content,
        created_by: {
          id: n.created_by.toString(),
          username: n.creator.username,
          profile_picture_url: n.creator.profile_picture_url,
        },
        created_at: n.created_at.toISOString(),
        updated_at: n.updated_at.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error fetching meeting notes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch notes', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const { getAuthenticatedUser } = await import('@/lib/auth')
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const title = (body?.title || '').toString().trim()
    const content = (body?.content || '').toString().trim()

    if (!title || !content) {
      return NextResponse.json({ error: 'title and content are required' }, { status: 400 })
    }

    const created = await db.meetingNote.create({
      data: {
        title,
        content,
        created_by: auth.userId,
      },
      include: { creator: { select: { username: true, profile_picture_url: true } } },
    })

    return NextResponse.json(
      {
        success: true,
        note: {
          id: created.id.toString(),
          title: created.title,
          content: created.content,
          created_by: {
            id: created.created_by.toString(),
            username: created.creator.username,
            profile_picture_url: created.creator.profile_picture_url,
          },
          created_at: created.created_at.toISOString(),
          updated_at: created.updated_at.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating meeting note:', error)
    return NextResponse.json(
      { error: 'Failed to create note', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


