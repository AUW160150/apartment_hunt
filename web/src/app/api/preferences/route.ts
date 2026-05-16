import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { writeRejection, writeGeoOverride, searchUserContext } from '@/lib/gbrain'

// GET: load user prefs + Gbrain context summary
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const context = await searchUserContext(user.id)

  return NextResponse.json({ preferences: prefs, gbrainContext: context })
}

// POST: record feedback (rejection or geo override)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type, listingId, listingAddress, reason, area } = body

  if (type === 'rejection') {
    if (!listingId || !reason) {
      return NextResponse.json({ error: 'listingId and reason required' }, { status: 400 })
    }

    // Record in Supabase
    await supabase.from('user_feedback').insert({
      user_id: user.id,
      listing_id: listingId,
      action: 'rejected',
      reason,
    })

    // Update match status
    await supabase
      .from('listing_matches')
      .update({ status: 'passed' })
      .eq('user_id', user.id)
      .eq('listing_id', listingId)

    // Write to Gbrain
    await writeRejection({ userId: user.id, listingId, listingAddress, reason })

    return NextResponse.json({ ok: true })
  }

  if (type === 'geo_override') {
    if (!area || !reason) {
      return NextResponse.json({ error: 'area and reason required' }, { status: 400 })
    }
    await writeGeoOverride({ userId: user.id, area, reason })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}
