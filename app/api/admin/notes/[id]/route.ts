import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteParams = { params: { id: string } }

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Missing note id' }, { status: 400 })

    const body = await request.json()
    const titleRaw = body?.title
    const contentRaw = body?.content

    const data: { title?: string; content?: string } = {}
    if (titleRaw !== undefined) {
      const title = String(titleRaw).trim()
      if (!title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
      data.title = title
    }
    if (contentRaw !== undefined) {
      const content = String(contentRaw).trim()
      if (!content) return NextResponse.json({ error: 'content cannot be empty' }, { status: 400 })
      data.content = content
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const updated = await db.meetingNote.update({
      where: { id: BigInt(id) },
      data,
      include: { creator: { select: { username: true, profile_picture_url: true } } },
    })

    return NextResponse.json({
      success: true,
      note: {
        id: updated.id.toString(),
        title: updated.title,
        content: updated.content,
        created_by: {
          id: updated.created_by.toString(),
          username: updated.creator.username,
          profile_picture_url: updated.creator.profile_picture_url,
        },
        created_at: updated.created_at.toISOString(),
        updated_at: updated.updated_at.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error updating meeting note:', error)
    return NextResponse.json(
      { error: 'Failed to update note', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Missing note id' }, { status: 400 })

    await db.meetingNote.delete({ where: { id: BigInt(id) } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting meeting note:', error)
    return NextResponse.json(
      { error: 'Failed to delete note', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


